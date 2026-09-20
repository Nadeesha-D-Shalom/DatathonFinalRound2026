from backend.schemas.requests import EnergyMix
from backend.schemas.responses import CO2PredictionSuccess, ScenarioComparisonSuccess, StateResponse
from backend.services.comparison import compare_predictions
from backend.services.baseline_service import get_baseline_2030_energy_mix
from backend.services.validation import validate_energy_mix


class ScenarioEngine:
    def __init__(self, co2_agent, baseline_provider=None):
        self.co2_agent = co2_agent
        self.baseline_provider = baseline_provider or get_baseline_2030_energy_mix

    @staticmethod
    def get_baseline_2030_energy_mix(country: str) -> dict:
        return get_baseline_2030_energy_mix(country)

    def compare(self, country: str, target_year: int, user_mix: EnergyMix) -> dict:
        baseline_result = self.baseline_provider(country)
        if baseline_result.get("status") != "success":
            return StateResponse.model_validate(baseline_result).model_dump()
        baseline_mix = validate_energy_mix(baseline_result["energy_mix"])
        baseline = self.co2_agent.predict(baseline_mix.model_dump())
        if baseline.get("status") != "success":
            return StateResponse.model_validate(baseline).model_dump()
        scenario = self.co2_agent.predict(user_mix.model_dump())
        if scenario.get("status") != "success":
            return StateResponse.model_validate(scenario).model_dump()
        baseline_prediction = CO2PredictionSuccess.model_validate(baseline)
        scenario_prediction = CO2PredictionSuccess.model_validate(scenario)
        baseline_value = baseline_prediction.co2_per_capita_t
        scenario_value = scenario_prediction.co2_per_capita_t
        return ScenarioComparisonSuccess.model_validate({
            "status": "success", "country": country, "target_year": target_year,
            "baseline": {"label": "Current Trend", "energy_mix": baseline_mix.model_dump(), "co2_per_capita_t": baseline_value},
            "user_scenario": {"label": "Your Energy Plan", "energy_mix": user_mix.model_dump(), "co2_per_capita_t": scenario_value},
            "comparison": compare_predictions(baseline_value, scenario_value),
            "model": scenario_prediction.model.model_dump(),
        }).model_dump()
