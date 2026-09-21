"""Deterministic intent parsing. Factual answers always execute Supervisor tasks."""
import re
from backend.services.country_data_service import get_countries


def query(supervisor, question, context=None):
    text = question.casefold().replace("₂", "2")
    context = context or {}
    countries = [c for c in get_countries() if re.search(r"\b" + re.escape(c.casefold()) + r"\b", text)]
    country = countries[0] if len(countries) == 1 else context.get("country")
    market = next((m for m in supervisor.run("carbon_markets", {})["markets"]
                   if m.casefold().replace("_", " ") in text.replace("_", " ")), None)
    market = market or context.get("market")
    intent, task, payload = "unknown", None, {}
    if any(w in text for w in ("deaths", "medical", "election", "economic loss", "disaster probability")):
        answer = "That information is unavailable in the supplied competition data."
    elif "q1.2" in text or any(w in text for w in ("which model", "model accuracy", "test r", "model results")):
        intent, task = "model_results", "co2_model_summary"
    elif "event" in text:
        intent, task = "climate_events", "q2_event_impact"
    elif "brief" in text:
        intent, task = "sovereign_brief", "sovereign_brief"
    elif any(w in text for w in ("2030", "bau", "accelerated", "scenario")):
        intent, task = "scenario_2030", "q3_2030"
    elif any(w in text for w in ("transition", "trajectory", "archetype")):
        intent, task = "transition_status", "q3_transition"
    elif market or any(w in text for w in ("carbon price", "30-day", "30 day", "ets outlook")):
        intent, task = "carbon_market", "carbon_outlook"
    elif any(w in text for w in ("predict", "estimate")) and "co2" in text:
        intent, task = "co2_prediction", "sovereign_brief"
    elif country or any(w in text for w in ("energy", "renewable", "fossil")):
        intent, task = "country_energy", "country_profile"
    else:
        answer = "Ask about a supplied country's energy, transition or 2030 scenarios, a carbon market outlook, Q1.2 accuracy, or the Q2 event experiment."
    if len(countries) > 1:
        task = None
        answer = "Please ask about one country at a time."
    if task in {"country_profile", "q3_transition", "q3_2030", "sovereign_brief"}:
        if not country:
            task = None
            answer = "Please name a country from the supplied data."
        else:
            payload = {"country": country, "market": market or "EU_ETS"}
    if task == "carbon_outlook":
        if not market:
            task = None
            answer = "Please select California, China ETS, EU ETS, RGGI or UK ETS."
        else:
            payload = {"market": market}
    data = supervisor.run(task, payload) if task else {}
    sources = []
    if task and data.get("status") != "success":
        answer = data.get("message", "The requested validated data is unavailable.")
    elif task == "co2_model_summary":
        s = data["summary"]
        answer = (f"Q1.2 uses {s['model']} to estimate CO2 per person from energy mix. "
                  f"Test R²: {s['test']['r2']:.4f}; RMSE: {s['test']['rmse']:.4f} t/person; "
                  f"MAE: {s['test']['mae']:.4f} t/person. Validation R²: {s['validation']['r2']:.4f}. "
                  "It is not an annual time-series forecasting model.")
        sources = ["backend/data/co2/dashboard_summary.json", "backend/data/co2/final_test_results.csv"]
    elif task == "q2_event_impact":
        e = data["experiment"]
        answer = (f"Event features produced only marginal improvement: RMSE fell "
                  f"{e['comparison']['rmse_improvement_percent']:.4f}% "
                  f"({e['baseline']['rmse']:.6f} to {e['event_aware']['rmse']:.6f}). "
                  "Events provide contextual shock intelligence, not the primary carbon forecast. " + data["conclusion"])
        sources = data["source"]
    elif task == "q3_transition":
        answer = f"{data['country']}'s transition trajectory is {data['trajectory']}; transition score {data['transition_score']:.4f}."
        sources = ["backend/data/q3/country_transition_archetypes.csv"]
    elif task == "q3_2030":
        answer = (f"{country}, 2030: BAU {data['BAU']:.4f}, Moderate {data['Moderate']:.4f}, "
                  f"Accelerated {data['Accelerated']:.4f} tonnes CO2/person. "
                  f"BAU minus Accelerated: {data['BAU'] - data['Accelerated']:.4f} t/person. "
                  "These are conditional pathways, not probabilities.")
        sources = ["backend/data/q3/co2_scenario_2030_summary.csv"]
    elif task == "country_profile":
        answer = (f"{data['country']} ({data['latest_year']}): renewable share "
                  f"{data['energy_mix']['renewables_total_pct']:.2f}%, fossil share "
                  f"{data['energy_mix']['fossil_total_pct']:.2f}%, observed CO2 "
                  f"{data['co2']['co2_per_capita_t']:.2f} tonnes/person.")
        sources = data["sources"]
    elif task == "carbon_outlook":
        answer = (f"{market.replace('_', ' ')}: {data['model']} estimates {data['forecast_price']:.2f} "
                  f"{data['currency']} at {data['forecast_date']} (30 trading days), "
                  f"{data['change_percent']:+.2f}% from {data['last_observed_price']:.2f}. "
                  f"95% interval: {data['lower_95']:.2f}–{data['upper_95']:.2f} {data['currency']}.")
        sources = [data["source"]]
    elif task == "sovereign_brief":
        estimate = data["co2_estimate"]
        answer = (f"{country}: observed CO2 {data['observed']['co2']['co2_per_capita_t']:.2f} t/person. "
                  + (f"Energy-mix RF estimate: {estimate['co2_per_capita_t']:.2f} t/person at reference year {estimate['year']}. "
                     if estimate["status"] == "success" else "Energy-mix estimate unavailable. ")
                  + "The structured brief includes transition, Q2 context, Q3 scenarios and carbon outlook.")
        sources = data["sources"]
    return {"status": data.get("status", "success"), "intent": intent, "answer": answer,
            "sources": sources, "data": data, "context": {"country": country, "market": market}}
