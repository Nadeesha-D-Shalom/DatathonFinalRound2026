# CarbonScope Intelligence

Next.js dashboard for the five supplied CodeFest Datathon 2026 datasets.

From the repository root, run `python build_data.py` to regenerate the compact dashboard export. Then run `npm install` and `npm run dev` inside `dashboard`.

The CO₂ regression is trained in `build_data.py` on 2000–2020 country-year observations and tested on 2021–2026 observations. Its R², RMSE, predictions and feature importance are exported to `public/data/dashboard.json`. Transition categories are assigned by documented thresholds in the same script.

The exporter also fits market-specific random forest autoregressions with chronological holdouts, evaluates an EU ETS baseline against prior-event features, and builds 2026–2030 empirical analogue pathways from observed country archetypes. Carbon uncertainty bands are approximate and are not calibrated multi-step intervals. The scenario assumptions are observed rates, not causal policy effects.

## Climate Intelligence Assistant

The assistant runs entirely in the browser against `public/data/dashboard.json`. It uses deterministic normalization, weighted intent scoring, entity extraction from available countries, regions, markets and event types, then structured query handlers and arithmetic. It calls no external API and loads no language model or pretrained NLP weights. Responses include the source dataset or local model output and flag projection limits.

Run `npm run test:assistant` for 81 paraphrased validation queries plus conversation-context and calculation checks. The tests check intent routing, safe response values and follow-up behavior. The panel can be opened from the dashboard header.

## Dashboard reading path

The primary navigation uses plain-language sections. Each primary page starts with the question it answers, then a data-derived result and chart. Existing detailed analytics remain available in expandable sections, including model metrics and transition analysis. Data Quality is in the secondary sidebar section. This presentation layer does not retrain models or alter the exported predictions.
