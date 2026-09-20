"""Adapter for a validated current-trend energy mix at the selected year."""


def get_baseline_energy_mix(country: str, target_year: int) -> dict:
    # Connect the team's documented baseline methodology here when delivered.
    return {
        "status": "baseline_not_available",
        "message": f"The Current Trend {target_year} energy mix is not available for {country} yet.",
    }


def get_baseline_2030_energy_mix(country: str) -> dict:
    return get_baseline_energy_mix(country, 2030)
