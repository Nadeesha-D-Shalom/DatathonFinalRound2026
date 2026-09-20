"""Export dashboard-ready facts using only the five competition CSVs."""

import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error, r2_score

ROOT = Path(__file__).parent
OUT = ROOT / "dashboard" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def read(name):
    return pd.read_csv(ROOT / "Dataset" / name)


def records(df):
    return json.loads(df.replace({np.nan: None}).to_json(orient="records"))


def save(name, value):
    (OUT / name).write_text(
        json.dumps(value, allow_nan=False, separators=(",", ":")), encoding="utf-8"
    )


carbon = read("carbon_prices_daily.csv")
events = read("climate_events.csv")
co2 = read("co2_emissions_yearly.csv")
energy = read("energy_mix_yearly.csv")
temp = read("temperature_anomaly_monthly.csv")
data = {
    "markets": sorted(carbon.market.dropna().unique().tolist()),
    "countries": sorted(co2.country.dropna().unique().tolist()),
    "regions": sorted(co2.region.dropna().unique().tolist()),
}
quality = []
for name, frame in [
    ("carbon_prices_daily.csv", carbon),
    ("climate_events.csv", events),
    ("co2_emissions_yearly.csv", co2),
    ("energy_mix_yearly.csv", energy),
    ("temperature_anomaly_monthly.csv", temp),
]:
    quality.append(
        {
            "name": name,
            "rows": len(frame),
            "columns": len(frame.columns),
            "missing": int(frame.isna().sum().sum()),
            "start": str(frame.date.min() if "date" in frame else frame.year.min()),
            "end": str(frame.date.max() if "date" in frame else frame.year.max()),
            "countries": int(frame.country.nunique()) if "country" in frame else None,
            "markets": int(frame.market.nunique()) if "market" in frame else None,
            "regions": int(frame.region.nunique()) if "region" in frame else None,
        }
    )
data["quality"] = quality
data["carbon"] = {}
for market, frame in carbon.groupby("market"):
    frame = frame.sort_values("date").copy()
    frame["rolling30"] = frame.price.rolling(30, min_periods=1).mean()
    frame["volatility30"] = frame.price.pct_change().rolling(30, min_periods=10).std() * 100
    annual = (
        frame.groupby("year")
        .price.agg(["first", "last", "mean", "min", "max", "count"])
        .reset_index()
        .round(3)
    )
    data["carbon"][market] = {
        "currency": str(frame.currency.iloc[-1]),
        "history": records(
            frame[["date", "price", "rolling30", "volatility30"]].tail(1250).round(3)
        ),
        "annual": records(annual),
        "latest": float(frame.price.iloc[-1]),
        "latestDate": str(frame.date.iloc[-1]),
        "volatility": (
            round(float(frame.volatility30.iloc[-1]), 2)
            if pd.notna(frame.volatility30.iloc[-1])
            else None
        ),
    }
# One-step carbon price evaluation with a chronological 80/20 split, then a
# recursive 30-business-day forecast. Intervals use held-out absolute errors.
lag_columns = ["lag1", "lag2", "lag5", "lag10", "avg5", "avg20"]
for market, source in carbon.groupby("market"):
    frame = source.sort_values("date").copy().reset_index(drop=True)
    for lag in [1, 2, 5, 10]:
        frame[f"lag{lag}"] = frame.price.shift(lag)
    frame["avg5"] = frame.price.shift(1).rolling(5).mean()
    frame["avg20"] = frame.price.shift(1).rolling(20).mean()
    frame = frame.dropna(subset=lag_columns + ["price"])
    split = int(len(frame) * 0.8)
    train = frame.iloc[:split]
    test = frame.iloc[split:]
    reg = RandomForestRegressor(
        n_estimators=70, max_depth=12, min_samples_leaf=3, random_state=26, n_jobs=-1
    )
    reg.fit(train[lag_columns], train.price)
    predicted = reg.predict(test[lag_columns])
    error = np.abs(predicted - test.price.to_numpy())
    prices = source.sort_values("date").price.tolist()
    future = []
    for date in pd.bdate_range(pd.to_datetime(source.date.max()) + pd.offsets.BDay(1), periods=30):
        inputs = pd.DataFrame(
            [
                {
                    "lag1": prices[-1],
                    "lag2": prices[-2],
                    "lag5": prices[-5],
                    "lag10": prices[-10],
                    "avg5": np.mean(prices[-5:]),
                    "avg20": np.mean(prices[-20:]),
                }
            ]
        )
        value = float(reg.predict(inputs[lag_columns])[0])
        prices.append(value)
        horizon = len(future) + 1
        spread = float(np.quantile(error, 0.9)) * np.sqrt(horizon)
        future.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "price": round(value, 3),
                "lower": round(max(0, value - spread), 3),
                "upper": round(value + spread, 3),
            }
        )
    data["carbon"][market]["forecast"] = future
    data["carbon"][market]["model"] = {
        "name": "Random forest autoregression",
        "features": lag_columns,
        "train": f"{train.date.iloc[0]}–{train.date.iloc[-1]}",
        "test": f"{test.date.iloc[0]}–{test.date.iloc[-1]}",
        "rmse": round(float(np.sqrt(mean_squared_error(test.price, predicted))), 3),
        "mape": round(float(mean_absolute_percentage_error(test.price, predicted) * 100), 2),
        "horizon": 30,
        "interval": "Illustrative 90% absolute-error band, scaled by square root of horizon; not calibrated multi-step coverage",
    }
