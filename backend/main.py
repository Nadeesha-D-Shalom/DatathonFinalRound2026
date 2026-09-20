from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.schemas.requests import CarbonForecastRequest, CO2PredictionRequest, ScenarioComparisonRequest
from backend.supervisor import Supervisor


app = FastAPI(title="CarbonScope Prediction Backend", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["*"])
supervisor = Supervisor()


@app.exception_handler(RequestValidationError)
async def request_validation_error(_request: Request, exc: RequestValidationError):
    message = next((str(error["ctx"].get("error", error["msg"])) for error in exc.errors() if "Energy mix percentages" in str(error)), None)
    if not message:
        message = "; ".join(f"{'.'.join(map(str, error['loc'][1:]))}: {error['msg']}" for error in exc.errors())
    return JSONResponse(status_code=422, content={"status": "validation_error", "message": message})


@app.get("/health")
def health():
    return {"status": "ok", "carbon_model": "connected" if supervisor.carbon_agent.connected else "not_connected", "co2_model": "connected" if supervisor.co2_agent.connected else "not_connected"}


@app.post("/api/carbon/forecast")
def carbon_forecast(request: CarbonForecastRequest):
    return supervisor.run("carbon_forecast", request.model_dump())


@app.post("/api/co2/predict")
def co2_predict(request: CO2PredictionRequest):
    return supervisor.run("co2_prediction", request.model_dump())


@app.post("/api/scenario/compare")
def scenario_compare(request: ScenarioComparisonRequest):
    return supervisor.run("compare_2030_scenario", request.model_dump())
