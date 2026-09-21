"""Real browser + FastAPI checks. Start backend and production dashboard first.

MONSOON_UI_URL (default http://localhost:3011) and MONSOON_API_URL
(default http://127.0.0.1:8011) select isolated test servers. The route forwards
requests to that real backend; it never supplies fixture predictions.
Run: .venv/Scripts/python dashboard/tests/browser_flow.py -v
"""
import json
import os
import unittest
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

UI = os.getenv("MONSOON_UI_URL", "http://localhost:3011")
API = os.getenv("MONSOON_API_URL", "http://127.0.0.1:8011")


def api(path):
    with urlopen(API + path) as response:
        return json.load(response)


class BrowserFlows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(channel="msedge", headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 1000})
        self.page.set_default_timeout(10000)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.route("http://localhost:8000/**", lambda route: route.fulfill(
            response=route.fetch(url=API + route.request.url.split(":8000", 1)[1])))
        self.page.goto(UI)
        expect(self.page.get_by_role("heading", name="Climate & Energy Overview")).to_be_visible(timeout=30000)

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def navigate(self, name):
        self.page.get_by_role("navigation", name="Main navigation").get_by_role("button", name=name, exact=True).click()

    def test_carbon_all_markets(self):
        self.navigate("Carbon Price Forecast")
        expect(self.page.get_by_role("heading", name="Carbon Price Forecast", exact=True)).to_be_visible()
        for market in api("/api/carbon/markets")["markets"]:
            self.page.get_by_label("Carbon market", exact=True).select_option(market)
            expect(self.page.get_by_text("ARIMA (1,1,1) connected", exact=False)).to_be_visible()
            last = api("/api/carbon/analysis-outlook/" + market)
            expect(self.page.locator(".v2-kpi").filter(has_text="Predicted price")).to_contain_text(f"{last['forecast_price']:,.2f}".rstrip('0').rstrip('.'))

    def test_energy_prediction_updates_without_refresh(self):
        self.navigate("CO₂ & Energy")
        self.page.get_by_label("Country", exact=True).select_option("Colombia")
        wind = self.page.get_by_label("Wind percentage", exact=True)
        expect(wind).to_be_visible()
        wind.fill("20")
        with self.page.expect_response(lambda r: "/api/co2/predict" in r.url and r.request.post_data_json["energy_mix"]["wind_pct"] == 20) as response:
            self.page.get_by_role("button", name="Predict CO₂", exact=True).click()
        result = response.value.json()
        self.assertEqual(result["status"], "success")
        expect(self.page.get_by_text("Your energy mix · model prediction", exact=True)).to_be_visible()
        expect(self.page.get_by_text(f"{result['co2_per_capita_t']:,.2f} tonnes", exact=False)).to_be_visible()
        wind.fill("21")
        expect(self.page.get_by_text("Your energy mix · model prediction", exact=True)).to_have_count(0)

    def test_colombia_simulator_custom_and_supported_q3(self):
        self.navigate("2030 Simulator")
        self.page.get_by_label("Country", exact=True).select_option("Colombia")
        self.page.get_by_label("Forecast Year", exact=True).select_option("2028")
        expect(self.page.get_by_role("status").filter(has_text="Validated 2026–2030 Q3 scenario outputs")).to_be_visible()
        self.page.get_by_label("Wind percentage", exact=True).fill("20")
        with self.page.expect_response(lambda r: "/api/co2/predict" in r.url) as response:
            self.page.get_by_role("button", name="Run Simulation", exact=True).click()
        result = response.value.json()
        self.assertEqual(response.value.request.post_data_json["year"], 2026)
        self.assertAlmostEqual(sum(response.value.request.post_data_json["energy_mix"].values()), 100, places=1)
        expect(self.page.get_by_role("heading", name="Your Energy Plan", exact=True)).to_be_visible()
        expect(self.page.get_by_text(f"{result['co2_per_capita_t']:,.2f} t/person", exact=True)).to_be_visible()
        self.page.get_by_label("Wind percentage", exact=True).fill("21")
        expect(self.page.get_by_role("heading", name="Your Energy Plan", exact=True)).to_have_count(0)
        self.page.get_by_label("Country", exact=True).select_option("Algeria")
        q3 = api("/api/q3/countries/Algeria/scenarios")
        for name in ("BAU", "Moderate", "Accelerated"):
            value = next(r["co2_per_capita_t"] for r in q3["scenarios"][name] if r["year"] == 2028)
            expect(self.page.locator(".v2-kpi").filter(has_text=name)).to_contain_text(f"{value:,.2f} t/person")
        expect(self.page.get_by_text("2030", exact=True).first).to_be_attached()
        self.assertNotIn("awaiting integration", self.page.locator("main").inner_text().lower())

    def test_q2_metrics_and_features(self):
        self.navigate("Climate Events")
        summary = api("/api/q2/summary")["experiment"]
        for arm in ("baseline", "event_aware"):
            for metric in ("rmse", "mae", "mape"):
                expect(self.page.get_by_text(f"{summary[arm][metric]:,.4f}" + ("%" if metric == "mape" else ""), exact=True).first).to_be_visible()
        expect(self.page.get_by_role("heading", name="Which event features mattered most?")).to_be_visible()

    def test_simulator_discards_inflight_result_after_edit(self):
        self.navigate("2030 Simulator")
        pending = []
        self.page.route("**/api/co2/predict", lambda route: pending.append(route))
        self.page.get_by_label("Wind percentage", exact=True).fill("20")
        self.page.get_by_role("button", name="Run Simulation", exact=True).click()
        expect(self.page.get_by_role("button", name="Running simulation", exact=False)).to_be_disabled()
        self.page.get_by_label("Wind percentage", exact=True).fill("21")
        self.assertEqual(len(pending), 1)
        pending[0].fulfill(response=pending[0].fetch(url=API + "/api/co2/predict"))
        expect(self.page.get_by_role("heading", name="Your Energy Plan", exact=True)).to_have_count(0)
        expect(self.page.get_by_role("button", name="Run Simulation", exact=True)).to_be_enabled()

    def test_country_and_model_evidence(self):
        self.navigate("Country Explorer")
        self.page.get_by_label("Country", exact=True).select_option("Colombia")
        transition = api("/api/q3/countries/Colombia/transition")
        expect(self.page.get_by_text(transition["trajectory"], exact=True)).to_be_visible()
        expect(self.page.get_by_text("2030 scenario output not available", exact=False)).to_be_visible()
        self.navigate("Model Results")
        expect(self.page.get_by_text("0.3409", exact=False).first).to_be_visible()
        expect(self.page.get_by_role("heading", name="True 30-step comparison")).to_be_visible()

    def test_assistant_real_results(self):
        self.page.get_by_role("button", name="Briefwright", exact=False).first.click()
        questions = [("What is the Q1.2 test R²?", "0.3409"),
                     ("Did climate events improve prediction?", "marginal"),
                     ("What is Colombia's transition trajectory?", "Colombia"),
                     ("Compare BAU and Accelerated for Algeria", "conditional pathways")]
        for question, expected in questions:
            self.page.get_by_label("Ask Briefwright").fill(question)
            self.page.get_by_role("button", name="Send question").click()
            expect(self.page.locator(".assistant-answer").last).to_contain_text(expected)

    def test_brief_print_has_traceable_values(self):
        self.navigate("Sovereign Brief")
        expect(self.page.get_by_role("button", name="Print / Save PDF")).to_be_enabled()
        expect(self.page.get_by_text("Random Forest Regressor", exact=False).first).to_be_visible()
        self.page.emulate_media(media="print")
        text = self.page.locator("main").inner_text()
        for invalid in ("undefined", "NaN", "Awaiting model", "awaits integration"):
            self.assertNotIn(invalid, text)
        expect(self.page.locator(".v2-sidebar")).not_to_be_visible()


if __name__ == "__main__":
    unittest.main()
