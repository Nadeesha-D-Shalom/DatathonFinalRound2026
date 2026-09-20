"""Read the team's validated Q2 exports; never execute pickle files for display."""

import csv
import json
import math
from functools import lru_cache
from pathlib import Path

Q2_DIR = Path(__file__).resolve().parents[1] / "data" / "q2"


class Q2DataError(Exception):
    def __init__(self, status: str, message: str):
        self.status = status
        super().__init__(message)


def _path(name: str) -> Path:
    path = Q2_DIR / name
    if not path.is_file():
        raise Q2DataError("q2_data_missing", f"Q2 analysis file is unavailable: {name}.")
    return path


def _json(name: str) -> dict:
    try:
        value = json.loads(
            _path(name).read_text(encoding="utf-8-sig"),
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON value")),
        )
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object")
        return value
    except (ValueError, UnicodeError) as exc:
        raise Q2DataError("invalid_json", f"Q2 analysis JSON is invalid: {name}.") from exc


def _csv(name: str) -> list[dict[str, str]]:
    try:
        with _path(name).open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.DictReader(source))
        if not rows or any(
            None in row or any(value is None for value in row.values()) for row in rows
        ):
            raise ValueError("Empty or irregular CSV")
        return rows
    except (ValueError, UnicodeError, csv.Error) as exc:
        raise Q2DataError("invalid_csv", f"Q2 analysis CSV is invalid: {name}.") from exc


def _number(value, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise Q2DataError("invalid_csv", f"Q2 numeric field is invalid: {label}.") from exc
    if not math.isfinite(result):
        raise Q2DataError("invalid_csv", f"Q2 numeric field is invalid: {label}.")
    return result


@lru_cache(maxsize=1)
def summary() -> dict:
    raw = _json("q2_dashboard_summary.json")
    comparison = _csv("event_model_comparison.csv")
    by_name = {row["model"]: row for row in comparison}
    try:
        baseline_row, event_row = by_name["Ridge Baseline"], by_name["Ridge + Event Features"]
        baseline, event = raw["baseline"], raw["event_aware"]
        for record, metrics in ((baseline_row, baseline), (event_row, event)):
            for csv_field, json_field in (
                ("rmse", "rmse"),
                ("mae", "mae"),
                ("mape_percent", "mape_percent"),
            ):
                if not math.isclose(
                    _number(record[csv_field], csv_field),
                    _number(metrics[json_field], json_field),
                    rel_tol=1e-9,
                ):
                    raise Q2DataError(
                        "invalid_csv", "Q2 comparison CSV does not match the validated summary."
                    )
        baseline_rmse, event_rmse = _number(baseline["rmse"], "baseline rmse"), _number(
            event["rmse"], "event rmse"
        )
        change = (baseline_rmse - event_rmse) / baseline_rmse * 100 if baseline_rmse else None
        if change is None or not math.isclose(
            change,
            _number(raw["rmse_improvement_percent"], "improvement"),
            rel_tol=1e-7,
            abs_tol=1e-9,
        ):
            raise Q2DataError(
                "invalid_json", "Q2 improvement is inconsistent with the model scores."
            )
        markets = sorted({row["market"] for row in _csv("event_impact_results.csv")})
        return {
            "status": "success",
            "experiment": {
                "question": "Do climate and policy event features improve carbon-price prediction?",
                "model_type": raw["model_type"],
                "markets": markets,
                "baseline": {
                    "model": "Ridge Baseline",
                    "rmse": baseline_rmse,
                    "mae": _number(baseline["mae"], "baseline mae"),
                    "mape": _number(baseline["mape_percent"], "baseline mape"),
                },
                "event_aware": {
                    "model": "Ridge + Event Features",
                    "rmse": event_rmse,
                    "mae": _number(event["mae"], "event mae"),
                    "mape": _number(event["mape_percent"], "event mape"),
                },
                "comparison": {
                    "rmse_improvement_percent": change,
                    "mape_improvement_percent": _number(
                        raw["mape_improvement_percent"], "mape improvement"
                    ),
                    "event_window_improvement_percent": _number(
                        raw["event_window"]["improvement_percent"], "event-window improvement"
                    ),
                },
            },
            "conclusion": raw["interpretation"],
            "source": [
                "Dataset/carbon_prices_daily.csv",
                "Dataset/climate_events.csv",
                "backend/data/q2/q2_dashboard_summary.json",
                "backend/data/q2/event_model_comparison.csv",
            ],
        }
    except (KeyError, TypeError) as exc:
        raise Q2DataError("invalid_json", "Q2 summary fields are missing or invalid.") from exc


@lru_cache(maxsize=1)
def feature_importance() -> dict:
    rows = _csv("event_feature_importance.csv")
    manifest = {row["feature"]: row for row in _csv("event_feature_manifest.csv")}
    try:
        features = [
            {
                "feature": row["feature"],
                "coefficient": _number(row["coefficient"], "coefficient"),
                "abs_coefficient": _number(row["abs_coefficient"], "abs_coefficient"),
                "description": manifest[row["feature"]]["description"],
            }
            for row in rows
        ]
        if len(features) != len(manifest) or any(
            not math.isclose(abs(row["coefficient"]), row["abs_coefficient"], abs_tol=1e-9)
            for row in features
        ):
            raise ValueError("Feature manifest or coefficients do not match")
        return {
            "status": "success",
            "metric": "absolute standardized Ridge coefficient",
            "features": sorted(features, key=lambda item: item["abs_coefficient"], reverse=True),
            "source": "backend/data/q2/event_feature_importance.csv",
        }
    except (KeyError, ValueError) as exc:
        raise Q2DataError(
            "invalid_csv", "Q2 feature coefficients or manifest are invalid."
        ) from exc


@lru_cache(maxsize=1)
def event_window_analysis() -> dict:
    try:
        values = {
            row["metric"]: _number(row["value"], row["metric"])
            for row in _csv("event_window_analysis.csv")
        }
        expected = summary()["experiment"]["comparison"]["event_window_improvement_percent"]
        if not math.isclose(values["event_window_improvement_percent"], expected, rel_tol=1e-9):
            raise ValueError("Event-window summary differs")
        return {
            "status": "success",
            "event_window": {
                "rows": int(values["event_window_rows"]),
                "baseline_rmse": values["baseline_event_window_rmse"],
                "event_aware_rmse": values["event_aware_event_window_rmse"],
                "improvement_percent": values["event_window_improvement_percent"],
            },
            "source": "backend/data/q2/event_window_analysis.csv",
        }
    except (KeyError, ValueError) as exc:
        raise Q2DataError("invalid_csv", "Q2 event-window analysis is invalid.") from exc


@lru_cache(maxsize=1)
def impact_results() -> dict:
    rows = _csv("event_impact_results.csv")
    numeric = (
        "price",
        "baseline_prediction",
        "event_aware_prediction",
        "baseline_abs_error",
        "event_aware_abs_error",
        "days_since_last_event",
        "events_7d",
        "events_30d",
        "max_severity_7d",
        "max_severity_30d",
        "policy_events_30d",
        "weather_events_30d",
        "disaster_events_30d",
        "event_shock_score",
        "event_active_30d",
    )
    points = [{**row, **{key: _number(row[key], key) for key in numeric}} for row in rows]
    return {
        "status": "success",
        "count": len(points),
        "results": points,
        "source": "backend/data/q2/event_impact_results.csv",
    }
