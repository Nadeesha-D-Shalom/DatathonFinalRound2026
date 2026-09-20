"""Read-only access to the validated Q3 competition analysis outputs."""

import csv
import json
import math
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "models" / "q3"
SCENARIOS = ("BAU", "Moderate", "Accelerated")


class Q3DataError(Exception):
    status = "invalid_q3_data"


class Q3CountryNotFound(Q3DataError):
    status = "country_not_found"


def _convert(value):
    if value is None or value.strip().lower() in {"", "nan", "inf", "-inf"}:
        raise Q3DataError("Q3 output contains a missing or invalid value.")
    try:
        number = float(value)
        if not math.isfinite(number):
            raise Q3DataError("Q3 output contains a nonfinite number.")
        return int(number) if number.is_integer() else number
    except ValueError:
        return value


@lru_cache(maxsize=1)
def _data():
    names = (
        "global_transition_trends",
        "country_transition_archetypes",
        "archetype_summary",
        "scenario_inputs",
        "co2_scenarios_2026_2030",
        "co2_scenario_2030_summary",
    )
    try:
        tables = {}
        for name in names:
            with (ROOT / f"{name}.csv").open(encoding="utf-8-sig", newline="") as file:
                tables[name] = [
                    {key: _convert(value) for key, value in row.items()}
                    for row in csv.DictReader(file)
                ]
        with (ROOT / "q3_dashboard_summary.json").open(encoding="utf-8") as file:
            tables["summary"] = json.load(file)
        if not (ROOT / "README_Q3.txt").is_file():
            raise Q3DataError("Q3 methodology document is missing.")
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise Q3DataError("Validated Q3 output package is unavailable.") from exc
    archetypes = tables["country_transition_archetypes"]
    annual = tables["co2_scenarios_2026_2030"]
    countries = {row["country"] for row in archetypes}
    if len(archetypes) != 50 or len(countries) != 50:
        raise Q3DataError("Q3 country archetypes are incomplete.")
    dataset_root = Path(__file__).resolve().parents[2] / "Dataset"
    try:
        with (dataset_root / "co2_emissions_yearly.csv").open(
            encoding="utf-8-sig", newline=""
        ) as file:
            original_countries = {row["country"] for row in csv.DictReader(file)}
        with (dataset_root / "energy_mix_yearly.csv").open(
            encoding="utf-8-sig", newline=""
        ) as file:
            energy_countries = {row["country"] for row in csv.DictReader(file)}
    except OSError as exc:
        raise Q3DataError(
            "Original competition country files are unavailable for Q3 validation."
        ) from exc
    if countries != original_countries or countries != energy_countries:
        raise Q3DataError("Q3 countries differ from the original competition datasets.")
    counts = {name: sum(row["trajectory"] == name for row in archetypes) for name in SCENARIOS}
    summary_counts = {row["trajectory"]: row["countries"] for row in tables["archetype_summary"]}
    if counts != summary_counts or counts != tables["summary"]["archetype_counts"]:
        raise Q3DataError("Q3 archetype counts disagree across supplied files.")
    if [row["year"] for row in tables["global_transition_trends"]] != list(range(2000, 2027)):
        raise Q3DataError("Q3 global transition years are incomplete.")
    expected = {
        (country, year, scenario)
        for country in {r["country"] for r in annual}
        for year in range(2026, 2031)
        for scenario in SCENARIOS
    }
    actual = {(r["country"], r["year"], r["scenario"]) for r in annual}
    if (
        len(annual) != len(actual)
        or actual != expected
        or not {r["country"] for r in annual} <= countries
    ):
        raise Q3DataError("Q3 annual scenarios are incomplete or duplicated.")
    if {row["country"] for row in tables["scenario_inputs"]} != {row["country"] for row in annual}:
        raise Q3DataError("Q3 scenario inputs disagree with annual forecast countries.")
    for row in tables["co2_scenario_2030_summary"]:
        for scenario in SCENARIOS:
            matching = next(
                (
                    x
                    for x in annual
                    if x["country"] == row["country"]
                    and x["year"] == 2030
                    and x["scenario"] == scenario
                ),
                None,
            )
            if matching is None or not math.isclose(
                row[scenario], matching["co2_per_capita_t"], abs_tol=1e-8
            ):
                raise Q3DataError("Q3 2030 summary does not match annual scenarios.")
    return tables


def get_q3_summary():
    return {"status": "success", **_data()["summary"]}


def get_global_transition_trends():
    return {
        "status": "success",
        "source": "global_transition_trends.csv",
        "trends": _data()["global_transition_trends"],
    }


def get_archetype_summary():
    data = _data()
    return {
        "status": "success",
        "source": "country_transition_archetypes.csv; archetype_summary.csv",
        "archetypes": data["archetype_summary"],
        "countries": data["country_transition_archetypes"],
    }


def _country(country):
    return next(
        (
            row
            for row in _data()["country_transition_archetypes"]
            if row["country"].casefold() == country.casefold()
        ),
        None,
    )


def get_country_transition(country):
    row = _country(country)
    if row is None:
        raise Q3CountryNotFound("Country is not present in the validated Q3 transition analysis.")
    return {"status": "success", "source": "country_transition_archetypes.csv", **row}


def get_available_scenario_countries():
    return {
        "status": "success",
        "countries": sorted({row["country"] for row in _data()["co2_scenarios_2026_2030"]}),
    }


def get_country_scenarios(country):
    archetype = _country(country)
    if archetype is None:
        raise Q3CountryNotFound("Country is not present in the validated Q3 transition analysis.")
    rows = [
        row for row in _data()["co2_scenarios_2026_2030"] if row["country"] == archetype["country"]
    ]
    if not rows:
        return {
            "status": "scenario_not_available",
            "country": archetype["country"],
            "message": "Validated 2026–2030 Q3 scenario outputs are not available for this country in the supplied Q3 package.",
        }
    scenarios = {
        name: [
            {
                "year": row["year"],
                "co2_per_capita_t": row["co2_per_capita_t"],
                "annual_rate": row["annual_rate"],
            }
            for row in rows
            if row["scenario"] == name
        ]
        for name in SCENARIOS
    }
    return {
        "status": "success",
        "country": archetype["country"],
        "unit": "tonnes CO2 per person",
        "forecast_type": "conditional scenario",
        "source": "co2_scenarios_2026_2030.csv",
        "scenario_method": _data()["summary"]["scenario_method"],
        "scenarios": scenarios,
    }


def get_country_2030_summary(country):
    archetype = _country(country)
    if archetype is None:
        raise Q3CountryNotFound("Country is not present in the validated Q3 transition analysis.")
    row = next(
        (x for x in _data()["co2_scenario_2030_summary"] if x["country"] == archetype["country"]),
        None,
    )
    if row is None:
        return {
            "status": "scenario_not_available",
            "country": archetype["country"],
            "message": "Validated 2030 Q3 scenario outputs are not available for this country in the supplied Q3 package.",
        }
    return {
        "status": "success",
        "year": 2030,
        "unit": "tonnes CO2 per person",
        "forecast_type": "conditional scenario",
        "source": "co2_scenario_2030_summary.csv",
        **row,
    }
