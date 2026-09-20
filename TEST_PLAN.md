# CarbonScope Intelligence — full test plan

Use this as the release checklist for the current dashboard. Record **Pass**, **Fail**, **Blocked**, or **Not run** for each ID, with a screenshot or Network response for failures. A missing Carbon or CO₂ specialist model is an expected **development state**, not a failed prediction. A successful custom prediction remains **Blocked** until those artifacts and the validated scenario baseline arrive.

## Setup and evidence

1. Open two terminals at the repository root. Start FastAPI with `python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`. In `dashboard`, start Next.js with `npm run dev`.
2. Open `http://localhost:3000`, `http://127.0.0.1:8000/health`, and `http://127.0.0.1:8000/docs`.
3. In Chrome DevTools, select **Network → Fetch/XHR**, set **No throttling**, and clear the request list before each test. For JSON POSTs, an `OPTIONS` preflight is normal. Select the row whose **Headers → Request Method** is `POST` to inspect Payload and Response.
4. Test desktop around 1440 px, tablet around 768 px, and mobile around 390–430 px. Check horizontal scrolling only where a data table needs it.
5. Keep a record: test ID, country/market/year selected, expected result, actual result, HTTP status, screenshot, and issue link.

## A. Services, routing, and source data

| ID | Action | Pass condition |
| --- | --- | --- |
| A01 | Open `/health`. | HTTP 200, `status: ok`; model statuses reflect connected files. Currently both Carbon and CO₂ should be `not_connected`. |
| A02 | Open `/docs`. | FastAPI lists health, country, prediction, scenario, and four Q2 GET routes. |
| A03 | Open `/api/countries`. | HTTP 200, alphabetic list of countries actually in the competition files. |
| A04 | Open `/api/countries/Algeria/energy-co2`. | Observed latest year, CO₂ fields, energy fields, and historical arrays appear with no `null`, `NaN`, or invented years. |
| A05 | Compare Algeria's latest CO₂ fields with `Dataset/co2_emissions_yearly.csv`. | Exact numeric match for the same country and year. |
| A06 | Compare Algeria's latest energy shares with `Dataset/energy_mix_yearly.csv`. | Exact numeric match for the same country and year. |
| A07 | Open a nonexistent country URL. | Structured `country_not_found`, without a Python traceback. |
| A08 | Open `/api/q2/summary`. | HTTP 200; Q2 values match `backend/data/q2/q2_dashboard_summary.json` and `event_model_comparison.csv`. |
| A09 | Open `/api/q2/feature-importance`. | Nine features match the manifest and coefficient CSV, in descending absolute coefficient order. |
| A10 | Open `/api/q2/event-window-analysis`. | 75 event-active rows and all RMSE values match the Q2 CSV. |
| A11 | Open `/api/q2/impact-results`. | 150 validated held-out result rows; dates, market, currency, observed price and both predictions are present. |
| A12 | Check original CSVs are still in `Dataset/`. | All five files exist; no outside data is used in dashboard metrics. |
| A13 | Stop FastAPI temporarily and refresh a backend-driven page, then restart it. | A readable unavailable/retry state appears; the page does not show a fabricated prediction or stack trace. |

## B. Application shell and navigation

| ID | Action | Pass condition |
| --- | --- | --- |
| B01 | Load the dashboard. | Brand, sidebar, top header, current page title, data-through year, and Ask assistant control appear. |
| B02 | Click every primary sidebar item. | Overview, Carbon Price Forecast, CO₂ & Energy, Climate Events, 2030 Simulator, Country Explorer, Model Results, and Business Case open without an error. |
| B03 | Expand Data & technical. | Data Quality is available; there is no API/supervisor sidebar page. |
| B04 | Move between pages and back. | Selected market/country controls remain usable; no `undefined`, `NaN`, or broken chart appears. |
| B05 | Resize to tablet and mobile widths. | Sidebar/navigation remain usable; KPI and chart cards stack; text and controls do not overlap. |
| B06 | Refresh each page. | Dashboard returns to a valid state, loads its data, and does not crash. Sidebar selection may reset to Overview because page state is local. |

## C. Overview

| ID | Action | Pass condition |
| --- | --- | --- |
| C01 | Read latest carbon price. | Market, currency, price, and observed date match the selected market's export/source record. |
| C02 | Change market. | Price card, expected change, summary statement, and observed/forecast chart update together. |
| C03 | Inspect renewable share. | Labeled as an **unweighted country average** for the latest data year. |
| C04 | Inspect country count and overview details. | Count matches the data inventory; expanded charts/data context render. |
| C05 | Hover the carbon chart. | Observed and forecast series have understandable labels and currency units. |
| C06 | Click the three next-step cards. | Each opens the intended Carbon, CO₂ & Energy, or Simulator page. |

## D. Carbon Price Forecast

