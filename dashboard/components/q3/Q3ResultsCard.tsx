'use client'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getArchetypes,
  getGlobalTransitionTrends,
  getQ3Summary,
  type Q3Summary,
  type Q3Transition,
} from '@/lib/api/q3'

export default function Q3ResultsCard() {
  const [summary, setSummary] = useState<Q3Summary | null>(null)
  const [trends, setTrends] = useState<
    { year: number; avg_renewables: number; avg_fossil: number; avg_co2_pc: number }[]
  >([])
  const [countries, setCountries] = useState<Q3Transition[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getQ3Summary(), getGlobalTransitionTrends(), getArchetypes()])
      .then(([a, b, c]) => {
        if (a.status !== 'success' || b.status !== 'success' || c.status !== 'success') {
          setError('Validated Q3 outputs are unavailable.')
          return
        }
        setSummary(a)
        setTrends(b.trends)
        setCountries(c.countries)
      })
      .catch(() => setError('Q3 service unavailable. Restart FastAPI to load transition results.'))
  }, [])
  return (
    <>
      <div className="v2-card">
        <span className="v2-model-number">04 / Q3 TRANSITION SCENARIOS</span>
        <h2>Renewable transition analysis</h2>
        <p>
          KMeans groups 50 country transition fingerprints into BAU, Moderate and Accelerated
          archetypes. Scenario pathways continue 2018–2026 CO₂ per-person CAGR for BAU, then
          subtract 1.5 or 3.5 percentage points per year for Moderate or Accelerated.
        </p>
        <p>
          <strong>
            Conditional scenario pathways, not probability forecasts or the energy-mix regression
            model.
          </strong>
        </p>
        {summary ? (
          <p>
            {Object.entries(summary.archetype_counts)
              .map(([name, count]) => `${name}: ${count}`)
              .join(' · ')}{' '}
            · Representative scenario countries: {summary.representative_countries.join(', ')}.
          </p>
        ) : (
          <p role="status">{error || 'Loading Q3 analysis…'}</p>
        )}
        <small>
          Source: validated Q3 analysis package; 2000–2026 transition analysis, 2026–2030 scenario
          pathways.
        </small>
      </div>
      {trends.length > 0 && (
        <section className="v2-card v2-chart-card">
          <h2>How has the global energy transition changed since 2000?</h2>
          <p className="v2-subtitle">
            Unweighted average energy shares across the supplied countries, 2000–2026 · percent
          </p>
          <div className="v2-chart v2-chart-compact">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="year" />
                <YAxis unit="%" />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(2)}%`} />
                <Legend />
                <Line dataKey="avg_renewables" name="Renewables" stroke="#287d62" dot={false} />
                <Line dataKey="avg_fossil" name="Fossil fuels" stroke="#cf8a3d" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <small>
            Source: global_transition_trends.csv. CO₂/person is omitted from this chart because it
            has a different unit.
          </small>
        </section>
      )}
      {countries.length > 0 && (
        <section className="v2-card v2-chart-card">
          <h2>Country transition fingerprints</h2>
          <p className="v2-subtitle">
            Change from 2000 to 2026 · renewable share in percentage points vs CO₂ per person in
            tonnes
          </p>
          <div className="v2-chart v2-chart-compact">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="renewable_change_pp"
                  name="Renewable change"
                  unit=" pp"
                />
                <YAxis type="number" dataKey="co2_change" name="CO₂/person change" unit=" t" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(v: any) => Number(v).toFixed(2)}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="v2-card">
                        <strong>{payload[0].payload.country}</strong>
                        <div>{payload[0].payload.trajectory}</div>
                        <div>
                          Renewables: {Number(payload[0].payload.renewable_change_pp).toFixed(2)} pp
                        </div>
                        <div>
                          Fossil: {Number(payload[0].payload.fossil_change_pp).toFixed(2)} pp
                        </div>
                        <div>CO₂/person: {Number(payload[0].payload.co2_change).toFixed(2)} t</div>
                        <div>Score: {Number(payload[0].payload.transition_score).toFixed(2)}</div>
                      </div>
                    ) : null
                  }
                />
                <Legend />
                {(['BAU', 'Moderate', 'Accelerated'] as const).map((name, i) => (
                  <Scatter
                    key={name}
                    name={name}
                    data={countries.filter((c) => c.trajectory === name)}
                    fill={['#546877', '#2a8ba3', '#cf8a3d'][i]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <small>Source: country_transition_archetypes.csv.</small>
        </section>
      )}
    </>
  )
}
