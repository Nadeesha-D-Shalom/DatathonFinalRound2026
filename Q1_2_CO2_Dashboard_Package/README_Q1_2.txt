
Q1.2 - CO2 PER CAPITA PREDICTION FROM ENERGY MIX
=================================================

FINAL MODEL
-----------
Random Forest Regressor

TARGET
------
co2_per_capita_t

DATA
----
50 countries
2000-2026

INPUT
-----
Country energy-mix profile.

Main features include:

- coal_pct
- oil_pct
- gas_pct
- nuclear_pct
- hydro_pct
- solar_pct
- wind_pct
- other_renewables_pct
- fossil_total_pct
- renewables_total_pct
- low_carbon_pct
- solar_wind_pct
- fossil_clean_ratio
- energy_hhi
- dominant_source_pct
- year_norm

DATA SPLIT
----------
Training:
2000-2020

Validation:
2021-2023

Final Test:
2024-2026

MODEL COMPARISON
----------------
Four models were compared on the same validation period:

1. Random Forest
2. Extra Trees
3. XGBoost
4. Gradient Boosting

Validation Results:

Random Forest
R2   = 0.3662
RMSE = 5.3629
MAE  = 3.4116

Extra Trees
R2   = 0.3256
RMSE = 5.5319
MAE  = 3.3367

XGBoost
R2   = 0.2817
RMSE = 5.7093
MAE  = 3.7539

Gradient Boosting
R2   = 0.2802
RMSE = 5.7152
MAE  = 3.8370

FINAL TEST PERFORMANCE
----------------------
R2   = 0.3409
RMSE = 5.5967
MAE  = 3.5645

INTERPRETATION
--------------
Energy mix contains meaningful information about CO2 per
capita, but it does not explain all country-level variation.

Additional factors such as economic activity, industrial
structure, energy efficiency and energy demand are also likely
to influence CO2 emissions per capita.

MODEL USAGE
-----------
1. Load final_random_forest_co2_per_capita.pkl
2. Load final_features.pkl
3. Prepare the required energy-mix features.
4. Arrange the input columns in the same feature order.
5. Call model.predict().

DASHBOARD USE
-------------
The dashboard can use:

dashboard_summary.json
    KPI cards and model metadata

test_predictions.csv
    Actual vs predicted charts

feature_importance.csv
    Top energy-mix drivers

validation_model_comparison.csv
    Model comparison table

final_test_results.csv
    Final model performance
