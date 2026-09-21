"""Q1.2 Random Forest adapter using the final notebook's exact feature formulas.

The two pickle files are trusted competition artifacts. Never load user-supplied pickles.
"""

import csv
import json
import math
import pickle
import warnings
from functools import lru_cache
from pathlib import Path

import pandas as pd
import joblib
import sklearn
from sklearn.exceptions import InconsistentVersionWarning


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "co2"
DATA_DIR = ROOT / "data" / "co2"
RAW_FEATURES = (
    "coal_pct", "oil_pct", "gas_pct", "nuclear_pct", "hydro_pct", "solar_pct",
    "wind_pct", "other_renewables_pct",
)


class CO2ServiceError(Exception):
    def __init__(self, status: str, message: str):
        self.status = status
        super().__init__(message)


def _read_csv(filename: str) -> list[dict]:
    try:
        with (DATA_DIR / filename).open(newline="", encoding="utf-8-sig") as stream:
            return list(csv.DictReader(stream))
    except (OSError, csv.Error) as exc:
        raise CO2ServiceError("dataset_error", f"Q1.2 {filename} is unavailable or invalid.") from exc


def model_summary() -> dict:
    try:
        summary = json.loads((DATA_DIR / "dashboard_summary.json").read_text(encoding="utf-8"))
        results = _read_csv("final_test_results.csv")
        if len(results) != 1 or results[0]["Model"] != "Random Forest":
            raise ValueError("Unexpected final model result")
        return {"status": "success", "summary": summary, "final_test_result": results[0]}
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise CO2ServiceError("dataset_error", "Q1.2 model summary is unavailable or invalid.") from exc


def feature_importance() -> dict:
    return {"status": "success", "features": [
        {"feature": row["feature"], "importance": float(row["importance"])}
        for row in _read_csv("feature_importance.csv")
    ]}


def model_comparison() -> dict:
    return {"status": "success", "models": [
        {"model": row["Model"], "r2": float(row["R2"]),
         "rmse": float(row["RMSE"]), "mae": float(row["MAE"])}
        for row in _read_csv("validation_model_comparison.csv")
    ]}


def test_predictions() -> dict:
    return {"status": "success", "period": "2024–2026", "predictions": [
        {"year": int(row["year"]), "iso3": row["iso3"], "country": row["country"],
         "region": row["region"], "co2_per_capita_t": float(row["co2_per_capita_t"]),
         "predicted_co2_per_capita_t": float(row["predicted_co2_per_capita_t"]),
         "absolute_error": float(row["absolute_error"])}
        for row in _read_csv("test_predictions.csv")
    ]}


@lru_cache(maxsize=1)
def load_model():
    if sklearn.__version__ != "1.6.1":
        raise CO2ServiceError("model_load_error", "Q1.2 model requires scikit-learn 1.6.1.")
    model_path = MODEL_DIR / "final_random_forest_co2_per_capita.pkl"
    feature_path = MODEL_DIR / "final_features.pkl"
    if not model_path.is_file():
        raise CO2ServiceError("model_not_found", "Final CO₂ model artifact was not found.")
    if not feature_path.is_file():
        raise CO2ServiceError("feature_file_not_found", "Final CO₂ feature-order artifact was not found.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", InconsistentVersionWarning)
            with feature_path.open("rb") as stream:
                features = pickle.load(stream)
            model = joblib.load(model_path)
        if not isinstance(features, (list, tuple)) or len(features) != 16 or len(set(features)) != 16:
            raise CO2ServiceError("feature_mismatch", "Final CO₂ feature list is invalid.")
        if list(getattr(model, "feature_names_in_", [])) != list(features):
            raise CO2ServiceError("feature_mismatch", "Model and final feature-order artifact disagree.")
        return model, tuple(features)
    except CO2ServiceError:
        raise
    except (OSError, pickle.UnpicklingError, InconsistentVersionWarning, ImportError, AttributeError) as exc:
        raise CO2ServiceError("model_load_error", "Final CO₂ model could not be loaded safely.") from exc


def build_features(energy_mix: dict, year: int, feature_order: tuple[str, ...]) -> pd.DataFrame:
    # Source: notebooks/final/Data_Heists_notebook_.ipynb, Q1.2 FEATURE ENGINEERING
    # and ADD TEMPORAL FEATURES cells. The CSV totals are rounded independently,
    # so raw-input inference calculates them from the submitted eight shares.
    if type(year) is not int or not 2000 <= year <= 2026:
        raise CO2ServiceError("invalid_year", "Q1.2 estimates require a year from 2000 through 2026.")
    try:
        raw = {key: float(energy_mix[key]) for key in RAW_FEATURES}
    except (KeyError, TypeError, ValueError) as exc:
        raise CO2ServiceError("invalid_energy_mix", "All eight numeric energy shares are required.") from exc
    if any(not math.isfinite(value) or value < 0 or value > 100 for value in raw.values()):
        raise CO2ServiceError("invalid_energy_mix", "Energy shares must be finite values from 0 to 100%.")
    if abs(sum(raw.values()) - 100) > 0.5:
        raise CO2ServiceError("invalid_energy_mix", "Energy mix percentages must total approximately 100%.")
    fossil = raw["coal_pct"] + raw["oil_pct"] + raw["gas_pct"]
    renewable = raw["hydro_pct"] + raw["solar_pct"] + raw["wind_pct"] + raw["other_renewables_pct"]
    low_carbon = raw["nuclear_pct"] + renewable
    values = {
        **raw,
        "fossil_total_pct": fossil,
        "renewables_total_pct": renewable,
        "low_carbon_pct": low_carbon,
        "solar_wind_pct": raw["solar_pct"] + raw["wind_pct"],
        "fossil_clean_ratio": fossil / (low_carbon + 1e-6),
        "energy_hhi": sum((value / 100) ** 2 for value in raw.values()),
        "dominant_source_pct": max(raw.values()),
        "year_norm": year - 2000,
    }
    if set(values) != set(feature_order):
        raise CO2ServiceError("feature_mismatch", "Engineered features do not match the final model contract.")
    return pd.DataFrame([{key: values[key] for key in feature_order}], columns=feature_order)


class CO2PredictionService:
    @property
    def connected(self) -> bool:
        try:
            load_model()
            return True
        except CO2ServiceError:
            return False

    def predict(self, energy_mix: dict, year: int) -> float:
        model, features = load_model()
        frame = build_features(energy_mix, year, features)
        try:
            prediction = float(model.predict(frame)[0])
        except Exception as exc:
            raise CO2ServiceError("prediction_error", "Final CO₂ model could not complete this prediction.") from exc
        if not math.isfinite(prediction) or prediction < 0:
            raise CO2ServiceError("prediction_error", "Final CO₂ model returned an invalid prediction.")
        return prediction
