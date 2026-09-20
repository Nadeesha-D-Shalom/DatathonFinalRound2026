"""Read the delivered Q1 ARIMA analysis export without loading model artifacts."""

import csv
import math
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "carbon"


@lru_cache(maxsize=1)
def _outlooks():
    with (ROOT / "model_summary.csv").open(encoding="utf-8-sig", newline="") as source:
        selected = [
            row for row in csv.DictReader(source) if row["Selected_Final_Model"].lower() == "true"
        ]
    if len(selected) != 1 or not selected[0]["Model"].startswith("ARIMA"):
        raise ValueError("The delivered Q1 package does not identify one selected ARIMA model.")
    with (ROOT / "carbon_price_30day_forecast.csv").open(
        encoding="utf-8-sig", newline=""
    ) as source:
        forecast = list(csv.DictReader(source))
    with (ROOT / "carbon_historical_data.csv").open(encoding="utf-8-sig", newline="") as source:
        history = list(csv.DictReader(source))
    latest = {}
    for row in history:
        if row["market"] not in latest or row["date"] > latest[row["market"]]["date"]:
            latest[row["market"]] = row
    output = {}
    for market in {row["market"] for row in forecast}:
        rows = sorted(
            (row for row in forecast if row["market"] == market),
            key=lambda row: int(row["forecast_step"]),
        )
        if (
            len(rows) != 30
            or [int(row["forecast_step"]) for row in rows] != list(range(1, 31))
            or market not in latest
        ):
            raise ValueError("Q1 market forecast is incomplete.")
        observed = latest[market]
        if any(row["currency"] != observed["currency"] for row in rows):
            raise ValueError("Q1 forecast currency differs from observed history.")
        last = rows[-1]
        values = [
            float(observed["price"]),
            float(last["forecast_price"]),
            float(last["lower_95"]),
            float(last["upper_95"]),
        ]
        if not all(math.isfinite(value) for value in values) or values[0] <= 0:
            raise ValueError("Q1 forecast contains an invalid price.")
        output[market] = {
            "status": "success",
            "market": market,
            "currency": observed["currency"],
            "last_observed_date": observed["date"],
            "last_observed_price": values[0],
            "forecast_horizon": "30 trading days",
            "forecast_date": last["forecast_date"],
            "forecast_price": values[1],
            "change_percent": (values[1] - values[0]) / values[0] * 100,
            "lower_95": values[2],
            "upper_95": values[3],
            "model": selected[0]["Model"],
            "source": "backend/data/carbon/carbon_price_30day_forecast.csv",
            "note": "Delivered Q1 analysis export; the live Carbon specialist remains disconnected.",
        }
    return output


def get_carbon_analysis_outlook(market: str) -> dict:
    try:
        outlook = _outlooks().get(market)
        return outlook or {
            "status": "market_not_available",
            "message": "This market is not in the delivered Q1 forecast package.",
        }
    except (OSError, csv.Error, KeyError, ValueError):
        return {
            "status": "analysis_not_available",
            "message": "Validated Q1 carbon outlook is awaiting integration.",
        }
