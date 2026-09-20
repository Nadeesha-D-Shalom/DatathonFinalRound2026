import csv
import json
import math
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.supervisor import Supervisor
from backend.services import q2_event_service


Q2_DIR = Path(__file__).resolve().parents[1] / "data" / "q2"


class Q2Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_summary_matches_validated_files(self):
        response = self.client.get("/api/q2/summary")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["status"], "success")
        source = json.loads((Q2_DIR / "q2_dashboard_summary.json").read_text(encoding="utf-8"))
        with (Q2_DIR / "event_model_comparison.csv").open(
            encoding="utf-8", newline=""
        ) as source_file:
            comparison = list(csv.DictReader(source_file))
        experiment = result["experiment"]
        self.assertEqual(experiment["baseline"]["rmse"], source["baseline"]["rmse"])
        self.assertEqual(experiment["event_aware"]["mape"], source["event_aware"]["mape_percent"])
        self.assertEqual(experiment["event_aware"]["mae"], float(comparison[1]["mae"]))
        self.assertAlmostEqual(
            experiment["comparison"]["rmse_improvement_percent"], source["rmse_improvement_percent"]
        )
        self.assertGreater(experiment["event_aware"]["mape"], experiment["baseline"]["mape"])

    def test_features_window_and_rows_match_csv(self):
        features = self.client.get("/api/q2/feature-importance").json()
        window = self.client.get("/api/q2/event-window-analysis").json()
        impact = self.client.get("/api/q2/impact-results").json()
        with (Q2_DIR / "event_feature_importance.csv").open(
            encoding="utf-8", newline=""
        ) as source_file:
            source_features = list(csv.DictReader(source_file))
        with (Q2_DIR / "event_impact_results.csv").open(
            encoding="utf-8", newline=""
        ) as source_file:
            source_rows = list(csv.DictReader(source_file))
        self.assertEqual(features["metric"], "absolute standardized Ridge coefficient")
        self.assertEqual(
            [entry["feature"] for entry in features["features"]],
            [row["feature"] for row in source_features],
        )
        self.assertEqual(
            features["features"][0]["coefficient"], float(source_features[0]["coefficient"])
        )
        self.assertEqual(window["event_window"]["rows"], 75)
        self.assertEqual(impact["count"], len(source_rows))
        self.assertTrue(all(math.isfinite(row["price"]) for row in impact["results"]))

    def test_supervisor_routes_to_q2_specialist(self):
        class FakeQ2:
            def get_summary(self):
                return {"status": "success", "origin": "q2"}

            def get_feature_importance(self):
                return {"status": "success", "features": []}

            def get_event_window_analysis(self):
                return {"status": "success", "event_window": {}}

            def get_impact_results(self):
                return {"status": "success", "results": []}

        supervisor = Supervisor(event_impact_agent=FakeQ2())
        self.assertEqual(supervisor.run("q2_event_impact", {})["origin"], "q2")
        self.assertEqual(supervisor.run("q2_feature_importance", {})["status"], "success")

    def test_missing_q2_files_return_structured_state(self):
        with TemporaryDirectory() as directory:
            with patch.object(q2_event_service, "Q2_DIR", Path(directory)):
                q2_event_service.summary.cache_clear()
                response = Supervisor().run("q2_event_impact", {})
                self.assertEqual(response["status"], "q2_data_missing")
                self.assertNotIn("traceback", response["message"].lower())
        q2_event_service.summary.cache_clear()


if __name__ == "__main__":
    unittest.main()
