# Monsoon Mandate backend

See the root README for environment setup and the complete API surface.
Run `.venv/Scripts/python -m uvicorn backend.main:app --reload` from the repository
root. Models and validated CSV/JSON outputs are read-only. Health checks load the
trusted saved artifacts and exercise their data services. Failures return safe
structured states; internal exceptions appear only in server logs.

CarbonForecastAgent serves the validated ARIMA export; CO2PredictionAgent executes
the cached Random Forest. EventImpactAgent exposes the Ridge experiment, and
Q3TransitionAgent serves the supplied conditional scenarios. The Supervisor uses
explicit task names. Briefwright and Sovereign Brief invoke these same tasks.

Q3's delivered files remain under models/q3, not data/q3. Q1.2 year inputs are
restricted to 2000-2026; the simulator labels its custom estimate accordingly.
