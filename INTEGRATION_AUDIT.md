# Integration audit — before implementation

Inspected backend routes, schemas, Supervisor, all four agents and services, tests,
dashboard entry point, page components, clients, browser assistant, five datasets,
delivered model/output inventory, and final notebook feature-engineering cells.
Baseline: 30 backend tests pass. No validated artifacts will be changed or retrained.

| Feature | Initial classification | Dependency chain / defect |
| --- | --- | --- |
| Overview / data quality | PARTIALLY WORKING | dashboard-v2 → public/dashboard.json; observed facts mixed with obsolete model exports |
| Carbon forecast | DISCONNECTED | ConnectedCarbonPage → client → POST carbon/forecast → Supervisor → CarbonForecastAgent stub; ARIMA files and validated exports present |
| CO2 energy | PARTIALLY WORKING | CO2EnergyPage → client → co2/predict → Supervisor → CO2PredictionAgent → CO2PredictionService → final RF + feature pickle; offline browser fallback and stale-request risks |
| Q1.2 evidence | WORKING | CO2ModelResults → co2 client → four FastAPI routes → final package CSV/JSON |
| Q2 | WORKING | Q2EventsPage → q2 client → four endpoints → Supervisor → EventImpactAgent → Q2 service → data/q2 |
| Q3 | WORKING | Q3 components → q3 client → seven endpoints → Supervisor → Q3TransitionAgent → Q3 service → models/q3 (actual supplied location) |
| Simulator | BROKEN | standard Q3 paths work; custom submit calls scenario/compare, requiring an absent future baseline; initial message incorrectly says RF disconnected |
| Country explorer | PARTIALLY WORKING | observed browser export + Q3 API; needs one API-backed source of observed facts |
| Model results | PARTIALLY WORKING | Q1.2/Q2/Q3 evidence connected; carbon describes obsolete Random Forest export |
| Sovereign brief | PARTIALLY WORKING | browser aggregation across country/Q3/Q2/Q1 routes and export temperature/events; no Supervisor aggregator |
| Briefwright | STATIC/HARDCODED | deterministic browser parser/resolver over dashboard.json; no assistant backend; can answer from superseded model/scenario outputs |
| Health / trace | PARTIALLY WORKING | always reports ok; only Carbon and CO2 flags; missing artifact validation and route tracing |

## Scientific constraints

- Q3 is stored under backend/models/q3; preserve this supplied path. Six scenario
  countries: Algeria, Argentina, Belgium, Czech Republic, Turkey, Venezuela.
  Colombia has transition data but no supplied Q3 scenario: do not invent one.
- Final RF order has 16 features. Notebook uses supplied rounded fossil/renewable
  totals for those two columns, calculated raw-share totals for ratio/low carbon,
  squared proportions for HHI, and year minus 2000. Custom raw-share requests
  necessarily calculate totals. Existing Algeria 2026 held-out parity passes.
- RF validated years end in 2026. Custom simulator result must be a single
  energy-mix estimate at the observed reference year, not a future annual line.
- Q2 marginal RMSE improvement is contextual evidence, not causality or a new
  event forecasting product. Carbon uses supplied ARIMA output and intervals.
- statsmodels is absent from the initial Python environment; verify trusted
  ARIMA artifacts with compatible dependencies before claiming model readiness.

## Target dependency map

Existing page → centralized API client → FastAPI → explicit Supervisor task →
existing specialist → service → competition CSV / validated Q1/Q2/Q3 artifact.
Overview/data quality use an observed-data service through Supervisor; assistant
parses intents server-side and invokes explicit tasks; sovereign brief aggregates
those same tasks. No browser reads of public dashboard.json in the active product.