data["events"] = records(
    events[
        [
            "date",
            "region",
            "event_type",
            "severity_score",
            "description",
            "is_policy",
            "is_extreme_weather",
            "is_disaster",
        ]
    ].sort_values("date")
)
# EU ETS event experiment: global and Europe events available before each
# price observation, using the same chronological split as the baseline.
eu = carbon[carbon.market.eq("EU_ETS")].sort_values("date").copy().reset_index(drop=True)
for lag in [1, 2, 5, 10]:
    eu[f"lag{lag}"] = eu.price.shift(lag)
eu["avg5"] = eu.price.shift(1).rolling(5).mean()
eu["avg20"] = eu.price.shift(1).rolling(20).mean()
matched = events[events.region.str.lower().isin(["global", "europe"])].copy()
matched["date"] = pd.to_datetime(matched.date)
dates = pd.to_datetime(eu.date)
for feature, mask in [
    ("recent_event_count", matched.index == matched.index),
    ("recent_policy_count", matched.is_policy.eq(1)),
    ("recent_weather_count", matched.is_extreme_weather.eq(1)),
    ("recent_disaster_count", matched.is_disaster.eq(1)),
]:
    selected = matched.loc[mask, "date"].to_numpy(dtype="datetime64[ns]")
    eu[feature] = [
        int(
            (
                (selected < d.to_datetime64())
                & (selected >= d.to_datetime64() - np.timedelta64(30, "D"))
            ).sum()
        )
        for d in dates
    ]
eu = eu.dropna(subset=lag_columns + ["price"])
split = int(len(eu) * 0.8)
tr = eu.iloc[:split]
te = eu.iloc[split:]
event_features = [
    "recent_event_count",
    "recent_policy_count",
    "recent_weather_count",
    "recent_disaster_count",
]
comparison = {}
for label, cols in [("baseline", lag_columns), ("eventAware", lag_columns + event_features)]:
    reg = RandomForestRegressor(
        n_estimators=70, max_depth=12, min_samples_leaf=3, random_state=26, n_jobs=-1
    )
    reg.fit(tr[cols], tr.price)
    pred = reg.predict(te[cols])
    comparison[label] = {
        "rmse": round(float(np.sqrt(mean_squared_error(te.price, pred))), 3),
        "mape": round(float(mean_absolute_percentage_error(te.price, pred) * 100), 2),
    }
comparison["improvementPct"] = round(
    (comparison["baseline"]["rmse"] - comparison["eventAware"]["rmse"])
    / comparison["baseline"]["rmse"]
    * 100,
    2,
)
comparison["market"] = "EU_ETS"
comparison["features"] = event_features
comparison["train"] = f"{tr.date.iloc[0]}–{tr.date.iloc[-1]}"
comparison["test"] = f"{te.date.iloc[0]}–{te.date.iloc[-1]}"
comparison["scope"] = (
    "Global and Europe events in the previous 30 calendar days; event date is excluded from same-day prediction."
)
data["eventExperiment"] = comparison
joined = co2.merge(energy, on=["year", "country", "iso3", "region"], how="inner")
cols = [
    "year",
    "country",
    "iso3",
    "region",
    "co2_emissions_mt",
    "population_millions",
    "co2_per_capita_t",
    "co2_intensity_kg_per_gdp_usd",
    "coal_pct",
    "oil_pct",
    "gas_pct",
    "nuclear_pct",
    "hydro_pct",
    "solar_pct",
    "wind_pct",
    "other_renewables_pct",
    "renewables_total_pct",
    "fossil_total_pct",
]
data["countriesData"] = records(joined[cols].round(3))
data["temperature"] = records(
    temp[temp.region.eq("Global")][["year_month", "temp_anomaly_c", "co2_ppm"]].round(3)
)

