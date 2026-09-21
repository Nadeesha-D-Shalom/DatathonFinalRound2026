import unittest
import csv
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.agents.carbon_agent import CarbonForecastAgent
from backend.agents.co2_agent import CO2PredictionAgent
from backend.main import app
from backend.schemas.requests import EnergyMix
from backend.services.comparison import compare_predictions
from backend.services.scenario_engine import ScenarioEngine
from backend.services.country_data_service import get_countries, get_country_energy_co2
from backend.supervisor import Supervisor


VALID_MIX = {
    "coal_pct": 15,
    "oil_pct": 10,
    "gas_pct": 20,
    "nuclear_pct": 10,
    "hydro_pct": 5,
    "solar_pct": 20,
    "wind_pct": 15,
    "other_renewables_pct": 5,
}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        result = self.client.get("/health").json()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["carbon_model"], "connected")
        self.assertEqual(result["co2_model"], "connected")
        self.assertTrue(all(v == "ready" for v in result["components"].values()))

    def test_agents_serve_validated_models(self):
        self.assertEqual(CarbonForecastAgent().predict("EU_ETS")["status"], "success")
        self.assertEqual(CO2PredictionAgent().predict(VALID_MIX)["status"], "success")

    def test_supervisor_routes_all_tasks(self):
        supervisor = Supervisor()
        self.assertEqual(
            supervisor.run("carbon_forecast", {"market": "EU_ETS"})["status"], "success"
        )
        self.assertEqual(
            supervisor.run("co2_prediction", {"energy_mix": VALID_MIX})["status"],
            "success",
        )
        self.assertEqual(
            supervisor.run(
                "compare_2030_scenario",
                {"country": "Germany", "target_year": 2030, "energy_mix": VALID_MIX},
            )["status"],
            "baseline_not_available",
        )
        self.assertEqual(supervisor.run("unknown", {})["status"], "validation_error")

    def test_api_development_states(self):
        self.assertEqual(
            self.client.post("/api/carbon/forecast", json={"market": "EU_ETS"}).json()["status"],
            "success",
        )
        self.assertEqual(
            self.client.post("/api/co2/predict", json={"energy_mix": VALID_MIX}).json()["status"],
            "success",
        )
        self.assertEqual(
            self.client.post(
                "/api/scenario/compare",
                json={"country": "Germany", "target_year": 2030, "energy_mix": VALID_MIX},
            ).json()["status"],
            "baseline_not_available",
        )
        self.assertEqual(
            self.client.post(
                "/api/scenario/compare",
                json={"country": "Egypt", "target_year": 2028, "energy_mix": VALID_MIX},
            ).json()["status"],
            "baseline_not_available",
        )

    def test_browser_preflight_and_scenario_response_are_distinct(self):
        preflight = self.client.options(
            "/api/scenario/compare",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], "http://localhost:3000")
        response = self.client.post(
            "/api/scenario/compare",
            json={
                "country": "Egypt",
                "target_year": 2027,
                "energy_mix": VALID_MIX,
            },
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "baseline_not_available")
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_scenario_year_contract_and_mix_tolerance(self):
        for year in (2027, 2028, 2029, 2030):
            response = self.client.post(
                "/api/scenario/compare",
                json={"country": "Egypt", "target_year": year, "energy_mix": VALID_MIX},
            )
            self.assertEqual(response.status_code, 200, year)
            self.assertEqual(response.json()["status"], "baseline_not_available", year)
            self.assertNotIn("co2_per_capita_t", response.json())
        for year in (2026, 2031, 2028.5, 2028.0, "2028"):
            response = self.client.post(
                "/api/scenario/compare",
                json={"country": "Egypt", "target_year": year, "energy_mix": VALID_MIX},
            )
            self.assertEqual(response.status_code, 422, year)
            self.assertEqual(response.json()["status"], "validation_error", year)
        near = {**VALID_MIX, "coal_pct": 15.000001}
        response = self.client.post(
            "/api/scenario/compare",
            json={"country": "Egypt", "target_year": 2028, "energy_mix": near},
        )
        self.assertEqual(response.json()["status"], "baseline_not_available")
        invalid = {**VALID_MIX, "coal_pct": 25}
        response = self.client.post(
            "/api/scenario/compare",
            json={"country": "Egypt", "target_year": 2028, "energy_mix": invalid},
        )
        self.assertEqual(response.status_code, 422)

    def test_country_list_and_profile_are_csv_backed(self):
        countries = self.client.get("/api/countries").json()["countries"]
        self.assertEqual(countries, sorted(countries))
        self.assertIn("Algeria", countries)
        profile = self.client.get("/api/countries/Algeria/energy-co2").json()
        self.assertEqual(profile["status"], "success")
        self.assertEqual(
            profile["latest_year"], max(row["year"] for row in profile["history"]["co2"])
        )
        self.assertEqual(
            profile["latest_year"], max(row["year"] for row in profile["history"]["energy_mix"])
        )
        root = Path(__file__).resolve().parents[2] / "Dataset"
        with (root / "co2_emissions_yearly.csv").open(newline="", encoding="utf-8") as source:
            all_co2 = [
                row
                for row in csv.DictReader(source)
                if row["country"] == "Algeria" and 2000 <= int(row["year"]) <= 2026
            ]
            original_co2 = next(
                row for row in all_co2 if int(row["year"]) == profile["latest_year"]
            )
        with (root / "energy_mix_yearly.csv").open(newline="", encoding="utf-8") as source:
            all_energy = [
                row
                for row in csv.DictReader(source)
                if row["country"] == "Algeria" and 2000 <= int(row["year"]) <= 2026
            ]
            original_energy = next(
                row for row in all_energy if int(row["year"]) == profile["latest_year"]
            )
        self.assertEqual(
            profile["co2"]["co2_per_capita_t"], float(original_co2["co2_per_capita_t"])
        )
        self.assertEqual(
            profile["energy_mix"]["renewables_total_pct"],
            float(original_energy["renewables_total_pct"]),
        )
        self.assertEqual(
            [row["year"] for row in profile["history"]["co2"]],
            sorted(int(row["year"]) for row in all_co2),
        )
        self.assertEqual(
            [row["year"] for row in profile["history"]["energy_mix"]],
            sorted(int(row["year"]) for row in all_energy),
        )
        self.assertEqual(get_countries(), countries)
        self.assertEqual(get_country_energy_co2("algeria")["country"], "Algeria")

    def test_missing_country_returns_structured_404(self):
        response = self.client.get("/api/countries/Atlantis/energy-co2")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["status"], "country_not_found")

    def test_market_and_country_validation(self):
        self.assertEqual(
            self.client.post("/api/carbon/forecast", json={"market": "unknown"}).json()["status"],
            "validation_error",
        )
        self.assertEqual(
            self.client.post(
                "/api/scenario/compare", json={"country": "Atlantis", "energy_mix": VALID_MIX}
            ).json()["status"],
            "validation_error",
        )

    def test_mix_validation(self):
        for update in ({"coal_pct": -10}, {"solar_pct": 120}, {"coal_pct": 1}, {"coal_pct": None}):
            payload = {**VALID_MIX, **update}
            response = self.client.post("/api/co2/predict", json={"energy_mix": payload})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["status"], "validation_error")
        near = {**VALID_MIX, "coal_pct": 15.3}
        self.assertEqual(EnergyMix.model_validate(near).coal_pct, 15.3)
        with self.assertRaises(ValidationError):
            EnergyMix.model_validate({**VALID_MIX, "solar_pct": float("nan")})

    def test_comparison_and_zero_baseline(self):
        reduction = compare_predictions(10, 7)
        self.assertEqual(
            (
                reduction["difference"],
                reduction["reduction"],
                reduction["reduction_percent"],
                reduction["direction"],
            ),
            (-3, 3, 30, "decrease"),
        )
        self.assertEqual(compare_predictions(0, 2)["reduction_percent"], 0)
        self.assertEqual(compare_predictions(5, 7)["reduction_percent"], -40)
        self.assertEqual(compare_predictions(2, 2)["direction"], "unchanged")

    def test_scenario_uses_same_agent_twice(self):
        class FakeAgent:
            calls = 0

            def predict(self, energy_mix, target_year=None):
                self.calls += 1
                return {
                    "status": "success",
                    "co2_per_capita_t": 10 if self.calls == 1 else 7,
                    "model": {"name": "test adapter", "r2": 0.5, "rmse": 1},
                }

        agent = FakeAgent()
        engine = ScenarioEngine(
            agent, lambda country, year: {"status": "success", "energy_mix": VALID_MIX}
        )
        response = engine.compare("Germany", 2030, EnergyMix.model_validate(VALID_MIX))
        self.assertEqual(agent.calls, 2)
        self.assertEqual(response["comparison"]["reduction_percent"], 30)
        self.assertEqual(response["baseline"]["energy_mix"], VALID_MIX)
        self.assertEqual(response["model"]["name"], "test adapter")

    def test_invalid_annual_model_output_is_rejected(self):
        class InvalidAnnualAgent:
            connected = True

            def predict(self, energy_mix, target_year=None):
                return {
                    "status": "success",
                    "co2_per_capita_t": 7,
                    "yearly_forecast": [{"year": 2028, "co2_per_capita_t": 7}],
                    "model": {"name": "test", "r2": 0.5, "rmse": 1},
                }

        engine = ScenarioEngine(
            InvalidAnnualAgent(),
            lambda country, year: {"status": "success", "energy_mix": VALID_MIX},
        )
        response = Supervisor(co2_agent=InvalidAnnualAgent(), scenario_engine=engine).run(
            "compare_2030_scenario", {"country": "Germany", "energy_mix": VALID_MIX}
        )
        self.assertEqual(response["status"], "prediction_error")

    def test_valid_annual_forecast_passes_through_without_interpolation(self):
        class AnnualAgent:
            connected = True

            def predict(self, energy_mix, target_year=None):
                annual = [
                    {"year": year, "co2_per_capita_t": 7, "co2_emissions_mt": 100}
                    for year in range(2027, 2031)
                ]
                return {
                    "status": "success",
                    "co2_per_capita_t": 7,
                    "yearly_forecast": annual,
                    "model": {"name": "test", "r2": 0.5, "rmse": 1},
                }

        engine = ScenarioEngine(
            AnnualAgent(), lambda country, year: {"status": "success", "energy_mix": VALID_MIX}
        )
        response = Supervisor(scenario_engine=engine).run(
            "compare_2030_scenario", {"country": "Germany", "energy_mix": VALID_MIX}
        )
        self.assertEqual(response["status"], "success")
        self.assertEqual(
            [point["year"] for point in response["user_scenario"]["yearly_forecast"]],
            [2027, 2028, 2029, 2030],
        )

    def test_selected_year_uses_only_validated_model_year(self):
        seen = []
        seen_years = []

        class AnnualAgent:
            connected = True

            def predict(self, energy_mix, target_year=None):
                seen.append(energy_mix["wind_pct"])
                seen_years.append(target_year)
                offset = 0 if len(seen) % 2 else 2
                annual = [
                    {
                        "year": year,
                        "co2_per_capita_t": year - 2020 + offset,
                        "co2_emissions_mt": 100 + year - 2027 + offset,
                    }
                    for year in range(2027, 2031)
                ]
                return {
                    "status": "success",
                    "co2_per_capita_t": annual[-1]["co2_per_capita_t"],
                    "yearly_forecast": annual,
                    "model": {"name": "test", "r2": 0.5, "rmse": 1},
                }

        engine = ScenarioEngine(
            AnnualAgent(), lambda country, year: {"status": "success", "energy_mix": VALID_MIX}
        )
        request = {
            "country": "Egypt",
            "target_year": 2028,
            "energy_mix": {**VALID_MIX, "wind_pct": 30, "solar_pct": 5},
        }
        response = Supervisor(scenario_engine=engine).run("compare_2030_scenario", request)
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["target_year"], 2028)
        self.assertEqual(response["baseline"]["co2_per_capita_t"], 8)
        self.assertEqual(response["user_scenario"]["co2_per_capita_t"], 10)
        self.assertEqual(response["user_scenario"]["co2_emissions_mt"], 103)
        self.assertEqual(seen, [15, 30])
        self.assertEqual(seen_years, [2028, 2028])

    def test_missing_annual_result_cannot_be_reused_for_2028(self):
        class EndpointAgent:
            connected = True

            def predict(self, energy_mix, target_year=None):
                return {
                    "status": "success",
                    "co2_per_capita_t": 7,
                    "model": {"name": "test", "r2": 0.5, "rmse": 1},
                }

        engine = ScenarioEngine(
            EndpointAgent(), lambda country, year: {"status": "success", "energy_mix": VALID_MIX}
        )
        response = Supervisor(scenario_engine=engine).run(
            "compare_2030_scenario",
            {"country": "Egypt", "target_year": 2028, "energy_mix": VALID_MIX},
        )
        self.assertEqual(response["status"], "year_not_supported")
        self.assertEqual(response["target_year"], 2028)
        self.assertNotIn("comparison", response)

    def test_specialist_failure_is_sanitized(self):
        class BrokenCarbonAgent:
            connected = False

            def predict(self, market):
                raise RuntimeError("private model traceback")

        class InvalidCO2Agent:
            connected = True

            def predict(self, energy_mix):
                return {
                    "status": "success",
                    "co2_per_capita_t": float("nan"),
                    "model": {"name": "bad", "r2": 1, "rmse": 0},
                }

        carbon = Supervisor(carbon_agent=BrokenCarbonAgent()).run(
            "carbon_forecast", {"market": "EU_ETS"}
        )
        co2 = Supervisor(co2_agent=InvalidCO2Agent()).run(
            "co2_prediction", {"energy_mix": VALID_MIX}
        )
        self.assertEqual(carbon["status"], "prediction_error")
        self.assertNotIn("private model traceback", carbon["message"])
        self.assertEqual(co2["status"], "prediction_error")


if __name__ == "__main__":
    unittest.main()
