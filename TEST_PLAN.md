# Integration verification

## Automated backend and frontend checks

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
cd dashboard
node tests/assistant-validation.cjs
node tests/energy-mix-validation.cjs
node tests/scenario-flow.cjs
npm run build
```

Backend tests cover saved-output parity, all five ARIMA forecasts and intervals,
feature order/formulas, held-out RF parity, custom Colombia inference, explicit
Supervisor routing, Q2 files, Q3 years/countries, unavailable scenarios, assistant
answers, brief aggregation, readiness failure, and server trace logging.
The existing 81-question browser parser suite is retained for offline regression
coverage; active Briefwright coverage is in backend/tests/test_integration.py and
the real browser suite below.

## Real browser checks

Install Playwright into the project virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-test.txt
```

The suite uses installed Microsoft Edge in headless mode. Start isolated services
in separate terminals so existing services need not be stopped:

```powershell
$env:MONSOON_CORS_ORIGINS='http://localhost:3011,http://127.0.0.1:3011'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8011
```

```powershell
cd dashboard
npm run build
node node_modules/next/dist/bin/next start -p 3011
```

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe dashboard/tests/browser_flow.py -v
```

The browser forwards its localhost:8000 API requests to the isolated real backend
at 127.0.0.1:8011. No fixture responses or fake predictions are supplied. Override
MONSOON_UI_URL and MONSOON_API_URL for other test server addresses.

Checks: all five carbon selectors; Colombia observed mix -> edited Wind -> live
prediction without refresh; invalidation on edit; Colombia 2028 unsupported Q3
state alongside working custom inference; Algeria's selected-year Q3 values;
Q2 RMSE/MAE/MAPE; country transition; model evidence; requested Briefwright answers;
printable Sovereign Brief and no runtime JavaScript errors.

## Manual presentation checks

1. Health reports ready only with compatible artifacts loaded.
2. Overview carbon and model evidence identify ARIMA, not an old RF export.
3. Change a CO2 energy input and inspect the POST payload in Network.
4. In the simulator select Colombia and 2028: no fabricated Q3 path. Run a custom
   mix and confirm it is labelled as a 2026 reference-year energy-mix estimate.
5. Select Algeria: BAU/Moderate/Accelerated cards show the selected year; the
   chart retains the entire 2026-2030 path.
6. Edit again during or after inference: old results must not reappear.
7. Climate Events reports marginal Q2 improvement and actual evaluation metrics.
8. Sovereign Brief -> Print / Save PDF hides navigation and preserves sources.
9. Stop FastAPI and check clear unavailable states, not zeros or old model values.
