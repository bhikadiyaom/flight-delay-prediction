"""Single source of truth for dataset columns, paths and training constants.

Column names are the REAL headers of the Kaggle files (verified 2023-10-27 against
bordanova/2023-us-civil-flights-delay-meteo-and-aircraft). The dataset differs from the
original design: weather is a separate DAILY file, there is no scheduled clock time (only a
time-of-day label), no flight number, no visibility, and cancelled/diverted flights live in a
second file. See docs/CONTEXT.md section 15.
"""
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = ML_DIR.parent
DATA_DIR = ROOT_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
EXTERNAL_DIR = DATA_DIR / "external"
ARTIFACTS_DIR = ML_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
ENCODERS_DIR = ARTIFACTS_DIR / "encoders"
LOOKUPS_DIR = ARTIFACTS_DIR / "lookups"
METRICS_DIR = ARTIFACTS_DIR / "metrics"

# ---------------------------------------------------------------- raw source files
RAW_FLIGHTS_CSV = DATA_DIR / "US_flights_2023.csv"            # non-cancelled, non-diverted flights
RAW_CANCELLED_CSV = DATA_DIR / "Cancelled_Diverted_2023.csv"  # cancelled + diverted flights
RAW_WEATHER_CSV = DATA_DIR / "weather_meteo_by_airport.csv"   # daily weather per airport
RAW_AIRPORTS_CSV = DATA_DIR / "airports_geolocation.csv"      # IATA, lat, lon
# data/maj us flight - january 2024.csv is intentionally ignored (same header as the main file,
# misleading name; first rows identical to US_flights_2023.csv).

# ---------------------------------------------------------------- processed outputs
FLIGHTS_DIR = PROCESSED_DIR / "flights"                       # flights_01.parquet ... flights_12.parquet
FLIGHTS_GLOB = FLIGHTS_DIR / "flights_*.parquet"
WEATHER_PARQUET = PROCESSED_DIR / "weather_daily.parquet"
AIRPORTS_PARQUET = PROCESSED_DIR / "airports.parquet"

# ---------------------------------------------------------------- raw column groups (CSV headers)
RAW_IDENTIFIERS = ["Tail_Number"]
RAW_ROUTE = ["Dep_Airport", "Dep_CityName", "Arr_Airport", "Arr_CityName"]
RAW_SCHEDULED = ["FlightDate", "Day_Of_Week", "DepTime_label", "Airline"]  # known before departure
RAW_OUTCOMES = ["Arr_Delay", "Cancelled", "Diverted"]
RAW_DELAY_CAUSE = ["Delay_Carrier", "Delay_Weather", "Delay_NAS", "Delay_Security", "Delay_LastAircraft"]
RAW_LEAKAGE = [  # not known before departure -> never features
    "Dep_Delay", "Dep_Delay_Tag", "Dep_Delay_Type", "Arr_Delay_Type", "Flight_Duration",
    *RAW_DELAY_CAUSE,
]
RAW_WEATHER = ["tavg", "tmin", "tmax", "prcp", "snow", "wdir", "wspd", "pres"]
RAW_AIRCRAFT = ["Manufacturer", "Model", "Aicraft_age"]  # note: source typo "Aicraft_age"

# ---------------------------------------------------------------- processed columns (parquet)
WEATHER_VARS = RAW_WEATHER
LEAKAGE_COLS = ["dep_delay", "flight_duration", *["delay_carrier", "delay_weather", "delay_nas",
                                                  "delay_security", "delay_last_aircraft"]]
DELAY_CAUSE_COLS = ["delay_carrier", "delay_weather", "delay_nas", "delay_security", "delay_last_aircraft"]
OUTCOME_COLS = ["is_cancelled", "is_diverted", "arr_delay"]

# ---------------------------------------------------------------- cleaning / target rules
DELAY_THRESHOLD_MIN = 15          # is_delayed = arr_delay >= 15 on non-cancelled flights
ARR_DELAY_RANGE = (-180, 3000)    # impossible values outside this are dropped
AIRCRAFT_AGE_RANGE = (0, 60)      # outside -> NULL
REGRESSOR_WINSOR_PCT = 0.99       # regressor target winsorized at p99
DEP_TIME_LABELS = ["Night", "Morning", "Afternoon", "Evening"]

# ---------------------------------------------------------------- split (Decision 5)
TRAIN_MONTHS = list(range(1, 10))   # Jan-Sep
VALID_MONTH = 9                     # September = end of train, used for tuning + calibration
TEST_MONTHS = [10, 11, 12]
RANDOM_STATE = 42
