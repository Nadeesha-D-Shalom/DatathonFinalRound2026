# CarbonScope prediction backend

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```


Run the backend tests with `python -m unittest discover -s backend/tests -v`.
The dashboard reads `NEXT_PUBLIC_API_BASE_URL` (see `dashboard/.env.example`); its local default is `http://localhost:8000`.

The specialist models are currently absent. Carbon and CO₂ agents return `model_not_connected`. Once the CO₂ model is connected, the scenario engine will return `baseline_not_available` until a validated Current Trend energy mix for the selected year is available. No value in these development responses is a prediction.

`GET /api/countries` and `GET /api/countries/{country}/energy-co2` serve observed records directly from the supplied emissions and energy CSVs. They are separate from `POST /api/co2/predict`, which goes through the supervisor to the CO₂ specialist. The CO₂ & Energy page requests both sources and labels observations and predictions separately.

Integrate the delivered model, its exact feature order, artifact name, and measured metrics inside the corresponding agent file. The agent must preserve its `predict()` response contract. The scenario baseline provider in `services/scenario_engine.py` must be connected to a validated 2030 energy-mix output before comparisons can run. Both scenario branches call the same CO₂ agent.

If the delivered CO₂ model provides annual values, each agent response may include `yearly_forecast` with exactly one validated entry for each year from 2027 through 2030. Each entry includes `co2_per_capita_t` and may include `co2_emissions_mt` when a validated total-emissions methodology is supplied. The 2030 annual per-capita value must match the endpoint. The dashboard never interpolates missing annual predictions.
