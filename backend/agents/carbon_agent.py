class CarbonForecastAgent:
    """Model adapter. Integrate the team's artifact only in this file."""

    @property
    def connected(self) -> bool:
        return False

    def predict(self, market: str) -> dict:
        return {
            "status": "model_not_connected",
            "message": "Carbon forecasting model is not connected yet.",
        }
