# Team contributions

> Fill in the names and your own percentages. The ownership below comes from `CONTEXT.md` section 2 and the folder structure; the git history
> is the evidence (`git shortlog -sn --all`, `git log --author="Name" --stat`). Do not claim work the history does not show.

## Roles and ownership

| Member | Name | Role | Owns (folders) | Main deliverables |
|---|---|---|---|---|
| A | _fill in_ | Data / ML lead | `ml-service/training/`, `ml-service/notebooks/`, `ml-service/artifacts/` | dataset cleaning to parquet, leakage analysis, two-stage target, time split, features and lookups, four model families, regressor, isotonic calibration, metrics JSON and manifest, SHAP background, 7 notebooks, `docs/ml-methodology.md` |
| B | _fill in_ | ML service engineer | `ml-service/app/`, `ml-service/tests/` | FastAPI contract, startup loading and fail-fast checks, predictor, SHAP explainer, DuckDB analytics, auth guard, 49 tests, Docker image |
| C | _fill in_ | Backend engineer | `server/` | auth and JWT, live-data orchestration, Mongo cache with stale-if-error, quota counter, demo fallback, rate limiting, bulk CSV, saved searches and alerts, admin, 87 tests, `docs/api-spec.md`, `docs/db-schema.md` |
| D | _fill in_ | Frontend engineer | `client/` | theme system, auth flow, 14 pages, charts, risk map, gauge and SHAP view, accessibility, 67 tests, PWA |

Shared: architecture and decisions (`docs/CONTEXT.md`, `docs/architecture.md`), CI/CD and deployment, documentation, the report.

## Contribution record (complete from git)

| Member | Commits | Lines added | Pull requests / reviews | Tasks completed | Estimated share |
|---|---|---|---|---|---|
| A | | | | | % |
| B | | | | | % |
| C | | | | | % |
| D | | | | | % |

Useful commands:

```powershell
git shortlog -sn --all
git log --author="Name" --pretty=tformat: --numstat | ForEach-Object { $_ } | Measure-Object
```

## Meetings and decisions

| Date | Topic | Decision | Recorded in |
|---|---|---|---|
| | Dataset and target definition | two-stage target, diverted excluded | CONTEXT section 4 (decision 4) |
| | Validation strategy | time-based split, September for calibration | CONTEXT section 4 (decision 5) |
| | Auth approach | single 12 h JWT, no refresh tokens | CONTEXT section 4 (decision 2) |

## Tools and external help

List the tools used and how, per your institution's policy (for example: Kaggle dataset, AviationStack, Open-Meteo, scikit-learn, XGBoost,
SHAP, React, Express; any AI coding assistant used for generation, review or testing). _Fill in._

## Individual reflection (each member, 5-8 lines)

- What I built, and one thing I got wrong first and how I found out.
- What I would do differently.