# Chronological country-year holdout. No future rows enter training.
features = [
    "coal_pct",
    "oil_pct",
    "gas_pct",
    "nuclear_pct",
    "hydro_pct",
    "solar_pct",
    "wind_pct",
    "other_renewables_pct",
]
usable = joined.dropna(subset=features + ["co2_per_capita_t"]).sort_values("year")
train = usable[usable.year <= 2020]
test = usable[usable.year > 2020]
if len(train) > 50 and len(test) > 10:
    model = RandomForestRegressor(
        n_estimators=120, max_depth=9, min_samples_leaf=3, random_state=26, n_jobs=-1
    )
    model.fit(train[features], train.co2_per_capita_t)
    pred = model.predict(test[features])
    data["co2Model"] = {
        "algorithm": "Random forest regression",
        "features": features,
        "target": "co2_per_capita_t",
        "train": "2000–2020",
        "test": "2021–2026",
        "r2": round(float(r2_score(test.co2_per_capita_t, pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(test.co2_per_capita_t, pred))), 3),
        "predictions": records(
            pd.DataFrame(
                {
                    "actual": test.co2_per_capita_t.round(3),
                    "predicted": np.round(pred, 3),
                    "country": test.country,
                    "year": test.year,
                }
            ).sample(min(450, len(test)), random_state=26)
        ),
        "importance": [
            {"feature": f, "value": round(float(v), 4)}
            for f, v in sorted(zip(features, model.feature_importances_), key=lambda p: -p[1])
        ],
    }

# Transparent transition categories from observed 2000-to-latest changes.
archetypes = []
for country, frame in joined.groupby("country"):
    frame = frame.sort_values("year")
    a = frame.iloc[0]
    b = frame.iloc[-1]
    renewable = float(b.renewables_total_pct - a.renewables_total_pct)
    fossil = float(b.fossil_total_pct - a.fossil_total_pct)
    emission = float(b.co2_emissions_mt - a.co2_emissions_mt)
    category = (
        "Accelerated Transition"
        if renewable >= 15 and fossil <= -10
        else "Moderate Transition" if renewable >= 5 and fossil < 0 else "Business-as-Usual"
    )
    archetypes.append(
        {
            "country": country,
            "renewableChange": round(renewable, 1),
            "fossilChange": round(fossil, 1),
            "emissionsChange": round(emission, 1),
            "category": category,
            "firstYear": int(a.year),
            "lastYear": int(b.year),
        }
    )
data["archetypes"] = archetypes
# Empirical analogue scenarios. Each rate is measured from the competition
# panel over 2016–2026, then applied to 2026 emissions through 2030.
country_rates = {}
for country, frame in joined.groupby("country"):
    frame = frame.sort_values("year")
    start = frame[frame.year.eq(2016)]
    end = frame[frame.year.eq(2026)]
    if start.empty or end.empty:
        continue
    a = start.iloc[0]
    b = end.iloc[0]
    growth = (
        float((b.co2_emissions_mt / a.co2_emissions_mt) ** (1 / 10) - 1)
        if a.co2_emissions_mt > 0
        else 0
    )
    country_rates[country] = {
        "emissionsGrowth": growth,
        "renewablePp": float((b.renewables_total_pct - a.renewables_total_pct) / 10),
        "fossilPp": float((b.fossil_total_pct - a.fossil_total_pct) / 10),
        "baseEmissions": float(b.co2_emissions_mt),
    }
groups = {}
for category in ["Moderate Transition", "Accelerated Transition"]:
    members = [
        country_rates[a["country"]]
        for a in archetypes
        if a["category"] == category and a["country"] in country_rates
    ]
    groups[category] = {
        k: float(np.median([m[k] for m in members]))
        for k in ["emissionsGrowth", "renewablePp", "fossilPp"]
    }
scenarios = {}
for country, rates in country_rates.items():
    scenarios[country] = {}
    for category, assumptions in [("Business-as-Usual", rates), *groups.items()]:
        growth = assumptions["emissionsGrowth"]
        base = rates["baseEmissions"]
        scenarios[country][category] = {
            "assumptions": {
                "emissionsGrowthPct": round(growth * 100, 3),
                "renewablePpPerYear": round(assumptions["renewablePp"], 3),
                "fossilPpPerYear": round(assumptions["fossilPp"], 3),
            },
            "forecast": [
                {
                    "year": year,
                    "co2_emissions_mt": round(max(0, base * (1 + growth) ** (year - 2026)), 3),
                }
                for year in range(2026, 2031)
            ],
        }
data["scenarios"] = scenarios
data["scenarioMethod"] = (
    "Empirical analogue: BAU uses each country’s 2016–2026 observed annualized rates; Moderate and Accelerated use median annualized rates of countries in those observed archetypes. Emissions grow at the corresponding observed annualized emissions rate. Shares are assumptions shown for context, not causal inputs to the emissions formula. No uncertainty interval is estimated."
)
data["summary"] = {
    "carbonRows": len(carbon),
    "eventCount": len(events),
    "countryCount": co2.country.nunique(),
    "latestYear": int(max(co2.year.max(), energy.year.max())),
    "globalTemperatureLatest": records(
        temp[temp.region.eq("Global")][["year_month", "temp_anomaly_c"]].tail(1)
    )[0],
}
save("dashboard.json", data)
print("Exported", OUT / "dashboard.json", "size", (OUT / "dashboard.json").stat().st_size)
