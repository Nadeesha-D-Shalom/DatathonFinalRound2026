import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.agents.carbon_agent import CarbonForecastAgent
from backend.agents.co2_agent import CO2PredictionAgent
from backend.main import app
from backend.schemas.requests import EnergyMix
from backend.services.comparison import compare_predictions
from backend.services.scenario_engine import ScenarioEngine
from backend.supervisor import Supervisor


VALID_MIX = {"coal_pct": 15, "oil_pct": 10, "gas_pct": 20, "nuclear_pct": 10,
             "hydro_pct": 5, "solar_pct": 20, "wind_pct": 15, "other_renewables_pct": 5}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {"status": "ok", "carbon_model": "not_connected", "co2_model": "not_connected"})

    def test_agents_have_safe_missing_model_state(self):
        self.assertEqual(CarbonForecastAgent().predict('EU_ETS')['status'], 'model_not_connected')
        self.assertEqual(CO2PredictionAgent().predict(VALID_MIX)['status'], 'model_not_connected')

    def test_supervisor_routes_all_tasks(self):
        supervisor = Supervisor()
        self.assertEqual(supervisor.run('carbon_forecast', {'market': 'EU_ETS'})['status'], 'model_not_connected')
        self.assertEqual(supervisor.run('co2_prediction', {'energy_mix': VALID_MIX})['status'], 'model_not_connected')
        self.assertEqual(supervisor.run('compare_2030_scenario', {'country': 'Germany', 'target_year': 2030, 'energy_mix': VALID_MIX})['status'], 'baseline_not_available')
        self.assertEqual(supervisor.run('unknown', {})['status'], 'validation_error')

    def test_api_development_states(self):
        self.assertEqual(self.client.post('/api/carbon/forecast', json={'market': 'EU_ETS'}).json()['status'], 'model_not_connected')
        self.assertEqual(self.client.post('/api/co2/predict', json={'energy_mix': VALID_MIX}).json()['status'], 'model_not_connected')
        self.assertEqual(self.client.post('/api/scenario/compare', json={'country': 'Germany', 'target_year': 2030, 'energy_mix': VALID_MIX}).json()['status'], 'baseline_not_available')

    def test_market_and_country_validation(self):
        self.assertEqual(self.client.post('/api/carbon/forecast', json={'market': 'unknown'}).json()['status'], 'validation_error')
        self.assertEqual(self.client.post('/api/scenario/compare', json={'country': 'Atlantis', 'energy_mix': VALID_MIX}).json()['status'], 'validation_error')

    def test_mix_validation(self):
        for update in ({'coal_pct': -10}, {'solar_pct': 120}, {'coal_pct': 1}, {'coal_pct': None}):
            payload = {**VALID_MIX, **update}
            response = self.client.post('/api/co2/predict', json={'energy_mix': payload})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()['status'], 'validation_error')
        near = {**VALID_MIX, 'coal_pct': 15.3}
        self.assertEqual(EnergyMix.model_validate(near).coal_pct, 15.3)
        with self.assertRaises(ValidationError):
            EnergyMix.model_validate({**VALID_MIX, 'solar_pct': float('nan')})

    def test_comparison_and_zero_baseline(self):
        reduction = compare_predictions(10, 7)
        self.assertEqual((reduction['difference'], reduction['reduction'], reduction['reduction_percent'], reduction['direction']), (-3, 3, 30, 'decrease'))
        self.assertEqual(compare_predictions(0, 2)['reduction_percent'], 0)
        self.assertEqual(compare_predictions(5, 7)['reduction_percent'], -40)
        self.assertEqual(compare_predictions(2, 2)['direction'], 'unchanged')

    def test_scenario_uses_same_agent_twice(self):
        class FakeAgent:
            calls = 0
            def predict(self, energy_mix):
                self.calls += 1
                return {'status': 'success', 'co2_per_capita_t': 10 if self.calls == 1 else 7, 'model': {'name': 'test adapter', 'r2': 0.5, 'rmse': 1}}
        agent = FakeAgent()
        engine = ScenarioEngine(agent, lambda country: {'status': 'success', 'energy_mix': VALID_MIX})
        response = engine.compare('Germany', 2030, EnergyMix.model_validate(VALID_MIX))
        self.assertEqual(agent.calls, 2)
        self.assertEqual(response['comparison']['reduction_percent'], 30)

    def test_specialist_failure_is_sanitized(self):
        class BrokenCarbonAgent:
            connected = False
            def predict(self, market):
                raise RuntimeError('private model traceback')
        class InvalidCO2Agent:
            connected = True
            def predict(self, energy_mix):
                return {'status': 'success', 'co2_per_capita_t': float('nan'), 'model': {'name': 'bad', 'r2': 1, 'rmse': 0}}
        carbon = Supervisor(carbon_agent=BrokenCarbonAgent()).run('carbon_forecast', {'market': 'EU_ETS'})
        co2 = Supervisor(co2_agent=InvalidCO2Agent()).run('co2_prediction', {'energy_mix': VALID_MIX})
        self.assertEqual(carbon['status'], 'prediction_error')
        self.assertNotIn('private model traceback', carbon['message'])
        self.assertEqual(co2['status'], 'prediction_error')


if __name__ == '__main__':
    unittest.main()
