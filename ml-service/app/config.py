"""Service settings (env vars, see docs/CONTEXT.md section 12). Relative paths resolve against ml-service/, not the CWD."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ML_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ML_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    internal_api_key: str
    artifacts_dir: Path = Path("./artifacts")
    parquet_dir: Path = Path("../data/processed")
    external_dir: Path = Path("../data/external")
    log_level: str = "INFO"
    duckdb_memory_limit: str = "1GB"
    duckdb_threads: int = 2

    def resolved(self, p: Path) -> Path:
        return p if p.is_absolute() else (ML_DIR / p).resolve()

    @property
    def artifacts_path(self) -> Path:
        return self.resolved(self.artifacts_dir)

    @property
    def parquet_path(self) -> Path:
        return self.resolved(self.parquet_dir)

    @property
    def external_path(self) -> Path:
        return self.resolved(self.external_dir)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if len(s.internal_api_key) < 16:
        raise RuntimeError("INTERNAL_API_KEY must be at least 16 characters")
    return s
