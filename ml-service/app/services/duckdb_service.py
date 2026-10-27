"""Historical search + EDA aggregates over the processed parquet (Decision 1).

The flights parquet (about 145 MB, not in git) may be absent in a slim deployment: `available` is False and the
analytics routes answer 503 instead of crashing the service. All user input goes through bound parameters.
Aggregates over the static 2023 data never change, so they are cached for the process lifetime.
"""
import json
import threading
from datetime import date
from pathlib import Path

import duckdb
import pandas as pd

from app.utils.logger import get_logger

log = get_logger("duckdb")

DELAYED = "arr_delay >= 15"
DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
CAUSES = {"delay_carrier": "Carrier", "delay_weather": "Weather", "delay_nas": "National Air System",
          "delay_security": "Security", "delay_last_aircraft": "Late-arriving aircraft"}


def _records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", date_format="iso"))


class DuckDBService:
    def __init__(self, parquet_dir: Path, airports_csv: Path, memory_limit: str = "1GB", threads: int = 2):
        self.glob = (Path(parquet_dir) / "flights" / "flights_*.parquet").as_posix()
        self.airports_csv = Path(airports_csv).as_posix()
        self.available = any((Path(parquet_dir) / "flights").glob("flights_*.parquet"))
        self._cache: dict = {}
        self._lock = threading.Lock()
        self._con = duckdb.connect()
        self._con.execute(f"SET memory_limit='{memory_limit}'")
        self._con.execute(f"SET threads={int(threads)}")
        if self.available:
            log.info("analytics over %s", self.glob)
        else:
            log.warning("no flights parquet under %s: /analytics/* will answer 503", parquet_dir)

    # ------------------------------------------------------------------ helpers
    def _df(self, sql: str, params: list | None = None) -> pd.DataFrame:
        cur = self._con.cursor()                   # one cursor per call: safe under the FastAPI threadpool
        try:
            return cur.execute(sql.replace("{F}", f"read_parquet('{self.glob}')"), params or []).df()
        finally:
            cur.close()

    def _cached(self, key, fn):
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        val = fn()
        with self._lock:
            self._cache[key] = val
        return val

    # ------------------------------------------------------------------ overview
    def overview(self) -> dict:
        return self._cached("overview", self._overview)

    def _overview(self) -> dict:
        d = self._df
        rate = f"avg(({DELAYED})::INT) FILTER (WHERE is_cancelled=0)"
        totals = d(f"""SELECT count(*) flights, sum(is_cancelled)::BIGINT cancelled,
                       sum(({DELAYED})::INT)::BIGINT delayed, round({rate},4) delay_rate,
                       round(avg(is_cancelled),4) cancel_rate,
                       round(avg(arr_delay) FILTER (WHERE {DELAYED}),1) avg_delay_minutes_when_delayed,
                       count(DISTINCT origin) airports, count(DISTINCT airline) airlines,
                       min(flight_date)::VARCHAR first_date, max(flight_date)::VARCHAR last_date FROM {{F}}""")
        by_airline = d(f"""SELECT airline, count(*) flights, round({rate},4) delay_rate, round(avg(is_cancelled),4) cancel_rate
                       FROM {{F}} GROUP BY 1 ORDER BY delay_rate DESC""")
        by_airport = d(f"""SELECT origin airport, count(*) flights, round({rate},4) delay_rate, round(avg(is_cancelled),4) cancel_rate
                       FROM {{F}} GROUP BY 1 ORDER BY flights DESC LIMIT 25""")
        by_month = d(f"""SELECT month, count(*) flights, round({rate},4) delay_rate, round(avg(is_cancelled),4) cancel_rate
                       FROM {{F}} GROUP BY 1 ORDER BY 1""")
        by_dow = d(f"""SELECT day_of_week, count(*) flights, round({rate},4) delay_rate, round(avg(is_cancelled),4) cancel_rate
                       FROM {{F}} GROUP BY 1 ORDER BY 1""")
        by_dow["day"] = by_dow["day_of_week"].map(lambda i: DOW_NAMES[int(i)])
        by_time = d(f"""SELECT dep_time_label time_of_day, count(*) flights, round({rate},4) delay_rate,
                       round(avg(is_cancelled),4) cancel_rate FROM {{F}} GROUP BY 1
                       ORDER BY array_position(['Night','Morning','Afternoon','Evening'], dep_time_label)""")
        weather = d(f"""
            SELECT 'precipitation' dimension, CASE WHEN o_prcp<0.1 THEN '0 dry' WHEN o_prcp<5 THEN '1 light' WHEN o_prcp<15 THEN '2 moderate' ELSE '3 heavy' END band,
                   count(*) flights, round({rate},4) delay_rate, round(avg(is_cancelled),4) cancel_rate FROM {{F}} GROUP BY 2
            UNION ALL
            SELECT 'wind', CASE WHEN o_wspd<20 THEN '0 calm' WHEN o_wspd<30 THEN '1 breezy' WHEN o_wspd<45 THEN '2 windy' ELSE '3 strong' END,
                   count(*), round({rate},4), round(avg(is_cancelled),4) FROM {{F}} GROUP BY 2
            UNION ALL
            SELECT 'snow', CASE WHEN o_snow<1 THEN '0 none' WHEN o_snow<25 THEN '1 light' WHEN o_snow<75 THEN '2 moderate' ELSE '3 heavy' END,
                   count(*), round({rate},4), round(avg(is_cancelled),4) FROM {{F}} GROUP BY 2
            ORDER BY 1, 2""")
        sums = ", ".join(f"sum({c})::BIGINT AS {c}" for c in CAUSES)
        row = d(f"SELECT {sums} FROM {{F}} WHERE is_cancelled=0 AND {DELAYED}").iloc[0]
        total = float(sum(row))
        causes = pd.DataFrame([{"cause": CAUSES[c], "minutes": int(row[c]), "share": round(float(row[c]) / total, 4)} for c in CAUSES])
        return {"totals": _records(totals)[0], "by_airline": _records(by_airline), "by_airport": _records(by_airport),
                "by_month": _records(by_month), "by_day_of_week": _records(by_dow), "by_time_of_day": _records(by_time),
                "by_weather": _records(weather), "delay_causes": _records(causes)}

    # ------------------------------------------------------------------ historical search
    def historical(self, origin: str | None, dest: str | None, day: date | None, airline: str | None, limit: int) -> dict:
        where, params = ["1=1"], []
        for col, val in (("origin", origin), ("dest", dest), ("airline", airline)):
            if val:
                where.append(f"{col} = ?")
                params.append(val)
        if day:
            where.append("flight_date = ?")
            params.append(day.isoformat())
        w = " AND ".join(where)
        summary = self._df(f"""SELECT count(*) flights, sum(is_cancelled)::BIGINT cancelled,
              round(avg(({DELAYED})::INT) FILTER (WHERE is_cancelled=0),4) delay_rate,
              round(avg(is_cancelled),4) cancel_rate,
              round(avg(arr_delay) FILTER (WHERE is_cancelled=0),1) avg_arrival_delay,
              round(quantile_cont(arr_delay, 0.9) FILTER (WHERE is_cancelled=0),1) p90_arrival_delay
              FROM {{F}} WHERE {w}""", params)
        flights = self._df(f"""SELECT flight_date::VARCHAR flight_date, airline, tail_number, origin, dest, dep_time_label,
              is_cancelled, arr_delay, dep_delay, delay_carrier, delay_weather, delay_nas, delay_security, delay_last_aircraft,
              distance_miles FROM {{F}} WHERE {w} ORDER BY flight_date DESC, dep_time_label LIMIT {int(limit)}""", params)
        by_airline = self._df(f"""SELECT airline, count(*) flights, round(avg(({DELAYED})::INT) FILTER (WHERE is_cancelled=0),4) delay_rate,
              round(avg(is_cancelled),4) cancel_rate FROM {{F}} WHERE {w} GROUP BY 1 ORDER BY flights DESC LIMIT 15""", params)
        s = _records(summary)[0]
        s["returned"] = len(flights)
        return {"summary": s, "flights": _records(flights), "by_airline": _records(by_airline)}

    # ------------------------------------------------------------------ risk map
    def risk_map(self, min_flights: int = 3000) -> dict:
        return self._cached(("risk", min_flights), lambda: self._risk_map(min_flights))

    def _risk_map(self, min_flights: int) -> dict:
        df = self._df(f"""SELECT f.origin airport, a.name, a.city, a.state, a.lat, a.lon, f.flights, f.delay_rate, f.cancel_rate, f.avg_departure_delay
            FROM (SELECT origin, count(*) flights, round(avg(({DELAYED})::INT) FILTER (WHERE is_cancelled=0),4) delay_rate,
                         round(avg(is_cancelled),4) cancel_rate, round(avg(dep_delay) FILTER (WHERE is_cancelled=0),1) avg_departure_delay
                  FROM {{F}} GROUP BY 1 HAVING count(*) >= {int(min_flights)}) f
            JOIN read_csv_auto('{self.airports_csv}') a ON a.iata = f.origin ORDER BY f.delay_rate DESC""")
        return {"airports": _records(df)}

    # ------------------------------------------------------------------ trends
    def trends(self, granularity: str, origin: str | None, airline: str | None) -> dict:
        return self._cached(("trends", granularity, origin, airline), lambda: self._trends(granularity, origin, airline))

    def _trends(self, granularity: str, origin: str | None, airline: str | None) -> dict:
        trunc = {"day": "flight_date", "week": "date_trunc('week', flight_date)", "month": "date_trunc('month', flight_date)"}[granularity]
        where, params = ["1=1"], []
        if origin:
            where.append("origin = ?"); params.append(origin)
        if airline:
            where.append("airline = ?"); params.append(airline)
        df = self._df(f"""SELECT period::DATE::VARCHAR AS date, flights, delay_rate, cancel_rate,
               round(avg(delay_rate) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),4) delay_rate_ma7
            FROM (SELECT {trunc} period, count(*) flights, round(avg(({DELAYED})::INT) FILTER (WHERE is_cancelled=0),4) delay_rate,
                         round(avg(is_cancelled),4) cancel_rate FROM {{F}} WHERE {' AND '.join(where)} GROUP BY 1) ORDER BY period""", params)
        return {"granularity": granularity, "points": _records(df)}
