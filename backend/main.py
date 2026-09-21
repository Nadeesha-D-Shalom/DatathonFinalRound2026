from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import os
import logging

logging.basicConfig(level=logging.INFO)

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



app = FastAPI(title="Monsoon Mandate", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("MONSOON_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
supervisor = Supervisor()


@app.exception_handler(Exception)
async def unexpected_error(_request: Request, exc: Exception):
    logging.getLogger("monsoon.api").error("Request failed", exc_info=exc)
    return JSONResponse(status_code=500, content={
        "status": "service_error", "message": "The analysis service could not complete this request."
    })


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
    from backend.services.health_service import health as readiness
    return readiness(supervisor)


@app.get("/api/countries")
def countries():
    try:
        result = supervisor.run("country_list", {})
        if result["status"] != "success":
            raise DatasetError()
        return result
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
        result = supervisor.run("country_profile", {"country": country})
        if result["status"] == "country_not_found":
            raise CountryNotFound(country)
        if result["status"] != "success":
            raise DatasetError()
        return result
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
    return supervisor.run("carbon_outlook", {"market": market})


@app.post("/api/co2/predict")
def co2_predict(request: CO2PredictionRequest):
    return supervisor.run("co2_prediction", request.model_dump())


@app.get("/api/co2/model-summary")
def co2_model_summary():
    return supervisor.run("co2_model_summary", {})


@app.get("/api/co2/feature-importance")
def co2_feature_importance():
    return supervisor.run("co2_feature_importance", {})


@app.get("/api/co2/model-comparison")
def co2_model_comparison():
    return supervisor.run("co2_model_comparison", {})


@app.get("/api/co2/test-predictions")
def co2_test_predictions():
    return supervisor.run("co2_test_predictions", {})


@app.get("/api/dashboard")
def dashboard():
    return supervisor.run("dashboard", {})


@app.get("/api/carbon/markets")
def carbon_markets():
    return supervisor.run("carbon_markets", {})


@app.get("/api/carbon/model-results")
def carbon_model_results():
    return supervisor.run("carbon_model_results", {})


@app.get("/api/brief/{country}")
def brief(country: str, market: str = "EU_ETS"):
    return supervisor.run("sovereign_brief", {"country": country, "market": market})


class AssistantRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    context: dict[str, str | None] = Field(default_factory=dict)


@app.post("/api/assistant/query")
def assistant_query(request: AssistantRequest):
    return supervisor.run("assistant_query", request.model_dump())


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
