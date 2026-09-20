import csv
import unittest

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.carbon_analysis_service import ROOT


class SovereignBriefDataTests(unittest.TestCase):
    def test_delivered_arima_outlook_matches_csv(self):
        with (ROOT / "carbon_price_30day_forecast.csv").open(
            encoding="utf-8-sig", newline=""
        ) as source:
            rows = list(csv.DictReader(source))
        client = TestClient(app)
        for market in sorted({row["market"] for row in rows}):
            result = client.get(f"/api/carbon/analysis-outlook/{market}").json()
            last = next(
                row for row in rows if row["market"] == market and row["forecast_step"] == "30"
            )
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["model"], "ARIMA (1,1,1)")
            self.assertEqual(result["forecast_date"], last["forecast_date"])
            self.assertAlmostEqual(result["forecast_price"], float(last["forecast_price"]))

    def test_unknown_market_has_no_forecast(self):
        response = TestClient(app).get("/api/carbon/analysis-outlook/UNKNOWN").json()
        self.assertEqual(response["status"], "market_not_available")
