import csv
from functools import lru_cache
from pathlib import Path

from backend.schemas.requests import EnergyMix


DATASET_DIR = Path(__file__).resolve().parents[2] / "Dataset"


@lru_cache(maxsize=2)
def available_values(filename: str, column: str) -> frozenset[str]:
    with (DATASET_DIR / filename).open(encoding="utf-8-sig", newline="") as source:
        return frozenset(row[column] for row in csv.DictReader(source) if row.get(column))


def validate_market(market: str) -> str:
    markets = available_values("carbon_prices_daily.csv", "market")
    match = next((item for item in markets if item.casefold() == market.strip().casefold()), None)
    if match is None:
        raise ValueError(f"Unsupported carbon market: {market}.")
    return match


def validate_country(country: str) -> str:
    countries = available_values("energy_mix_yearly.csv", "country")
    match = next((item for item in countries if item.casefold() == country.strip().casefold()), None)
    if match is None:
        raise ValueError(f"Country unavailable in the supplied energy data: {country}.")
    return match


def validate_energy_mix(energy_mix: EnergyMix | dict) -> EnergyMix:
    return energy_mix if isinstance(energy_mix, EnergyMix) else EnergyMix.model_validate(energy_mix)