| ID | Action | Pass condition |
| --- | --- | --- |
| D01 | Select each of the five markets. | The correct market, currency, latest observation, and forecast export appear. |
| D02 | Inspect the chart boundary and tooltip. | Observed price and 30-trading-day forecast are visually distinct; forecast dates are after the last observation. |
| D03 | Check expected price change. | `(forecast endpoint − latest price) / latest price × 100`, with zero-denominator protection. |
| D04 | Expand model details. | RMSE, MAPE, test period, features, and any uncertainty limitation are labeled as exported analysis results. |
| D05 | Inspect the live specialist status. | While the Carbon agent is disconnected, it says so; the older analysis export is labeled separately. |
| D06 | Inspect `POST /api/carbon/forecast` in Network. | Selected market reaches FastAPI; current response is `model_not_connected`, not a fake live result. |

## E. CO₂ & Energy

| ID | Action | Pass condition |
| --- | --- | --- |
| E01 | Open the page. | Country list comes from `/api/countries`; observed profile comes from `/api/countries/{country}/energy-co2`. |
| E02 | Change country twice. | CO₂/person, renewables, fossil fuels, energy bars, and observed CO₂ history all change to the selected country. |
| E03 | Check units. | Historical total CO₂ uses **Mt CO₂**; observed and predicted per-person values use **t/person**. |
| E04 | Inspect model-predicted card and Network. | The latest observed mix is POSTed to `/api/co2/predict`; current card says **Awaiting model**. |
| E05 | Change Coal, Wind, then Solar in custom controls. | Each edited share appears in the numeric field; other shares rebalance; total stays near 100%. |
| E06 | Click Predict CO₂. | The current eight shares are sent once, only on the click. Current response is `model_not_connected`. |
| E07 | Change country after editing. | Custom controls reset to the new country's observed latest-year mix; stale results disappear. |
| E08 | Use Reset and Balance to 100%. | Reset restores observed values. Balance normalizes values and does not call the model by itself. |
| E09 | When a trained model is connected. | The observed-vs-model and custom result show real `co2_per_capita_t`; no single-country error is presented as overall model accuracy. **Blocked until model delivery.** |

## F. Climate Events — completed Q2 analysis

| ID | Action | Pass condition |
| --- | --- | --- |
| F01 | Open Climate Events and inspect Network. | GET requests for Q2 summary, features, event window, and impact results return `success`. |
| F02 | Check the four KPI cards. | Baseline RMSE ≈ 1.858455; event-aware RMSE ≈ 1.858013; improvement ≈ 0.0237785%; event-window improvement ≈ 0.0448887%. All come from the backend response. |
| F03 | Inspect the RMSE bar chart. | Two Recharts bars match the API values; lower RMSE is identified as better. No PNG is used as the chart. |
| F04 | Inspect RMSE/MAE/MAPE table. | Baseline and event-aware values match `event_model_comparison.csv`. MAPE is **worse** for the event-aware model. |
| F05 | Read What did we learn? | Describes the RMSE gain as marginal, says MAPE worsened, and makes no causal claim. |
| F06 | Inspect feature chart. | Only nine manifest features appear; order matches descending **absolute standardized Ridge coefficient**. Signed values remain visible in Model Details. |
| F07 | Inspect event-window section. | 75 rows, two event-window RMSEs and improvement match `event_window_analysis.csv`. |
| F08 | Inspect recent events. | Dates, type, region, severity and policy/weather/disaster flags come from supplied event records. |
| F09 | Expand Model Details. | Both arms are Ridge, sources and artifacts are named, and exact train/test dates are not invented. |
| F10 | Stop backend and reopen page, then restart it. | Clean unavailable/retry state; no old Q2 scores presented as current live API results. |
| F11 | Check units and market scope. | The pooled Q2 RMSE is **not labeled EUR or EU ETS-only**; included markets are identified. |

## G. 2030 Simulator

| ID | Action | Pass condition |
| --- | --- | --- |
| G01 | Open page. | Country, Forecast Year, and Energy Path controls appear. Year defaults to 2030. |
| G02 | Open Forecast Year. | Options are exactly 2027, 2028, 2029, 2030. No 2026 option. |
| G03 | Choose Egypt and 2028. | Selected-year card labels, question text, path comparisons, and reference line update to 2028. Full observed 2000–2026 and projected 2027–2030 timeline stays visible. |
| G04 | Switch Current Trend, Moderate, Fast. | Primary standard-path card and highlighted path selection update; these remain labeled dataset-based estimates. |
| G05 | Change Wind substantially. | Other shares adjust and total stays near 100%. Energy-mix comparison bars change immediately; prior custom result disappears. |
| G06 | Click Run Simulation. | Network **POST** payload contains Egypt, `target_year: 2028`, and exactly the eight shares shown in controls. Ignore the separate `OPTIONS` preflight row. |
| G07 | Check current response. | HTTP 200 `model_not_connected`; page shows a neutral unavailable state. No custom numeric prediction or custom forecast line appears. |
| G08 | Change Gas and run again. | New POST contains the updated `gas_pct`; no previous result is reused. |
| G09 | Change year after a result. | Previous custom result clears. Selected-year values cannot silently reuse a different year. |
| G10 | Click Reset. | Original country shares return; custom result and chart series clear. |
| G11 | Click Balance to 100%. | Total becomes about 100%; no POST occurs until Run Simulation is clicked. |
| G12 | Submit an invalid mix directly in `/docs`. | HTTP 422 `validation_error`; clearly invalid total or negative/>100 share is rejected. |
| G13 | Submit valid years 2027–2030 directly in `/docs`. | Each reaches `model_not_connected` today; 2026, 2031 and non-integer years are rejected. |
| G14 | When CO₂ model and baseline are connected. | Same specialist predicts Current Trend and custom mix; selected-year KPI values and unit-correct custom chart update from a `success` response. **Blocked until model/baseline delivery.** |
| G15 | If only per-person prediction is returned. | It appears on the separate **t/person** chart; no per-person number is plotted on the **Mt CO₂** chart. |
| G16 | If model supplies only 2030. | Requesting 2027–2029 returns `year_not_supported`; no interpolation or reused endpoint. |

