"""Q1.2 specialist adapter; Q3 future scenario pathways remain separate."""

from backend.services.co2_prediction_service import CO2PredictionService, CO2ServiceError, model_summary


class CO2PredictionAgent:
    def __init__(self, service=None):
        self.service = service or CO2PredictionService()

    @property
    def connected(self) -> bool:
        return self.service.connected

    def analysis(self, name):
        from backend.services import co2_prediction_service as outputs
        return {"summary": outputs.model_summary, "features": outputs.feature_importance,
                "comparison": outputs.model_comparison, "predictions": outputs.test_predictions}[name]()

    def predict(self, energy_mix: dict, target_year: int | None = None) -> dict:
        year = 2026 if target_year is None else target_year
        if type(year) is not int or not 2000 <= year <= 2026:
            return {
                "status": "year_not_supported",
                "message": "Q1.2 estimates cover 2000–2026; Q3 supplies the 2027–2030 pathways.",
                "target_year": year if isinstance(year, int) and 2027 <= year <= 2030 else None,
            }
        try:
            value = self.service.predict(energy_mix, year)
            metadata = model_summary()["summary"]
        except CO2ServiceError as exc:
            return {"status": exc.status, "message": str(exc)}
        return {
            "status": "success",
            "co2_per_capita_t": value,
            "predicted_co2_per_capita_t": value,
            "target": "co2_per_capita_t",
            "unit": "tonnes CO2 per person",
            "year": year,
            "model": {
                "name": "Random Forest Regressor",
                "r2": metadata["test"]["r2"],
                "rmse": metadata["test"]["rmse"],
                "train_period": metadata["data_split"]["train"],
                "test_methodology": "Held-out 2024–2026 country-year observations",
            },
        }
