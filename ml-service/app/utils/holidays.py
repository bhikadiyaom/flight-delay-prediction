"""US federal holidays for any year (rule based, no external dependency).

Used by feature_builder for the holiday flag and distance-to-nearest-holiday feature.
"""
from datetime import date, timedelta
from functools import lru_cache


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """n-th (1-based) given weekday (Mon=0) of a month."""
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def _last_weekday(year: int, month: int, weekday: int) -> date:
    d = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _observed(d: date) -> date:
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


@lru_cache(maxsize=None)
def us_federal_holidays(year: int) -> dict[date, str]:
    fixed = {
        "New Year's Day": date(year, 1, 1),
        "Juneteenth": date(year, 6, 19),
        "Independence Day": date(year, 7, 4),
        "Veterans Day": date(year, 11, 11),
        "Christmas Day": date(year, 12, 25),
    }
    out = {_observed(d): name for name, d in fixed.items()}
    out[_nth_weekday(year, 1, 0, 3)] = "Martin Luther King Jr. Day"
    out[_nth_weekday(year, 2, 0, 3)] = "Presidents Day"
    out[_last_weekday(year, 5, 0)] = "Memorial Day"
    out[_nth_weekday(year, 9, 0, 1)] = "Labor Day"
    out[_nth_weekday(year, 10, 0, 2)] = "Columbus Day"
    out[_nth_weekday(year, 11, 3, 4)] = "Thanksgiving"
    return out


def holiday_distance(d: date, max_days: int = 7) -> int:
    """Days to the nearest US federal holiday (0 = on a holiday), clipped to max_days."""
    best = max_days
    for year in (d.year - 1, d.year, d.year + 1):
        for h in us_federal_holidays(year):
            best = min(best, abs((h - d).days))
    return best
