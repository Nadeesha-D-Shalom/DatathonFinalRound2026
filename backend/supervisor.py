from pydantic import ValidationError

from backend.agents.carbon_agent import CarbonForecastAgent
from backend.agents.co2_agent import CO2PredictionAgent
from backend.schemas.requests import CarbonForecastRequest, CO2PredictionRequest, ScenarioComparisonRequest
from backend.schemas.responses import CarbonForecastSuccess, CO2PredictionSuccess, ScenarioComparisonSuccess, StateResponse
from backend.services.scenario_engine import ScenarioEngine
from backend.services.validation import validate_country, validate_market


class Supervisor:
    """Deterministic routing and contract checking; no prediction logic."""

    def __init__(self, carbon_agent=None, co2_agent=None, scenario_engine=None):
        self.carbon_agent = carbon_agent or CarbonForecastAgent()
        self.co2_agent = co2_agent or CO2PredictionAgent()
        self.scenario_engine = scenario_engine or ScenarioEngine(self.co2_agent)

    def run(self, task: str, payload: dict) -> dict:
        try:
            if task == "carbon_forecast":
                request = CarbonForecastRequest.model_validate(payload)
                market = validate_market(request.market)
                predict = lambda: self.carbon_agent.predict(market)
                schema = CarbonForecastSuccess
            elif task == "co2_prediction":
                request = CO2PredictionRequest.model_validate(payload)
                predict = lambda: self.co2_agent.predict(request.energy_mix.model_dump())
                schema = CO2PredictionSuccess
            elif task == "compare_2030_scenario":
                request = ScenarioComparisonRequest.model_validate(payload)
                country = validate_country(request.country)
                predict = lambda: self.scenario_engine.compare(country, request.target_year, request.energy_mix)
                schema = ScenarioComparisonSuccess
            else:
                return {"status": "validation_error", "message": f"Unsupported task: {task}."}
        except (ValueError, ValidationError) as exc:
            return {"status": "validation_error", "message": str(exc)}
        except Exception:
            return {"status": "prediction_error", "message": "The prediction service could not validate this request."}

        try:
            result = predict()
            if result.get("status") != "success":
                return StateResponse.model_validate(result).model_dump()
            return schema.model_validate(result).model_dump(mode="json")
        except Exception:
            return {"status": "prediction_error", "message": "The prediction service returned an invalid result or could not complete this request."}
