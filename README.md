# Monsoon Mandate

**Helios Pane dashboard | Briefwright assistant | Mandate 2030 Sovereign Brief**

One Next.js / FastAPI application over the five supplied competition datasets and
the team's validated Q1, Q2 and Q3 artifacts. No external datasets, hosted LLM,
pretrained external model, or startup retraining is used.

## Run

From the repository root, create a compatible environment and start FastAPI:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd dashboard
npm install
npm run build
npm run start
```

Open http://localhost:3000. API documentation: http://127.0.0.1:8000/docs.
`NEXT_PUBLIC_API_BASE_URL` selects the API URL at dashboard build time.
`MONSOON_CORS_ORIGINS` is a comma-separated backend setting; defaults permit
localhost and 127.0.0.1 on port 3000. Restart older backends after updating code.
`/health` validates artifact loading and reports component readiness honestly.
Supervisor route/agent/status traces are written to backend logs.

## Analytical boundaries

| Layer | Connected source | Meaning |
| --- | --- | --- |
| Q1.1 | Five saved ARIMA models; backend/data/carbon | Validated 30 trading-day carbon forecast, 95% intervals, rolling-origin and true 30-step evidence |
| Q1.2 | final_random_forest_co2_per_capita.pkl + final_features.pkl | Submitted energy mix to tonnes CO2/person; exact 16-feature notebook pipeline; cached model |
| Q2 | backend/data/q2 and saved Ridge packages | Baseline versus event-aware experiment; negligible predictive improvement; contextual evidence |
| Q3 | backend/models/q3 (actual supplied location) | Country transition archetypes and conditional 2026-2030 scenarios, not probabilities |
| Observed | Dataset/*.csv, five named competition files | Country emissions, energy shares, carbon history, events, global temperature and provenance |

Q1.2 final test R-squared is 0.3409, RMSE 5.5967 and MAE 3.5645 t/person,
read from the validated package. scikit-learn is pinned to 1.6.1; ARIMA loading
uses statsmodels 0.14.5. The application serves saved ARIMA outputs rather than
regenerating them on requests. Q2 saved models are validated, while its UI serves
the actual experiment outputs rather than an invented event forecast.

**Custom simulator plans are single RF estimates at the latest observed reference
year (2026), not 2027-2030 predictions.** The selected future year controls Q3 KPI
cards, while the graph retains all annual Q3 points through 2030. Changing an
input clears a custom result and invalidates an outstanding response.

Validated Q3 annual paths exist for Algeria, Argentina, Belgium, Czech Republic,
Turkey and Venezuela. Other countries, including Colombia, retain observed data,
transition status and custom mix inference, but return `scenario_not_available`
for Q3 pathways. No unsupported pathway is fabricated.

Use t/person for per-capita data and scenarios; Mt CO2 denotes total emissions.
The notebook uses independently rounded supplied fossil/renewable totals in its
training columns; raw custom requests calculate those totals from eight shares.
The ratio, HHI, dominant source and year normalization match the notebook.

## Data flow

Existing page -> centralized API client -> FastAPI -> deterministic Supervisor
-> specialist -> service -> validated artifact / original competition CSV.

Briefwright parses supported intents server-side and invokes those same tasks.
It returns sources, structured data and a formatted answer. Sovereign Brief is a
Supervisor aggregator, with a print/save-PDF view. It adds no predictive model.
The active dashboard does not read dashboard/public/data/dashboard.json.
`build_data.py` and the original browser resolver remain historical/offline
analysis utilities for reproducibility; their model outputs are not served by the
application. Do not run build_data.py to initialize the production dashboard.

## API surface

- GET /health
- GET /api/dashboard
- GET /api/countries
- GET /api/countries/{country}/energy-co2
- GET /api/carbon/markets
- POST /api/carbon/forecast
- GET /api/carbon/analysis-outlook/{market}
- GET /api/carbon/model-results
- POST /api/co2/predict
- GET /api/co2/model-summary
- GET /api/co2/feature-importance
- GET /api/co2/model-comparison
- GET /api/co2/test-predictions
- GET /api/q2/summary
- GET /api/q2/feature-importance
- GET /api/q2/event-window-analysis
- GET /api/q2/impact-results
- GET /api/q3/summary
- GET /api/q3/global-trends
- GET /api/q3/archetypes
- GET /api/q3/scenario-countries
- GET /api/q3/countries/{country}/transition
- GET /api/q3/countries/{country}/scenarios
- GET /api/q3/countries/{country}/2030
- POST /api/assistant/query
- GET /api/brief/{country}?market=EU_ETS
- POST /api/scenario/compare (legacy contract; explicitly unavailable without a validated future energy baseline)

## Verify

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
cd dashboard
node tests/assistant-validation.cjs
node tests/energy-mix-validation.cjs
node tests/scenario-flow.cjs
npm run build
```

The original assistant test checks the preserved offline parser/resolver, not the
new application assistant. New backend integration tests and browser flows verify
the active Briefwright endpoint. Browser instructions are in
[TEST_PLAN.md](TEST_PLAN.md). See [INTEGRATION_AUDIT.md](INTEGRATION_AUDIT.md) for the
initial dependency audit and [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md) for
verified endpoint, page and test status.
