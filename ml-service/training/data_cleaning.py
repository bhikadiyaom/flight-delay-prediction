"""CSV -> parquet conversion and cleaning, done in DuckDB (the full CSV is never loaded in pandas).

    python -m training.data_cleaning --to-parquet

Produces in data/processed/:
  flights/flights_MM.parquet  one file per month; one row per flight (non-diverted), joined with
                              origin/destination daily weather and distance. Read with the glob in config.FLIGHTS_GLOB.
  weather_daily.parquet       daily weather per airport
  airports.parquet            IATA, name, city, state, lat, lon

Processing is month by month with a capped memory limit (the dev machine has ~8 GB RAM).

Cleaning rules (docs/CONTEXT.md section 9):
  * diverted flights excluded (Decision 4); cancelled flights kept with arr_delay NULL
  * exact duplicate rows dropped; impossible arr_delay / flight_duration rows dropped; bad aircraft age -> NULL
  * weather NULLs (airport has no weather row) -> airport-month median, then month median, plus *_weather_missing flag
  * delay-cause NULLs -> 0 (used for EDA only, never modelled)
"""
import argparse
import logging
import time

import duckdb

from training import config as C

log = logging.getLogger("data_cleaning")


def _q(path) -> str:
    return str(path).replace("\\", "/")


COMMON = """
    FlightDate::DATE AS flight_date, Airline AS airline, Tail_Number AS tail_number,
    Dep_Airport AS origin, Arr_Airport AS dest, DepTime_label AS dep_time_label,
    Arr_Delay::DOUBLE AS arr_delay, Dep_Delay::DOUBLE AS dep_delay, Flight_Duration::DOUBLE AS flight_duration,
    Delay_Carrier::DOUBLE AS delay_carrier, Delay_Weather::DOUBLE AS delay_weather,
    Delay_NAS::DOUBLE AS delay_nas, Delay_Security::DOUBLE AS delay_security,
    Delay_LastAircraft::DOUBLE AS delay_last_aircraft"""


def _wcols(prefix: str, alias: str) -> str:
    return ", ".join(
        f"coalesce({alias}.{v}, am_{alias}.{v}, m_{alias}.{v}) AS {prefix}_{v}" for v in C.WEATHER_VARS)


def _wjoin(alias: str, key: str) -> str:
    return f"""
        LEFT JOIN weather {alias} ON {alias}.airport = f.{key} AND {alias}.date = f.flight_date
        LEFT JOIN w_am am_{alias} ON am_{alias}.airport = f.{key} AND am_{alias}.month = month(f.flight_date)
        LEFT JOIN w_m  m_{alias}  ON m_{alias}.month = month(f.flight_date)"""


