"""Observed country records from the two supplied competition CSV files."""

import csv
from functools import lru_cache
from math import isfinite
from pathlib import Path


DATASET_DIR = Path(__file__).resolve().parents[2] / "Dataset"
ENERGY_FIELDS = (
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
)
CO2_FIELDS = ("co2_emissions_mt", "co2_per_capita_t", "co2_intensity_kg_per_gdp_usd")


class CountryNotFound(Exception):
    pass


class DatasetError(Exception):
    pass


def _number(raw: str, field: str, country: str, year: int) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise DatasetError(f"Invalid {field} for {country}, {year}.") from exc
    if not isfinite(value):
        raise DatasetError(f"Non-finite {field} for {country}, {year}.")
    return value


@lru_cache(maxsize=2)
def _read_csv(filename: str, numeric_fields: tuple[str, ...]) -> dict[str, dict[int, dict]]:
    path = DATASET_DIR / filename
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.DictReader(source))
    except (OSError, csv.Error) as exc:
        raise DatasetError(f"Could not read {filename}.") from exc
    output: dict[str, dict[int, dict]] = {}
    for row in rows:
        try:
            country = row["country"].strip()
            year = int(row["year"])
            if not country or year < 2000 or year > 2026:
                continue
            item = {field: _number(row[field], field, country, year) for field in numeric_fields}
            item.update(year=year, country=country, region=row["region"].strip())
            years = output.setdefault(country, {})
            if year in years:
                raise DatasetError(f"Duplicate {country}, {year} record in {filename}.")
            years[year] = item
        except (KeyError, TypeError, ValueError) as exc:
            raise DatasetError(f"Malformed record in {filename}.") from exc
    return output


def _datasets():
    co2 = _read_csv("co2_emissions_yearly.csv", CO2_FIELDS)
    energy = _read_csv("energy_mix_yearly.csv", ENERGY_FIELDS)
    return co2, energy


def get_countries() -> list[str]:
    co2, energy = _datasets()
    return sorted(
        country
        for country in co2.keys() & energy.keys()
        if co2[country].keys() & energy[country].keys()
    )


def get_country_energy_co2(country: str) -> dict:
    co2, energy = _datasets()
    actual = next(
        (
            name
            for name in co2.keys() & energy.keys()
            if name.casefold() == country.strip().casefold()
        ),
        None,
    )
    if actual is None:
        raise CountryNotFound(country)
    common_years = sorted(co2[actual].keys() & energy[actual].keys())
    if not common_years:
        raise CountryNotFound(country)
    latest_year = common_years[-1]
    latest_co2 = co2[actual][latest_year]
    latest_energy = energy[actual][latest_year]
    if latest_co2["region"] != latest_energy["region"]:
        raise DatasetError(f"Region mismatch for {actual}, {latest_year}.")
    return {
        "status": "success",
        "country": actual,
        "region": latest_co2["region"],
        "latest_year": latest_year,
        "co2": {field: latest_co2[field] for field in CO2_FIELDS},
        "energy_mix": {field: latest_energy[field] for field in ENERGY_FIELDS},
        "history": {
            "co2": [
                {
                    "year": year,
                    "co2_emissions_mt": item["co2_emissions_mt"],
                    "co2_per_capita_t": item["co2_per_capita_t"],
                }
                for year, item in sorted(co2[actual].items())
            ],
            "energy_mix": [
                {
                    "year": year,
                    "renewables_total_pct": item["renewables_total_pct"],
                    "fossil_total_pct": item["fossil_total_pct"],
                }
                for year, item in sorted(energy[actual].items())
            ],
        },
        "sources": ["co2_emissions_yearly.csv", "energy_mix_yearly.csv"],
    }
