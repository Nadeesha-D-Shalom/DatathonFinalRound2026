class CO2PredictionAgent:
    """Model adapter. Set feature_order from the delivered training contract."""

    feature_order: tuple[str, ...] | None = None

    @property
    def connected(self) -> bool:
        return False

    def predict(self, energy_mix: dict) -> dict:
        return {
            "status": "model_not_connected",
            "message": "CO2 prediction model is not connected yet.",
        }
