"""Compose existing specialists; no extra predictive model."""
from backend.services.dashboard_service import observed_data
from backend.services.co2_prediction_service import RAW_FEATURES


def sovereign_brief(supervisor, country, market="EU_ETS"):
    observed = supervisor.run("country_profile", {"country": country})
    if observed["status"] != "success":
        return observed
    data = observed_data()
    events = [r for r in data["events"] if r["region"].casefold() in
              {observed["country"].casefold(), observed["region"].casefold()}]
    return {"status": "success", "country": observed["country"], "observed": observed,
            "transition": supervisor.run("q3_transition", {"country": country}),
            "scenario": supervisor.run("q3_2030", {"country": country}),
            "co2_estimate": supervisor.run("co2_prediction", {
                "year": observed["latest_year"],
                "energy_mix": {key: observed["energy_mix"][key] for key in RAW_FEATURES}}),
            "q2": supervisor.run("q2_event_impact", {}),
            "outlook": supervisor.run("carbon_outlook", {"market": market}),
            "events": sorted(events, key=lambda r: r["date"], reverse=True)[:3],
            "temperature": data["temperature"][-1],
            "sources": ["Dataset", "backend/data/carbon", "backend/data/co2",
                        "backend/data/q2", "backend/data/q3"]}
