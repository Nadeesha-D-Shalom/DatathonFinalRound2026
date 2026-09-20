from math import isfinite


def compare_predictions(baseline: float, scenario: float) -> dict:
    if not all(isfinite(value) and value >= 0 for value in (baseline, scenario)):
        raise ValueError("Model predictions must be finite, non-negative values.")
    difference = scenario - baseline
    reduction = baseline - scenario
    return {
        "baseline": baseline,
        "scenario": scenario,
        "difference": difference,
        "reduction": reduction,
        "reduction_percent": reduction / baseline * 100 if baseline > 0 else 0.0,
        "direction": "increase" if difference > 0 else "decrease" if difference < 0 else "unchanged",
    }
