import csv
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.q3_transition_service import ROOT
from backend.supervisor import Supervisor


class Q3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_package_coverage_and_archetypes(self):
        summary = self.client.get("/api/q3/summary").json()
        archetypes = self.client.get("/api/q3/archetypes").json()
        self.assertEqual(summary["status"], "success")
        self.assertEqual(sum(summary["archetype_counts"].values()), 50)
        self.assertEqual(len(archetypes["countries"]), 50)
        self.assertEqual(
            {row["trajectory"] for row in archetypes["countries"]},
            {"BAU", "Moderate", "Accelerated"},
        )
        self.assertEqual(
            sorted(
                set(
                    row["year"] for row in self.client.get("/api/q3/global-trends").json()["trends"]
                )
            ),
            list(range(2000, 2027)),
        )

    def test_annual_forecasts_match_supplied_2030_csv(self):
        with (ROOT / "co2_scenario_2030_summary.csv").open(
            newline="", encoding="utf-8-sig"
        ) as file:
            source = list(csv.DictReader(file))
        countries = self.client.get("/api/q3/scenario-countries").json()["countries"]
        self.assertEqual(countries, sorted(row["country"] for row in source))
        for row in source:
            country = row["country"]
            result = self.client.get(f"/api/q3/countries/{country}/scenarios").json()
            summary = self.client.get(f"/api/q3/countries/{country}/2030").json()
            self.assertEqual(result["status"], "success")
            for name in ("BAU", "Moderate", "Accelerated"):
                years = result["scenarios"][name]
                self.assertEqual([point["year"] for point in years], [2026, 2027, 2028, 2029, 2030])
                self.assertAlmostEqual(years[-1]["co2_per_capita_t"], float(row[name]))
                self.assertAlmostEqual(summary[name], float(row[name]))

    def test_unsupported_country_has_archetype_but_no_forecast(self):
        self.assertEqual(
            self.client.get("/api/q3/countries/Germany/transition").json()["status"], "success"
        )
        self.assertEqual(
            self.client.get("/api/q3/countries/Germany/scenarios").json()["status"],
            "scenario_not_available",
        )
        self.assertEqual(
            self.client.get("/api/q3/countries/Germany/2030").json()["status"],
            "scenario_not_available",
        )

    def test_supervisor_q3_routes(self):
        supervisor = Supervisor()
        self.assertEqual(supervisor.run("q3_summary", {})["status"], "success")
        self.assertEqual(
            supervisor.run("q3_transition", {"country": "Algeria"})["country"], "Algeria"
        )
        self.assertEqual(
            supervisor.run("q3_scenario_forecast", {"country": "Atlantis"})["status"],
            "country_not_found",
        )