## H. Country Explorer, Model Results, Business Case, Data Quality

| ID | Action | Pass condition |
| --- | --- | --- |
| H01 | Choose three countries in Country Explorer. | Observed CO₂, per-person CO₂, renewable/fossil shares, main source, region and classification change. |
| H02 | Inspect country historical charts. | CO₂ total is in Mt; energy shares are percentages; 2000–2026 observed years are clear. |
| H03 | Expand country details. | Eight source shares, intensity, region-matched event count and three 2030 path values appear with appropriate labels. |
| H04 | Open Model Results. | Carbon and CO₂ export scores, Q2 compact card, and scenario method display without pretending live Carbon/CO₂ agents are connected. |
| H05 | Click View Climate Events Analysis. | Opens the connected Q2 Climate Events page. |
| H06 | Check Q2 compact card. | RMSE and improvement match `/api/q2/summary`; MAPE limitation is stated. |
| H07 | Open Business Case. | Product purpose, modules, target customers, commercial options and architecture display; no invented revenue. |
| H08 | Open Data & technical → Data Quality. | All five supplied CSVs are listed, with rows, columns, missing cells and coverage. |
| H09 | Compare Data Quality counts with CSV files. | Counts match the original files; temperature data is represented in the data inventory/context. |

## I. Climate Intelligence Assistant

| ID | Ask or do | Pass condition |
| --- | --- | --- |
| I01 | Open and close Ask assistant. | Panel works without changing the active dashboard page. |
| I02 | Ask “What is the EU ETS forecast?” and “Where is European carbon heading?” | Both resolve to a carbon forecast answer based on the loaded export, with source and uncertainty context. |
| I03 | Ask “Germany emissions,” then “What about France?” | Follow-up keeps the emissions intent and switches country. |
| I04 | Ask “Compare Germany and France renewables.” | Comparison uses the requested metric and available country records. |
| I05 | Ask “Did climate events improve prediction?” | When Q2 API is available, answers with the **marginal Q2 Ridge result**, including the MAPE limitation and pooled-market caveat. |
| I06 | Ask “What is Germany's GDP forecast?” | Says this is unavailable from the supplied data; no external statistic is invented. |
| I07 | Ask an ambiguous question such as “Tell me about 2030.” | Requests clarification rather than making up a metric or country. |
| I08 | Inspect answer sources and charts. | All numeric answers identify dataset/model-output provenance; no `undefined`, `NaN`, or unlabeled units. |

## J. States, accessibility, responsiveness, and performance

| ID | Action | Pass condition |
| --- | --- | --- |
| J01 | Load each backend-driven page on a slow connection. | Loading state appears, then content or readable error. |
| J02 | Temporarily stop FastAPI. | Backend-driven pages show offline/unavailable states; observed fallback, where implemented, is labeled. |
| J03 | Restart FastAPI and use Retry or refresh. | Data returns without requiring a code change. |
| J04 | Check all select/input/button labels with keyboard Tab. | Focus is visible; controls are operable without a mouse. |
| J05 | Inspect chart tooltips and legends. | Units, series names, observed vs forecast, and selected year remain understandable. |
| J06 | Test 1440 px, 768 px, and 390–430 px widths. | Cards stack and controls remain usable; chart titles and values do not clip. |
| J07 | Inspect Chrome Console while visiting every page. | No uncaught exceptions or React hydration errors. Ignore unrelated browser-extension messages. |
| J08 | Inspect Network on page load. | No repeatedly failing request loop; large raw CSVs are not sent to browser components. |
| J09 | Search visible UI for `undefined`, `NaN`, `null`, fake model names, or unlabeled prediction numbers. | None appear. |

## K. Automated release checks

From the repository root:

```powershell
python -m unittest discover -s backend/tests -v
cd dashboard
npm run test:assistant
npm run test:energy-mix
node tests/scenario-flow.cjs
npm run build
```

Before declaring the dashboard fully complete, rerun **G14–G16** with the delivered trained specialist models and validated baseline. Record the real response payload and screenshot. The current unavailable state is correct, but it does not prove live custom prediction.
