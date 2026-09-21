'use client'

import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  getCO2FeatureImportance, getCO2ModelComparison, getCO2ModelSummary,
  getCO2TestPredictions, type CO2Comparison, type CO2Feature, type CO2Summary,
  type CO2TestPrediction,
} from '@/lib/api/co2'

const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(4) : 'Unavailable'

export default function CO2ModelResults() {
  const [summary, setSummary] = useState<CO2Summary | null>(null)
  const [features, setFeatures] = useState<CO2Feature[]>([])
  const [models, setModels] = useState<CO2Comparison[]>([])
  const [predictions, setPredictions] = useState<CO2TestPrediction[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      getCO2ModelSummary(), getCO2FeatureImportance(), getCO2ModelComparison(),
      getCO2TestPredictions(),
    ]).then(([a, b, c, d]) => {
      if (!active) return
      setSummary(a)
      setFeatures(b.features)
      setModels(c.models)
      setPredictions(d.predictions)
    }).catch(() => {
      if (active) setError('Q1.2 model analysis is unavailable from the backend.')
    })
    return () => { active = false }
  }, [])

  if (error) return <div className="v2-card" role="status">{error}</div>
  if (!summary) return <div className="v2-card" role="status">Loading validated Q1.2 results…</div>
  const { validation, test, data_split } = summary.summary
  const max = Math.ceil(Math.max(...predictions.flatMap((row) => [row.co2_per_capita_t, row.predicted_co2_per_capita_t]), 1) / 5) * 5

  return (
    <>
      <div className="v2-card">
        <span className="v2-model-number">02 / CO₂ PER PERSON · Q1.2</span>
        <h2>{summary.summary.model}</h2>
        <p>Predicts <strong>tonnes CO₂ per person</strong> from the energy mix and observed year. The 2030 pathways come from Q3.</p>
        <p>Training {data_split.train} · validation {data_split.validation} · unseen test {data_split.test}</p>
        <div className="v2-technical-kpis">
          <div><span>Validation R²</span><strong>{fmt(validation.r2)}</strong></div>
          <div><span>Validation RMSE</span><strong>{fmt(validation.rmse)} t/person</strong></div>
          <div><span>Validation MAE</span><strong>{fmt(validation.mae)} t/person</strong></div>
          <div><span>Final test R²</span><strong>{fmt(test.r2)}</strong></div>
          <div><span>Final test RMSE</span><strong>{fmt(test.rmse)} t/person</strong></div>
          <div><span>Final test MAE</span><strong>{fmt(test.mae)} t/person</strong></div>
        </div>
        <small>Source: Q1.2 dashboard_summary.json and final_test_results.csv.</small>
      </div>
      <div className="v2-two">
        <section className="v2-card v2-chart-card">
          <h2>Key Energy-Mix Drivers</h2>
          <p className="v2-subtitle">Random Forest feature importance · Q1.2 feature_importance.csv</p>
          <div className="v2-chart" style={{ height: 430 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...features].reverse()} layout="vertical" margin={{ left: 26, right: 14 }}>
                <CartesianGrid horizontal={false} stroke="#e8edef" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="feature" width={145} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : 'Unavailable'} />
                <Bar dataKey="importance" name="Importance" fill="#389176" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="v2-card v2-chart-card">
          <h2>Actual vs Predicted CO₂ per Person</h2>
          <p className="v2-subtitle">Held-out test observations · 2024–2026 · tonnes CO₂/person</p>
          <div className="v2-chart" style={{ height: 430 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ bottom: 16, right: 14 }}>
                <CartesianGrid stroke="#e8edef" />
                <XAxis type="number" dataKey="co2_per_capita_t" domain={[0, max]} name="Actual" unit=" t/person" tick={{ fontSize: 10 }} label={{ value: 'Actual CO₂/person', position: 'bottom' }} />
                <YAxis type="number" dataKey="predicted_co2_per_capita_t" domain={[0, max]} name="Predicted" unit=" t/person" tick={{ fontSize: 10 }} label={{ value: 'Predicted CO₂/person', angle: -90, position: 'insideLeft' }} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#93a7a4" strokeDasharray="4 4" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: any) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} t/person` : 'Unavailable'} />
                <Scatter name="Test prediction" data={predictions} fill="#287d62" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <small>Each point is a held-out country-year, not a future forecast. Dashed line: ideal prediction.</small>
        </section>
      </div>
      <section className="v2-card">
        <h2>Validation model comparison</h2>
        <p className="v2-subtitle">Same 2021–2023 validation period · lower RMSE/MAE is better</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr><th>Model</th><th>R²</th><th>RMSE (t/person)</th><th>MAE (t/person)</th></tr></thead>
            <tbody>{models.map((row) => <tr key={row.model}><td>{row.model}</td><td>{fmt(row.r2)}</td><td>{fmt(row.rmse)}</td><td>{fmt(row.mae)}</td></tr>)}</tbody>
          </table>
        </div>
        <small>Source: Q1.2 validation_model_comparison.csv. The final deployed specialist is Random Forest.</small>
      </section>
    </>
  )
}
