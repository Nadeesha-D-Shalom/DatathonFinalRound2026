"""Readiness includes artifact deserialization, not just path existence."""
from functools import lru_cache
from pathlib import Path
import warnings
import joblib
import numpy as np
from sklearn.exceptions import InconsistentVersionWarning

ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=7)
def load_artifact(relative):
    with warnings.catch_warnings():
        warnings.simplefilter("error", InconsistentVersionWarning)
        artifact = joblib.load(ROOT / relative)
    if relative.startswith("models/carbon"):
        if not np.isfinite(np.asarray(artifact.forecast(steps=1))).all():
            raise ValueError("Invalid ARIMA model output")
    elif (not isinstance(artifact, dict) or not all(k in artifact for k in ("model", "scaler", "feature_columns"))
          or not callable(getattr(artifact["model"], "predict", None))
          or artifact["model"].n_features_in_ != len(artifact["feature_columns"])):
        raise ValueError("Invalid Q2 artifact package")
    return artifact


def health(supervisor):
    components = {}
    for name, check in {
        "carbon": lambda: [load_artifact(f"models/carbon/ARIMA_{market}.pkl")
                            for market in supervisor.carbon_agent.get_markets()["markets"]]
                          and supervisor.carbon_agent.connected,
        "co2": lambda: supervisor.co2_agent.connected and all(
            supervisor.run(task, {}).get("status") == "success" for task in
            ("co2_model_summary", "co2_feature_importance", "co2_model_comparison", "co2_test_predictions")),
        "q2": lambda: [load_artifact(f"models/q2/{name}.pkl")
                        for name in ("ridge_baseline", "ridge_event_aware")]
                      and all(supervisor.run(task, {}).get("status") == "success" for task in
                              ("q2_event_impact", "q2_feature_importance", "q2_event_window", "q2_impact_results")),
        "q3": lambda: supervisor.run("q3_summary", {}).get("status") == "success",
        "observed": lambda: supervisor.run("dashboard", {}).get("status") == "success",
    }.items():
        try:
            components[name] = "ready" if check() else "not_ready"
        except Exception:
            components[name] = "not_ready"
    components["assistant"] = "ready" if all(v == "ready" for v in components.values()) else "degraded"
    return {"status": "ok" if all(v == "ready" for v in components.values()) else "degraded",
            "components": components,
            "carbon_model": "connected" if components["carbon"] == "ready" else "not_connected",
            "co2_model": "connected" if components["co2"] == "ready" else "not_connected"}
