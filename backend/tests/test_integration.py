import csv
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.main import app
from backend.supervisor import Supervisor
from backend.services.co2_prediction_service import RAW_FEATURES, build_features, load_model
from backend.services.health_service import health

ROOT = Path(__file__).resolve().parents[2]


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_every_market_forecast_and_interval_matches_export(self):
        with (ROOT / "backend/data/carbon/carbon_price_30day_forecast.csv").open(encoding="utf-8-sig") as file:
            rows = list(csv.DictReader(file))
        for market in self.client.get("/api/carbon/markets").json()["markets"]:
            result = self.client.post("/api/carbon/forecast", json={"market": market}).json()
            self.assertEqual(result["status"], "success", result)
            expected = sorted([r for r in rows if r["market"] == market], key=lambda r: r["forecast_date"])
            self.assertEqual(len(result["forecast"]), 30)
            for actual, original in zip(result["forecast"], expected):
                self.assertEqual(actual["date"], original["forecast_date"])
                for key, column in (("predicted_price", "forecast_price"), ("lower_95", "lower_95"), ("upper_95", "upper_95")):
                    self.assertEqual(actual[key], float(original[column]))

    def test_feature_formulas_and_authoritative_order(self):
        _, order = load_model()
        mix = dict(zip(RAW_FEATURES, (20, 10, 30, 5, 10, 10, 10, 5)))
        frame = build_features(mix, 2026, order)
        self.assertEqual(list(frame.columns), list(order))
        expected = {"fossil_total_pct": 60, "renewables_total_pct": 35, "low_carbon_pct": 40,
                    "solar_wind_pct": 20, "fossil_clean_ratio": 60 / (40 + 1e-6),
                    "energy_hhi": .175, "dominant_source_pct": 30, "year_norm": 26}
        for name, value in expected.items():
            self.assertAlmostEqual(frame.iloc[0][name], value)

    def test_colombia_custom_mix_reaches_real_model_without_future_values(self):
        observed = self.client.get("/api/countries/Colombia/energy-co2").json()
        mix = {key: observed["energy_mix"][key] for key in RAW_FEATURES}
        mix["wind_pct"] += 1
        donor = max((k for k in RAW_FEATURES if k != "wind_pct"), key=mix.get)
        mix[donor] -= 1
        result = self.client.post("/api/co2/predict", json={"year": observed["latest_year"], "energy_mix": mix}).json()
        model, order = load_model()
        self.assertEqual(result["status"], "success")
        self.assertAlmostEqual(result["co2_per_capita_t"], float(model.predict(build_features(mix, 2026, order))[0]), places=6)
        self.assertIsNone(result["yearly_forecast"])
        self.assertEqual(self.client.get("/api/q3/countries/Colombia/transition").json()["status"], "success")
        self.assertEqual(self.client.get("/api/q3/countries/Colombia/scenarios").json()["status"], "scenario_not_available")

    def test_assistant_routes_requested_questions_to_real_outputs(self):
        cases = [
            ("What is the Q1.2 test R²?", "model_results", "0.3409"),
            ("Which model predicts CO2 per person?", "model_results", "Random Forest"),
            ("Did climate events improve prediction?", "climate_events", "marginal"),
            ("What is Colombia's transition trajectory?", "transition_status", "Colombia"),
            ("Compare BAU and Accelerated for Algeria.", "scenario_2030", "conditional"),
            ("What is the 30-day EU ETS outlook?", "carbon_market", "ARIMA"),
            ("What is India's renewable share?", "country_energy", "India"),
            ("Estimate CO2 for Colombia", "co2_prediction", "reference year"),
            ("Prepare a sovereign brief for Algeria", "sovereign_brief", "Algeria"),
        ]
        for question, intent, text in cases:
            result = self.client.post("/api/assistant/query", json={"query": question}).json()
            self.assertEqual(result["status"], "success", result)
            self.assertEqual(result["intent"], intent, result)
            self.assertIn(text, result["answer"])
            self.assertTrue(result["sources"])
        actual = self.client.post("/api/assistant/query", json={"query": "Compare BAU and Accelerated for Algeria"}).json()
        self.assertEqual(actual["data"], self.client.get("/api/q3/countries/Algeria/2030").json())

    def test_assistant_unavailable_and_context(self):
        response = self.client.post("/api/assistant/query", json={"query": "Colombia 2030 scenarios"}).json()
        self.assertEqual(response["status"], "scenario_not_available")
        self.assertNotIn("BAU", response["data"])
        response = self.client.post("/api/assistant/query", json={"query": "What about its transition?", "context": {"country": "Colombia"}}).json()
        self.assertEqual(response["data"]["country"], "Colombia")
        response = self.client.post("/api/assistant/query", json={"query": "Predict disaster probability for Colombia"}).json()
        self.assertIn("unavailable", response["answer"])
        self.assertEqual(response["data"], {})

    def test_brief_reuses_source_results(self):
        brief = self.client.get("/api/brief/Algeria?market=EU_ETS").json()
        self.assertEqual(brief["status"], "success", brief)
        for field, path in (("observed", "/api/countries/Algeria/energy-co2"),
                            ("transition", "/api/q3/countries/Algeria/transition"),
                            ("scenario", "/api/q3/countries/Algeria/2030"),
                            ("q2", "/api/q2/summary"), ("outlook", "/api/carbon/analysis-outlook/EU_ETS")):
            self.assertEqual(brief[field], self.client.get(path).json())
        self.assertEqual(brief["co2_estimate"]["status"], "success")
        self.assertEqual(brief["temperature"]["region"], "Global")

    def test_dashboard_uses_original_observations_and_arima(self):
        data = self.client.get("/api/dashboard").json()
        self.assertEqual(data["status"], "success", data)
        self.assertEqual(len(data["quality"]), 5)
        self.assertEqual(len(data["countriesData"]), 1350)
        self.assertNotIn("scenarios", data)
        self.assertNotIn("co2Model", data)
        for market in data["markets"]:
            self.assertEqual(data["carbon"][market]["model"]["name"], "ARIMA (1,1,1)")
        with (ROOT / "Dataset/co2_emissions_yearly.csv").open(encoding="utf-8-sig") as file:
            original = {(r["country"], int(r["year"])): float(r["co2_per_capita_t"]) for r in csv.DictReader(file)}
        for row in data["countriesData"]:
            self.assertAlmostEqual(row["co2_per_capita_t"], original[row["country"], row["year"]])

    def test_health_failure_is_truthful(self):
        with patch("backend.services.health_service.load_artifact", side_effect=RuntimeError("private path")):
            result = health(Supervisor())
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["components"]["carbon"], "not_ready")
        self.assertEqual(result["components"]["q2"], "not_ready")
        self.assertNotIn("private path", str(result))

    def test_trace_identifies_route_agent_status(self):
        with self.assertLogs("monsoon.supervisor", level="INFO") as logs:
            Supervisor().run("co2_prediction", {"energy_mix": dict(zip(RAW_FEATURES, (20, 10, 30, 5, 10, 10, 10, 5)))})
        self.assertIn("route=co2_prediction agent=CO2PredictionAgent status=success", " ".join(logs.output))

    def test_section50_co2_feature_order(self):
        _, order = load_model()
        self.assertEqual(len(order), 16)
        expected_order = (
            "coal_pct", "oil_pct", "gas_pct", "nuclear_pct", "hydro_pct", "solar_pct",
            "wind_pct", "other_renewables_pct", "fossil_total_pct", "renewables_total_pct",
            "low_carbon_pct", "solar_wind_pct", "fossil_clean_ratio", "energy_hhi",
            "dominant_source_pct", "year_norm"
        )
        self.assertEqual(tuple(order), expected_order)

    def test_section50_co2_prediction_api(self):
        mix = {"coal_pct": 20, "oil_pct": 10, "gas_pct": 30, "nuclear_pct": 5,
               "hydro_pct": 10, "solar_pct": 10, "wind_pct": 10, "other_renewables_pct": 5}
        resp = self.client.post("/api/co2/predict", json={"year": 2026, "energy_mix": mix})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["model"]["name"], "Random Forest Regressor")
        self.assertAlmostEqual(data["model"]["r2"], 0.3409, places=4)
        self.assertIn("predicted_co2_per_capita_t", data)

    def test_section50_supervisor_co2_routing(self):
        mix = {"coal_pct": 20, "oil_pct": 10, "gas_pct": 30, "nuclear_pct": 5,
               "hydro_pct": 10, "solar_pct": 10, "wind_pct": 10, "other_renewables_pct": 5}
        supervisor = Supervisor()
        res = supervisor.run("co2_prediction", {"year": 2026, "energy_mix": mix})
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["unit"], "tonnes CO2 per person")

    def test_section50_q2_summary(self):
        resp = self.client.get("/api/q2/summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        exp = data["experiment"]
        self.assertAlmostEqual(exp["baseline"]["rmse"], 0.038101, places=5)
        self.assertAlmostEqual(exp["event_aware"]["rmse"], 0.038095, places=5)
        self.assertAlmostEqual(exp["comparison"]["rmse_improvement_percent"], 0.0163, places=3)

    def test_section50_q3_scenario_retrieval(self):
        resp = self.client.get("/api/q3/countries/Algeria/scenarios")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("BAU", data["scenarios"])
        self.assertEqual(len(data["scenarios"]["BAU"]), 5)

    def test_section50_unsupported_q3_country(self):
        resp = self.client.get("/api/q3/countries/Canada/scenarios")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "scenario_not_available")

    def test_section50_assistant_intent_routing(self):
        q = "Did climate events improve carbon price prediction?"
        resp = self.client.post("/api/assistant/query", json={"query": q})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["intent"], "climate_events")

    def test_section50_health_component_status(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        for comp in ("carbon", "co2", "q2", "q3", "assistant"):
            self.assertEqual(data["components"].get(comp), "ready")


if __name__ == "__main__":
    unittest.main()
