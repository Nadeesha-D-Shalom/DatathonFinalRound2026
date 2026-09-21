from backend.services import carbon_analysis_service as service


class CarbonForecastAgent:
    """Serve the team's validated ARIMA outputs; never retrain at request time."""

    @property
    def connected(self) -> bool:
        try:
            for market in service.markets()["markets"]:
                service.forecast(market)
            return True
        except (OSError, ValueError, KeyError):
            return False

    def predict(self, market: str) -> dict:
        return service.forecast(market)

    def get_markets(self):
        return service.markets()

    def get_model_results(self):
        return service.model_results()

    def get_outlook(self, market):
        return service.get_carbon_analysis_outlook(market)
