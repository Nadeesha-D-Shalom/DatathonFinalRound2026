'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardData } from '@/lib/assistant/types'
import {
  getQ2EventWindowAnalysis,
  getQ2FeatureImportance,
  getQ2ImpactResults,
  getQ2Summary,
  type Q2Features,
  type Q2Impact,
  type Q2Summary,
  type Q2Window,
} from '@/lib/api/q2'

const fmt = (value: number | undefined, digits = 3) =>
  value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
type Result = { summary: Q2Summary; features: Q2Features; window: Q2Window; impact: Q2Impact }

export default function Q2EventsPage({ data }: { data: DashboardData }) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null)
    setError('')
    Promise.all([
      getQ2Summary(),
      getQ2FeatureImportance(),
      getQ2EventWindowAnalysis(),
      getQ2ImpactResults(),
    ])
      .then(([summary, features, window, impact]) => {
        if (!active) return
        if (
          [summary.status, features.status, window.status, impact.status].some(
            (status) => status !== 'success',
          )
        )
          throw new Error('Validated Q2 analysis is unavailable.')
        setResult({ summary, features, window, impact })
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Q2 analysis is unavailable.')
      })
    return () => {
      active = false
    }
  }, [retry])

  const recentEvents = useMemo(
    () => [...data.events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [data.events],
  )
  if (error)
    return (
      <div className="v2-error" role="alert">
        Q2 analysis is unavailable: {error}{' '}
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
      </div>
    )
  if (!result)
    return (
      <div className="v2-loading" role="status">
        Loading validated Q2 analysis…
      </div>
    )

  const { summary, features, window, impact } = result
  const { baseline, event_aware: eventAware, comparison, markets } = summary.experiment
  const improvement = comparison.rmse_improvement_percent
  const marginal = Math.abs(improvement) < 1
  const mapeWorsened = eventAware.mape > baseline.mape
  const chart = [
    { name: 'Baseline Ridge', rmse: baseline.rmse },
    { name: 'Ridge + events', rmse: eventAware.rmse },
  ]
  const featureChart = features.features.map((item) => ({
    name: item.feature.replaceAll('_', ' '),
    value: item.abs_coefficient,
  }))
  const examples = impact.results.slice(-6).reverse()

  return (
    <>
      <div className="v2-page-head">
        <div>
          <span className="v2-eyebrow">Climate and markets</span>
          <h1>Do Climate Events Improve Carbon Price Prediction?</h1>
          <p>
            We tested the same Ridge prediction approach with and without climate and policy event
            features.
          </p>
        </div>
      </div>
      <div className="v2-intro">
        <strong>Q2 finding</strong>
        <span>
          {summary.conclusion} Results cover{' '}
          {markets.map((market) => market.replaceAll('_', ' ')).join(', ')}. RMSE aggregates quoted
          prices across these markets, so it is not a single-currency error.
        </span>
      </div>
      <div className="v2-kpi-grid">
        <div className="v2-kpi">
          <div className="v2-kpi-label">Baseline model · RMSE</div>
          <div className="v2-kpi-value">{fmt(baseline.rmse, 4)}</div>
          <p>Ridge without event features</p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Event-aware model · RMSE</div>
          <div className="v2-kpi-value">{fmt(eventAware.rmse, 4)}</div>
          <p>Same Ridge approach + event features</p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">RMSE improvement</div>
          <div className="v2-kpi-value">{fmt(improvement, 4)}%</div>
          <p>{improvement >= 0 ? 'Lower prediction error' : 'Higher prediction error'}</p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Event-window improvement</div>
          <div className="v2-kpi-value">{fmt(window.event_window.improvement_percent, 4)}%</div>
          <p>{window.event_window.rows} event-active test rows</p>
        </div>
      </div>
      <section className="v2-card v2-chart-card">
        <h2>Baseline vs Event-Aware Prediction Error</h2>
        <p className="v2-subtitle">
          Held-out Q2 experiment · lower RMSE is better · pooled quoted-price values from the
          included markets
        </p>
        <div className="v2-chart v2-chart-compact">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chart}
              layout="vertical"
              margin={{ top: 12, right: 24, bottom: 12, left: 20 }}
            >
              <CartesianGrid horizontal={false} stroke="#e8edef" />
              <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={135} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: any) => fmt(Number(value), 4)} />
              <Bar dataKey="rmse" name="RMSE" fill="#368e72" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="v2-section-heading">
        <h2>RMSE, MAE and MAPE</h2>
        <p>The same held-out comparison, including metrics that did not improve.</p>
      </div>
      <div className="v2-card v2-country-table q2-metric-table">
        <div>
          <strong>Metric</strong>
          <strong>Baseline</strong>
          <strong>Event-aware</strong>
        </div>
        <div>
          <span>RMSE</span>
          <span>{fmt(baseline.rmse, 4)}</span>
          <span>{fmt(eventAware.rmse, 4)}</span>
        </div>
        <div>
          <span>MAE</span>
          <span>{fmt(baseline.mae, 4)}</span>
          <span>{fmt(eventAware.mae, 4)}</span>
        </div>
        <div>
          <span>MAPE</span>
          <span>{fmt(baseline.mape, 4)}%</span>
          <span>{fmt(eventAware.mape, 4)}%</span>
        </div>
      </div>
      <div className="v2-explain v2-neutral">
        <strong>What did we learn?</strong>
        <p>
          Event features {improvement >= 0 ? 'reduced' : 'increased'} RMSE by{' '}
          {fmt(Math.abs(improvement), 4)}%. {marginal ? 'This is a marginal change.' : ''}{' '}
          {mapeWorsened
            ? `MAPE worsened by ${fmt(Math.abs(comparison.mape_improvement_percent), 3)}%.`
            : `MAPE improved by ${fmt(comparison.mape_improvement_percent, 3)}%.`}{' '}
          Events serve as a contextual alert layer, not the main pricing model. This experiment
          measures predictive value, not whether an event caused a price movement.
        </p>
      </div>
      <div className="v2-two">
        <section className="v2-card v2-chart-card">
          <h2>Which event features mattered most?</h2>
          <p className="v2-subtitle">
            Absolute standardized Ridge coefficients · direction is available in the model details
          </p>
          <div className="v2-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={featureChart}
                layout="vertical"
                margin={{ top: 6, right: 12, bottom: 6, left: 24 }}
              >
                <CartesianGrid horizontal={false} stroke="#e8edef" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => fmt(Number(value), 4)} />
                <Bar dataKey="value" name="Absolute coefficient" fill="#2a8ba3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="v2-card">
          <h2>When do event features help?</h2>
          <p className="v2-subtitle">Event-active periods in the validated held-out output</p>
          <div className="v2-technical-kpis">
            <div>
              <span>Event-active rows</span>
              <strong>{window.event_window.rows}</strong>
            </div>
            <div>
              <span>Baseline RMSE</span>
              <strong>{fmt(window.event_window.baseline_rmse, 4)}</strong>
            </div>
            <div>
              <span>Event-aware RMSE</span>
              <strong>{fmt(window.event_window.event_aware_rmse, 4)}</strong>
            </div>
            <div>
              <span>Improvement</span>
              <strong>{fmt(window.event_window.improvement_percent, 4)}%</strong>
            </div>
          </div>
          <p className="v2-subtitle">
            The event-aware model had a marginally lower RMSE in these event-active rows. This does
            not establish event causality.
          </p>
        </section>
      </div>
      <div className="v2-section-heading">
        <h2>Recent recorded climate events</h2>
        <p>Five latest records from the supplied competition event file.</p>
      </div>
      <div className="v2-event-list">
        {recentEvents.map((event) => (
          <div key={`${event.date}-${event.description}`}>
            <span>{event.date}</span>
            <strong>{event.description}</strong>
            <small>
              {event.region} · {event.event_type} · Severity {event.severity_score} · Policy{' '}
              {event.is_policy ? 'yes' : 'no'} · Weather {event.is_extreme_weather ? 'yes' : 'no'} ·
              Disaster {event.is_disaster ? 'yes' : 'no'}
            </small>
          </div>
        ))}
      </div>
      <details className="v2-details">
        <summary>Model Details</summary>
        <div className="v2-detail-body">
          <p>
            Both arms used Ridge regression. The event-aware arm added only the features listed
            below. The supplied Q2 package describes an untouched held-out test; exact train and
            test dates are not provided in its summary.
          </p>
          <p>
            Source: provided carbon_prices_daily.csv and climate_events.csv; Q2 cross-dataset
            feature engineering outputs. Trained artifacts are stored in
            backend/models/q2/ridge_baseline.pkl and ridge_event_aware.pkl. They are not executed on
            page load.
          </p>
          <div className="v2-country-table">
            <div>
              <strong>Event feature</strong>
              <strong>Signed coefficient</strong>
            </div>
            {features.features.map((item) => (
              <div key={item.feature}>
                <span title={item.description}>{item.feature}</span>
                <span>{fmt(item.coefficient, 4)}</span>
              </div>
            ))}
          </div>
          <p>Held-out result rows: {impact.count}. Latest six records:</p>
          <div className="v2-country-table q2-metric-table">
            <div>
              <strong>Date · market</strong>
              <strong>Observed</strong>
              <strong>Baseline / event-aware</strong>
            </div>
            {examples.map((item) => (
              <div key={`${item.date}-${item.market}`}>
                <span>
                  {item.date} · {item.market.replaceAll('_', ' ')}
                </span>
                <span>
                  {fmt(item.price, 2)} {item.currency}
                </span>
                <span>
                  {fmt(item.baseline_prediction, 2)} / {fmt(item.event_aware_prediction, 2)}{' '}
                  {item.currency}
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </>
  )
}
