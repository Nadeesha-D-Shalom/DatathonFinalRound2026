"""Adapter for a validated 2030 current-trend energy-mix output."""


def get_baseline_2030_energy_mix(country: str) -> dict:
    # Connect the team's documented baseline methodology here when delivered.
    return {
        "status": "baseline_not_available",
        "message": f"A 2030 Current Trend energy mix is not available for {country} yet.",
    }
