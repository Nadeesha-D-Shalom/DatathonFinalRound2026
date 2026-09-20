from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.schemas.requests import (
    CarbonForecastRequest,
    CO2PredictionRequest,
    ScenarioComparisonRequest,
)
from backend.supervisor import Supervisor
from backend.services.country_data_service import (
    CountryNotFound,
    DatasetError,
    get_countries,
    get_country_energy_co2,
)
from backend.services.carbon_analysis_service import get_carbon_analysis_outlook


app = FastAPI(title="CarbonScope Prediction Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
supervisor = Supervisor()


@app.exception_handler(RequestValidationError)
async def request_validation_error(_request: Request, exc: RequestValidationError):
    message = next(
        (
            str(error["ctx"].get("error", error["msg"]))
            for error in exc.errors()
            if "Energy mix percentages" in str(error)
        ),
        None,
    )
    if not message:
        message = "; ".join(
            f"{'.'.join(map(str, error['loc'][1:]))}: {error['msg']}" for error in exc.errors()
        )
    return JSONResponse(status_code=422, content={"status": "validation_error", "message": message})


@app.get("/health")
def health():
    return {
        "status": "ok",
        "carbon_model": "connected" if supervisor.carbon_agent.connected else "not_connected",
        "co2_model": "connected" if supervisor.co2_agent.connected else "not_connected",
    }


@app.get("/api/countries")
def countries():
    try:
        return {"status": "success", "countries": get_countries()}
    except DatasetError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "dataset_error",
                "message": "Country datasets are unavailable or invalid.",
            },
        )


@app.get("/api/countries/{country}/energy-co2")
def country_energy_co2(country: str):
    try:
        return get_country_energy_co2(country)
    except CountryNotFound:
        return JSONResponse(
            status_code=404,
            content={
                "status": "country_not_found",
                "message": "This country is not available in the supplied datasets.",
            },
        )
    except DatasetError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "dataset_error",
                "message": "Country datasets are unavailable or invalid.",
            },
        )


@app.post("/api/carbon/forecast")
def carbon_forecast(request: CarbonForecastRequest):
    return supervisor.run("carbon_forecast", request.model_dump())


@app.get("/api/carbon/analysis-outlook/{market}")
def carbon_analysis_outlook(market: str):
    return get_carbon_analysis_outlook(market)


@app.post("/api/co2/predict")
def co2_predict(request: CO2PredictionRequest):
    return supervisor.run("co2_prediction", request.model_dump())


@app.post("/api/scenario/compare")
def scenario_compare(request: ScenarioComparisonRequest):
    return supervisor.run("compare_2030_scenario", request.model_dump())


@app.get("/api/q2/summary")
def q2_summary():
    return supervisor.run("q2_event_impact", {})


@app.get("/api/q2/feature-importance")
def q2_feature_importance():
    return supervisor.run("q2_feature_importance", {})


@app.get("/api/q2/event-window-analysis")
def q2_event_window_analysis():
    return supervisor.run("q2_event_window", {})


@app.get("/api/q2/impact-results")
def q2_impact_results():
    return supervisor.run("q2_impact_results", {})


@app.get("/api/q3/summary")
def q3_summary():
    return supervisor.run("q3_summary", {})


@app.get("/api/q3/global-trends")
def q3_global_trends():
    return supervisor.run("q3_global_trends", {})


@app.get("/api/q3/archetypes")
def q3_archetypes():
    return supervisor.run("q3_archetypes", {})


@app.get("/api/q3/scenario-countries")
def q3_scenario_countries():
    return supervisor.run("q3_scenario_countries", {})


@app.get("/api/q3/countries/{country}/transition")
def q3_country_transition(country: str):
    return supervisor.run("q3_transition", {"country": country})


@app.get("/api/q3/countries/{country}/scenarios")
def q3_country_scenarios(country: str):
    return supervisor.run("q3_scenario_forecast", {"country": country})


@app.get("/api/q3/countries/{country}/2030")
def q3_country_2030(country: str):
    return supervisor.run("q3_2030", {"country": country})