def to_parquet() -> dict:
    C.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    C.FLIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    for p in (C.RAW_FLIGHTS_CSV, C.RAW_CANCELLED_CSV, C.RAW_WEATHER_CSV, C.RAW_AIRPORTS_CSV):
        if not p.exists():
            raise FileNotFoundError(f"missing raw file: {p}")

    con = duckdb.connect()
    con.execute(f"SET temp_directory='{_q(C.PROCESSED_DIR / '.duckdb_tmp')}'")
    con.execute("SET memory_limit='1500MB'")
    con.execute("SET threads=2")
    con.execute("SET preserve_insertion_order=false")
    t0 = time.time()
    stats = {"raw_rows": 0, "raw_diverted_excluded": 0, "clean_rows": 0}

    # ---- weather + airports (small) -------------------------------------------------------
    con.execute(f"""
        CREATE TABLE weather AS
        SELECT airport_id AS airport, time::DATE AS date, month(time::DATE) AS month,
               tavg::FLOAT tavg, tmin::FLOAT tmin, tmax::FLOAT tmax, prcp::FLOAT prcp, snow::FLOAT snow,
               wdir::FLOAT wdir, wspd::FLOAT wspd, pres::FLOAT pres
        FROM read_csv_auto('{_q(C.RAW_WEATHER_CSV)}')""")
    con.execute(f"""
        CREATE TABLE airports AS
        SELECT IATA_CODE AS iata, AIRPORT AS name, CITY AS city, STATE AS state,
               LATITUDE::DOUBLE AS lat, LONGITUDE::DOUBLE AS lon
        FROM read_csv_auto('{_q(C.RAW_AIRPORTS_CSV)}')""")
    agg = ", ".join(f"median({v}) AS {v}" for v in C.WEATHER_VARS)
    con.execute(f"CREATE TABLE w_am AS SELECT airport, month, {agg} FROM weather GROUP BY airport, month")
    con.execute(f"CREATE TABLE w_m AS SELECT month, {agg} FROM weather GROUP BY month")

    # ---- flights, one month at a time -----------------------------------------------------
    lo, hi = C.ARR_DELAY_RANGE
    alo, ahi = C.AIRCRAFT_AGE_RANGE
    main_csv, canc_csv = _q(C.RAW_FLIGHTS_CSV), _q(C.RAW_CANCELLED_CSV)
    for month in range(1, 13):
        lo_d, hi_d = f"2023-{month:02d}-01", (f"2023-{month + 1:02d}-01" if month < 12 else "2024-01-01")
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE raw AS
            SELECT * FROM (
                SELECT {COMMON}, 0::TINYINT AS is_cancelled, 0::TINYINT AS is_diverted,
                       Manufacturer AS manufacturer, Model AS model, Aicraft_age::DOUBLE AS aircraft_age
                FROM read_csv_auto('{main_csv}', sample_size=200000)
                UNION ALL BY NAME
                SELECT {COMMON}, Cancelled::TINYINT AS is_cancelled, Diverted::TINYINT AS is_diverted
                FROM read_csv_auto('{canc_csv}', sample_size=200000)
            ) WHERE flight_date >= DATE '{lo_d}' AND flight_date < DATE '{hi_d}'""")
        n_raw, n_div = con.execute("SELECT count(*), count(*) FILTER (WHERE is_diverted=1) FROM raw").fetchone()

        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE clean AS
            SELECT * REPLACE (
                CASE WHEN is_cancelled=1 THEN NULL ELSE arr_delay END AS arr_delay,
                CASE WHEN aircraft_age BETWEEN {alo} AND {ahi} THEN aircraft_age END AS aircraft_age,
                coalesce(delay_carrier,0) AS delay_carrier, coalesce(delay_weather,0) AS delay_weather,
                coalesce(delay_nas,0) AS delay_nas, coalesce(delay_security,0) AS delay_security,
                coalesce(delay_last_aircraft,0) AS delay_last_aircraft)
            FROM (SELECT DISTINCT * FROM raw WHERE is_diverted=0)
            WHERE origin IS NOT NULL AND dest IS NOT NULL AND airline IS NOT NULL
              AND (is_cancelled=1 OR (arr_delay BETWEEN {lo} AND {hi} AND coalesce(flight_duration,1) > 0))""")
        n_clean = con.execute("SELECT count(*) FROM clean").fetchone()[0]

        out = _q(C.FLIGHTS_DIR / f"flights_{month:02d}.parquet")
        con.execute(f"""
            COPY (
                SELECT f.*,
                       month(f.flight_date)::TINYINT AS month,
                       dayofweek(f.flight_date)::TINYINT AS day_of_week,
                       (3958.8 * 2 * asin(sqrt(
                           pow(sin(radians(ad.lat - ao.lat) / 2), 2) +
                           cos(radians(ao.lat)) * cos(radians(ad.lat)) *
                           pow(sin(radians(ad.lon - ao.lon) / 2), 2))))::FLOAT AS distance_miles,
                       (wo.tavg IS NULL)::TINYINT AS origin_weather_missing,
                       (wd.tavg IS NULL)::TINYINT AS dest_weather_missing,
                       {_wcols('o', 'wo')}, {_wcols('d', 'wd')}
                FROM clean f
                LEFT JOIN airports ao ON ao.iata = f.origin
                LEFT JOIN airports ad ON ad.iata = f.dest
                {_wjoin('wo', 'origin')}
                {_wjoin('wd', 'dest')}
                ORDER BY f.flight_date
            ) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
        stats["raw_rows"] += n_raw
        stats["raw_diverted_excluded"] += n_div
        stats["clean_rows"] += n_clean
        log.info("month %02d raw=%d diverted=%d kept=%d", month, n_raw, n_div, n_clean)

    stats["duplicates_and_invalid_dropped"] = (
        stats["raw_rows"] - stats["raw_diverted_excluded"] - stats["clean_rows"])
    con.execute(f"COPY weather TO '{_q(C.WEATHER_PARQUET)}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.execute(f"COPY airports TO '{_q(C.AIRPORTS_PARQUET)}' (FORMAT PARQUET, COMPRESSION ZSTD)")

    # ---- summary ----------------------------------------------------------------------------
    (stats["final_rows"], stats["cancelled"], stats["delayed_ge15"],
     stats["null_distance"], stats["weather_missing"]) = con.execute(f"""
        SELECT count(*), sum(is_cancelled), sum((arr_delay >= {C.DELAY_THRESHOLD_MIN})::INT),
               count(*) FILTER (WHERE distance_miles IS NULL),
               count(*) FILTER (WHERE origin_weather_missing=1 OR dest_weather_missing=1)
        FROM read_parquet('{_q(C.FLIGHTS_GLOB)}')""").fetchone()
    stats["seconds"] = round(time.time() - t0, 1)
    return stats


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--to-parquet", action="store_true", help="convert + clean raw CSVs to parquet")
    args = ap.parse_args()
    if not args.to_parquet:
        ap.error("nothing to do; pass --to-parquet")
    for k, v in to_parquet().items():
        log.info("%-34s %s", k, v)


if __name__ == "__main__":
    main()
