from backend.schemas.requests import EnergyMix
from backend.schemas.responses import CO2PredictionSuccess, ScenarioComparisonSuccess, StateResponse
from backend.services.comparison import compare_predictions
from backend.services.baseline_service import get_baseline_energy_mix, get_baseline_2030_energy_mix
from backend.services.validation import validate_energy_mix


class ScenarioEngine:
    def __init__(self, co2_agent, baseline_provider=None):
        self.co2_agent = co2_agent
        self.baseline_provider = baseline_provider or get_baseline_energy_mix

    @staticmethod
    def get_baseline_2030_energy_mix(country: str) -> dict:
        return get_baseline_2030_energy_mix(country)

    def compare(self, country: str, target_year: int, user_mix: EnergyMix) -> dict:
        if not getattr(self.co2_agent, "connected", True):
            return {
                "status": "model_not_connected",
                "message": "Final CO₂ prediction model is awaiting integration.",
            }
        baseline_result = self.baseline_provider(country, target_year)
        if baseline_result.get("status") != "success":
            return StateResponse.model_validate(baseline_result).model_dump(exclude_none=True)
        baseline_mix = validate_energy_mix(baseline_result["energy_mix"])
        baseline = self.co2_agent.predict(baseline_mix.model_dump(), target_year=target_year)
        if baseline.get("status") != "success":
            return StateResponse.model_validate(baseline).model_dump(exclude_none=True)
        scenario = self.co2_agent.predict(user_mix.model_dump(), target_year=target_year)
        if scenario.get("status") != "success":
            return StateResponse.model_validate(scenario).model_dump(exclude_none=True)
        baseline_prediction = CO2PredictionSuccess.model_validate(baseline)
        scenario_prediction = CO2PredictionSuccess.model_validate(scenario)

        def selected_prediction(prediction: CO2PredictionSuccess):
            if prediction.yearly_forecast is not None:
                point = next(
                    point for point in prediction.yearly_forecast if point.year == target_year
                )
                return point.co2_per_capita_t, point.co2_emissions_mt
            if prediction.prediction_year == target_year or (
                target_year == 2030 and prediction.prediction_year is None
            ):
                return prediction.co2_per_capita_t, prediction.co2_emissions_mt
            return None

        baseline_selected = selected_prediction(baseline_prediction)
        scenario_selected = selected_prediction(scenario_prediction)
        if baseline_selected is None or scenario_selected is None:
            return {
                "status": "year_not_supported",
                "target_year": target_year,
                "message": f"The connected specialist model does not provide a prediction for {target_year}.",
            }
        baseline_value, baseline_mt = baseline_selected
        scenario_value, scenario_mt = scenario_selected
        return ScenarioComparisonSuccess.model_validate(
            {
                "status": "success",
                "country": country,
                "target_year": target_year,
                "baseline": {
                    "label": "Current Trend",
                    "energy_mix": baseline_mix.model_dump(),
                    "co2_per_capita_t": baseline_value,
                    "co2_emissions_mt": baseline_mt,
                    "yearly_forecast": baseline.get("yearly_forecast"),
                },
                "user_scenario": {
                    "label": "Your Energy Plan",
                    "energy_mix": user_mix.model_dump(),
                    "co2_per_capita_t": scenario_value,
                    "co2_emissions_mt": scenario_mt,
                    "yearly_forecast": scenario.get("yearly_forecast"),
                },
                "comparison": compare_predictions(baseline_value, scenario_value),
                "model": scenario_prediction.model.model_dump(),
            }
        ).model_dump()
