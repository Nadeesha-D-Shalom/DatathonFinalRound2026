"""Specialist wrapper for validated Q3 analysis outputs; no model training."""

from backend.services import q3_transition_service as service


class Q3TransitionAgent:
    def get_summary(self):
        return service.get_q3_summary()

    def get_global_trends(self):
        return service.get_global_transition_trends()

    def get_archetypes(self):
        return service.get_archetype_summary()

    def get_country_transition(self, country):
        return service.get_country_transition(country)

    def get_country_scenarios(self, country):
        return service.get_country_scenarios(country)

    def get_country_2030(self, country):
        return service.get_country_2030_summary(country)

    def get_scenario_countries(self):
        return service.get_available_scenario_countries()
