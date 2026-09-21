import csv
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.co2_prediction_service import build_features, load_model


ROOT = Path(__file__).resolve().parents[2]
RAW = ("coal_pct", "oil_pct", "gas_pct", "nuclear_pct", "hydro_pct", "solar_pct", "wind_pct", "other_renewables_pct")


class FinalCO2Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        with (ROOT / "Dataset" / "energy_mix_yearly.csv").open(newline="", encoding="utf-8-sig") as stream:
            source = next(row for row in csv.DictReader(stream) if row["country"] == "Algeria" and row["year"] == "2026")
        self.mix = {key: float(source[key]) for key in RAW}

    def test_model_feature_order_and_held_out_prediction(self):
        model, order = load_model()
        self.assertEqual(len(order), 16)
        frame = build_features(self.mix, 2026, order)
        self.assertEqual(frame.columns.tolist(), list(order))
        with (ROOT / "backend" / "data" / "co2" / "test_predictions.csv").open(newline="", encoding="utf-8-sig") as stream:
            actual = next(row for row in csv.DictReader(stream) if row["country"] == "Algeria" and row["year"] == "2026")
        self.assertAlmostEqual(float(model.predict(frame)[0]), float(actual["predicted_co2_per_capita_t"]), places=8)

    def test_api_prediction_and_future_year_safety(self):
        response = self.client.post("/api/co2/predict", json={"year": 2026, "energy_mix": self.mix})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["unit"], "tonnes CO2 per person")
        self.assertEqual(result["model"]["name"], "Random Forest Regressor")
        self.assertEqual(self.client.post("/api/co2/predict", json={"year": 2030, "energy_mix": self.mix}).status_code, 422)

    def test_output_endpoints_use_final_files(self):
        summary = self.client.get("/api/co2/model-summary").json()
        self.assertEqual(summary["summary"]["test"]["r2"], 0.3409)
        self.assertEqual(len(self.client.get("/api/co2/feature-importance").json()["features"]), 16)
        self.assertEqual(len(self.client.get("/api/co2/model-comparison").json()["models"]), 4)
        test_rows = self.client.get("/api/co2/test-predictions").json()["predictions"]
        self.assertEqual(len(test_rows), 150)
        self.assertEqual({row["year"] for row in test_rows}, {2024, 2025, 2026})


if __name__ == "__main__":
    unittest.main()
