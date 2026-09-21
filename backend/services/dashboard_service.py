"""API presentation records derived only from competition CSVs and validated outputs."""
import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

from backend.services import carbon_analysis_service as carbon
from backend.services import q3_transition_service as q3

ROOT = Path(__file__).resolve().parents[2] / "Dataset"
FILES = ("carbon_prices_daily.csv", "climate_events.csv", "co2_emissions_yearly.csv",
         "energy_mix_yearly.csv", "temperature_anomaly_monthly.csv")


def records(frame):
    return json.loads(frame.to_json(orient="records"))


@lru_cache(maxsize=1)
def observed_data():
    tables = {name: pd.read_csv(ROOT / name) for name in FILES}
    prices, events, emissions, energy, temperature = (tables[name] for name in FILES)
    merged = emissions.merge(energy, on=["year", "country", "iso3", "region"], validate="one_to_one")
    quality = []
    for name, frame in tables.items():
        date = next(c for c in ("date", "year_month", "year") if c in frame)
        quality.append({"name": name, "rows": len(frame), "columns": len(frame.columns),
                        "missing": int(frame.isna().sum().sum()), "start": str(frame[date].min()),
                        "end": str(frame[date].max()), **{
                            key + "s": int(frame[key].nunique()) if key in frame else None
                            for key in ("country", "market", "region")}})
        quality[-1]["countries"] = quality[-1].pop("countrys")
    global_temp = temperature[temperature.region == "Global"].sort_values("year_month")
    return {"countries": sorted(emissions.country.unique().tolist()),
            "regions": sorted(emissions.region.unique().tolist()),
            "countriesData": records(merged.sort_values(["country", "year"])),
            "events": records(events.sort_values("date")),
            "temperature": records(global_temp), "quality": quality,
            "summary": {"carbonRows": len(prices), "eventCount": len(events),
                        "countryCount": int(emissions.country.nunique()),
                        "latestYear": int(emissions.year.max()),
                        "globalTemperatureLatest": records(global_temp.tail(1))[0]}}


@lru_cache(maxsize=1)
def dashboard():
    result = {**observed_data(), "status": "success", "markets": carbon.markets()["markets"], "carbon": {}}
    prices = pd.read_csv(ROOT / "carbon_prices_daily.csv")
    for market in result["markets"]:
        frame = prices[prices.market == market].sort_values("date").copy()
        frame["rolling30"] = frame.price.rolling(30, min_periods=1).mean()
        frame["volatility30"] = frame.price.pct_change().rolling(30, min_periods=10).std() * 100
        output = carbon.forecast(market)
        result["carbon"][market] = {
            "currency": output["currency"], "latest": output["last_observed_price"],
            "latestDate": output["last_observed_date"], "volatility": float(frame.volatility30.iloc[-1]),
            "history": records(frame[["date", "price", "rolling30", "volatility30"]]),
            "annual": records(frame.groupby("year").price.agg(["first", "last", "mean", "min", "max", "count"]).reset_index()),
            "forecast": [{"date": p["date"], "price": p["predicted_price"],
                          "lower": p["lower_95"], "upper": p["upper_95"]} for p in output["forecast"]],
            "model": {**output["model"], "features": ["historical carbon price"],
                      "train": "See rolling-origin folds", "test": output["model"]["methodology"],
                      "horizon": 30, "interval": "Supplied ARIMA 95% prediction intervals"}}
    result["archetypes"] = [{"country": row["country"], "category": row["trajectory"]}
                             for row in q3.get_archetype_summary()["countries"]]
    result["sources"] = ["Dataset/" + name for name in FILES] + ["backend/data/carbon"]
    return result
