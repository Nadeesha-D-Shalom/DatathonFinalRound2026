
CODEFEST DATATHON 2026
Q2 - Climate & Policy Event Impact on Carbon Prices
====================================================

OBJECTIVE
---------
Test whether climate and policy event information improves
carbon-price prediction.

EXPERIMENT DESIGN
-----------------
Two Ridge Regression models were compared.

MODEL A - BASELINE
Historical price, calendar, lag, rolling and momentum features.

MODEL B - EVENT-AWARE
Exactly the same Ridge modelling approach as Model A,
with additional climate/policy event features.

This ensures that the comparison isolates the predictive
contribution of event information.

EVENT FEATURES
--------------
- days_since_last_event
- events_7d
- events_30d
- max_severity_7d
- max_severity_30d
- policy_events_30d
- weather_events_30d
- disaster_events_30d
- event_shock_score

LEAKAGE CONTROL
---------------
Only events occurring on or before each carbon-price date were
used.

days_until_next_event was NOT used for general climate events,
because future unscheduled events would introduce information
that would not be available at prediction time.

MODEL
-----
Ridge Regression

FINAL UNTOUCHED TEST RESULTS
----------------------------
Baseline RMSE:
1.858455

Event-Aware RMSE:
1.858013

Baseline MAE:
1.329678

Event-Aware MAE:
1.334222

Baseline MAPE:
2.258625%

Event-Aware MAPE:
2.274982%

RMSE Improvement:
0.0238%

MAPE Improvement:
-0.7242%

EVENT-WINDOW ANALYSIS
---------------------
Event-window rows:
75

Baseline event-window RMSE:
1.759086716631848

Event-aware event-window RMSE:
1.7582970856089881

Event-window improvement:
0.04488869226252887%

INTERPRETATION
--------------
Adding event-proximity variables produced negligible improvement
in short-term carbon-price level prediction.

The event-aware model reduced overall RMSE only marginally,
while MAE/MAPE did not materially improve.

This suggests historical carbon-price dynamics were more useful
for short-term price prediction than the sparse climate-event
catalogue.

Event indicators may therefore be more useful as contextual
risk / alert signals in the Carbon Pulse dashboard than as major
drivers of point forecasts.

FILES
-----
carbon_prices_daily_clean.csv
    Carbon-price working data.

climate_events_clean.csv
    Climate and policy event working data.

event_features.csv
    Full modelling dataset with engineered features.

event_feature_manifest.csv
    Definitions of event features.

event_model_comparison.csv
    Baseline vs event-aware metrics.

event_impact_results.csv
    Row-level test predictions and event signals.

event_feature_importance.csv
    Standardized Ridge coefficients for event variables.

event_window_analysis.csv
    Performance specifically during event-active periods.

q2_dashboard_summary.json
    Compact values for direct dashboard integration.

models/ridge_baseline.pkl
    Baseline trained model + scaler + feature list.

models/ridge_event_aware.pkl
    Event-aware trained model + scaler + feature list.

event_model_rmse_comparison.png
    Model performance chart.

event_feature_importance.png
    Event-feature contribution chart.
