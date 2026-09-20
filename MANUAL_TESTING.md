# CarbonScope manual test walkthrough

Run commands from the repository root unless the command says `cd dashboard`. A dashboard export is present at `dashboard/public/data/dashboard.json`. The final live Carbon and CO₂ specialist agents are currently disconnected.

## 1. Confirm both services

Open `http://localhost:3000` and `http://127.0.0.1:8000/health`. Health should return `status: ok` and both model statuses as `not_connected`. If port 8000 is occupied, check the existing process before trying to start another server:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
```

If no backend is running, start it from the root:

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If no dashboard is running, open another terminal:

```powershell
cd dashboard
npm run dev
```

## 2. Check observed country records

Open `http://127.0.0.1:8000/api/countries`, then `http://127.0.0.1:8000/api/countries/Algeria/energy-co2`. The list should be alphabetically sorted. Check the latest year's CO₂ fields against `Dataset/co2_emissions_yearly.csv` and energy fields against `Dataset/energy_mix_yearly.csv`. These are observed measurements, not predictions.

## 3. Check the simulator request

1. In Chrome, open DevTools with **F12**. Select **Network**, **Fetch/XHR**, and **No throttling**.
2. Clear the Network log. Open **2030 Simulator**.
3. Select **Egypt**, **2028**, and any standard energy path. Confirm the highlighted chart year and selected-year cards show 2028 while the full 2000–2030 chart remains.
4. Change **Wind**. The other shares should adjust so the total stays near 100%. The energy-mix bars should change. No custom prediction should appear yet.
5. Click **Run Simulation**. Select a `compare` request in Network. In **Headers**, find **Request Method: POST**. An `OPTIONS` row is a normal browser CORS preflight and has no JSON result.
6. On the **POST** row, check **Payload**: `country` is `Egypt`, `target_year` is `2028`, and all eight `energy_mix` values match the controls.
7. Check **Response** on that same row. While the model is disconnected, expect HTTP 200 with `status: model_not_connected`. The page should display the unavailable message. There must be no made-up custom forecast or “Your Energy Plan” emissions line.
8. Change **Gas** and run again. The next POST must contain the updated `gas_pct`.
9. Click **Reset**. The observed country's mix returns; any old custom result disappears. **Balance to 100%** should adjust shares without sending a prediction request.

The three standard paths are existing dataset-based estimates. They remain visible and are separate from the live custom specialist result. The main chart uses **Mt CO₂**; a specialist result in **t/person** belongs in the separate per-person view.

## 4. Check CO₂ & Energy

1. Open **CO₂ & Energy**. Network should show `GET /api/countries` and `GET /api/countries/{country}/energy-co2`.
2. Change country. The observed CO₂/person and energy-share cards, energy bars, and historical emissions chart should change.
3. The page sends the latest observed mix to `POST /api/co2/predict`. The prediction card should say **Awaiting model** while the specialist is disconnected.
4. In **Try a Different Energy Mix**, change a share and click **Predict CO₂**. Confirm the POST payload contains the edited mix and the response is `model_not_connected`.
5. Change country again. The custom mix should reset to the newly selected country's observed mix.

This feature estimates CO₂ per person from an energy mix; it is not the 2030 scenario forecast.

## 5. Check the remaining sidebar sections

| Section | Check |
| --- | --- |
| Overview | Change market; verify price cards and chart change, and the country count is present. |
| Carbon Price Forecast | Change market; verify the export forecast and live-specialist status are labeled separately. |
| Climate Events | Verify the connected Q2 Ridge baseline/event-aware errors, MAE/MAPE, feature coefficients, event-window result, and recent event records. Do not interpret predictive association as causation. |
| Country Explorer | Change country; verify observed emissions, energy shares, transition status, and historical charts change. |
| Model Results | Verify exported Carbon/CO₂ metrics and the API-backed Q2 result are shown with their methods. These exports do not imply live Carbon/CO₂ FastAPI agents are connected. |
| Business Case | Verify the target users, product modules, commercial options, and architecture appear. |
| Data & technical → Data Quality | Verify all five competition CSVs are listed with coverage and quality counts. |
| Ask assistant | Ask for a country summary, a market forecast, and a comparison; answers should cite competition-data or analysis-output sources. |

## 6. Automated checks

```powershell
python -m unittest discover -s backend/tests -v
cd dashboard
npm run test:assistant
npm run test:energy-mix
node tests/scenario-flow.cjs
npm run build
```

The current model-disconnected response is a correct development state. A live custom prediction can only be verified after the trained specialist model and validated Current Trend baseline are connected. At that point, repeat the simulator steps and verify that a successful response changes the comparison cards and a unit-correct custom chart value without refreshing the page.
