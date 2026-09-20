from pydantic import ValidationError

from backend.agents.carbon_agent import CarbonForecastAgent
from backend.agents.co2_agent import CO2PredictionAgent
from backend.agents.event_impact_agent import EventImpactAgent
from backend.agents.q3_transition_agent import Q3TransitionAgent
from backend.services.q3_transition_service import Q3DataError
from backend.schemas.requests import (
    CarbonForecastRequest,
    CO2PredictionRequest,
    ScenarioComparisonRequest,
)
from backend.schemas.responses import (
    CarbonForecastSuccess,
    CO2PredictionSuccess,
    ScenarioComparisonSuccess,
    StateResponse,
)
from backend.services.scenario_engine import ScenarioEngine
from backend.services.q2_event_service import Q2DataError
from backend.services.validation import validate_country, validate_market


class Supervisor:
    """Deterministic routing and contract checking; no prediction logic."""

    def __init__(
        self,
        carbon_agent=None,
        co2_agent=None,
        scenario_engine=None,
        event_impact_agent=None,
        q3_transition_agent=None,
    ):
        self.carbon_agent = carbon_agent or CarbonForecastAgent()
        self.co2_agent = co2_agent or CO2PredictionAgent()
        self.scenario_engine = scenario_engine or ScenarioEngine(self.co2_agent)
        self.event_impact_agent = event_impact_agent or EventImpactAgent()
        self.q3_transition_agent = q3_transition_agent or Q3TransitionAgent()

    def run(self, task: str, payload: dict) -> dict:
        q3_tasks = {
            "q3_summary": lambda: self.q3_transition_agent.get_summary(),
            "q3_global_trends": lambda: self.q3_transition_agent.get_global_trends(),
            "q3_archetypes": lambda: self.q3_transition_agent.get_archetypes(),
            "q3_transition": lambda: self.q3_transition_agent.get_country_transition(
                payload.get("country", "")
            ),
            "q3_scenario_forecast": lambda: self.q3_transition_agent.get_country_scenarios(
                payload.get("country", "")
            ),
            "q3_2030": lambda: self.q3_transition_agent.get_country_2030(
                payload.get("country", "")
            ),
            "q3_scenario_countries": lambda: self.q3_transition_agent.get_scenario_countries(),
        }
        if task in q3_tasks:
            try:
                return q3_tasks[task]()
            except Q3DataError as exc:
                return {"status": exc.status, "message": str(exc)}
            except Exception:
                return {
                    "status": "invalid_q3_data",
                    "message": "Validated Q3 analysis outputs could not be loaded.",
                }
        q2_tasks = {
            "q2_event_impact": self.event_impact_agent.get_summary,
            "q2_feature_importance": self.event_impact_agent.get_feature_importance,
            "q2_event_window": self.event_impact_agent.get_event_window_analysis,
            "q2_impact_results": self.event_impact_agent.get_impact_results,
        }
        if task in q2_tasks:
            try:
                result = q2_tasks[task]()
                if not isinstance(result, dict) or result.get("status") != "success":
                    raise ValueError("Invalid Q2 specialist result")
                return result
            except Q2DataError as exc:
                return {"status": exc.status, "message": str(exc)}
            except Exception:
                return {
                    "status": "prediction_error",
                    "message": "Q2 analysis results could not be loaded.",
                }
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
                predict = lambda: self.scenario_engine.compare(
                    country, request.target_year, request.energy_mix
                )
                schema = ScenarioComparisonSuccess
            else:
                return {"status": "validation_error", "message": f"Unsupported task: {task}."}
        except (ValueError, ValidationError) as exc:
            return {"status": "validation_error", "message": str(exc)}
        except Exception:
            return {
                "status": "prediction_error",
                "message": "The prediction service could not validate this request.",
            }

        try:
            result = predict()
            if result.get("status") != "success":
                return StateResponse.model_validate(result).model_dump(exclude_none=True)
            return schema.model_validate(result).model_dump(mode="json")
        except Exception:
            return {
                "status": "prediction_error",
                "message": "The prediction service returned an invalid result or could not complete this request.",
            }
