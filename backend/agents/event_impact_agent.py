"""Q2 specialist exposing validated analysis outputs, not runtime model inference."""

from backend.services import q2_event_service


class EventImpactAgent:
    def get_summary(self) -> dict:
        return q2_event_service.summary()

    def get_feature_importance(self) -> dict:
        return q2_event_service.feature_importance()

    def get_event_window_analysis(self) -> dict:
        return q2_event_service.event_window_analysis()

    def get_impact_results(self) -> dict:
        return q2_event_service.impact_results()
