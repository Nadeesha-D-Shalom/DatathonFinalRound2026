class CO2PredictionAgent:
    """Model adapter. Set feature_order from the delivered training contract."""

    feature_order: tuple[str, ...] | None = None

    @property
    def connected(self) -> bool:
        return False

    def predict(self, energy_mix: dict, target_year: int | None = None) -> dict:
        # Scenario requests pass their selected year through this adapter. The
        # future model integration must report unsupported years explicitly.
        return {
            "status": "model_not_connected",
            "message": "Final CO₂ prediction model is awaiting integration.",
        }
