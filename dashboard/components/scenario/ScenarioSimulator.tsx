'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { CountryYear, DashboardData, ScenarioName } from '@/lib/assistant/types'

import { compareScenario, type EnergyMix, type ScenarioSuccess } from '@/lib/api/client'

import { balanceEnergyMix, rebalanceEnergyMix } from '@/lib/calculations/energy-mix'

import { buildPerCapitaChart } from '@/lib/scenario/chart-data'
import { getCountryScenarios, type Q3Scenarios, type Q3Scenario } from '@/lib/api/q3'

const paths: ScenarioName[] = ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition']

const labels: Record<ScenarioName, string> = {
  'Business-as-Usual': 'Current Trend',
  'Moderate Transition': 'Moderate Renewable Growth',
  'Accelerated Transition': 'Fast Renewable Growth',
}

const fields: {
  key: keyof EnergyMix
  label: string
}[] = [
  { key: 'coal_pct', label: 'Coal' },
  { key: 'oil_pct', label: 'Oil' },
  { key: 'gas_pct', label: 'Gas' },
  { key: 'nuclear_pct', label: 'Nuclear' },
  { key: 'hydro_pct', label: 'Hydro' },
  { key: 'solar_pct', label: 'Solar' },
  { key: 'wind_pct', label: 'Wind' },
  { key: 'other_renewables_pct', label: 'Other renewables' },
]

const observedMix = (row: CountryYear): EnergyMix =>
  Object.fromEntries(fields.map(({ key }) => [key, row[key]])) as EnergyMix

const fmt = (value: number | undefined, digits = 1) =>
  value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })

const signed = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`

type SimulationStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'model_not_connected'
  | 'baseline_not_available'
  | 'forecast_not_available'
  | 'year_not_supported'
  | 'validation_error'
  | 'error'

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="v2-section-heading">
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi-label">{label}</div>
      <div className="v2-kpi-value">{value}</div>
      <p>{detail}</p>
    </div>
  )
}

export default function ScenarioSimulator({ data }: { data: DashboardData }) {
  const [country, setCountry] = useState(data.countries[0])
  const [q3, setQ3] = useState<Q3Scenarios | null>(null)
  const [q3Message, setQ3Message] = useState('Loading validated Q3 pathways…')
  useEffect(() => {
    let active = true
    setQ3(null)
    setQ3Message('Loading validated Q3 pathways…')
    getCountryScenarios(country)
      .then((response) => {
        if (!active) return
        if (response.status === 'success') {
          setQ3(response)
          setQ3Message('')
        } else setQ3Message(response.message)
      })
      .catch(() => {
        if (active)
          setQ3Message(
            'Q3 scenario service is unavailable. Start or restart FastAPI to load validated pathways.',
          )
      })
    return () => {
      active = false
    }
  }, [country])

  const [selectedForecastYear, setSelectedForecastYear] = useState<2027 | 2028 | 2029 | 2030>(2030)

  const [path, setPath] = useState<ScenarioName>('Business-as-Usual')

  const rows = useMemo(
    () =>
      data.countriesData.filter((row) => row.country === country).sort((a, b) => a.year - b.year),
    [data, country],
  )

  const observed = rows.at(-1)

  const [mix, setMix] = useState<EnergyMix>(() => observedMix(observed!))

  const [result, setResult] = useState<ScenarioSuccess | null>(null)

  const [message, setMessage] = useState('Final CO₂ prediction model is awaiting integration.')

  const [loading, setLoading] = useState(false)

  const [runStatus, setRunStatus] = useState('')

  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('idle')

  const requestVersion = useRef(0)

  useEffect(() => {
    requestVersion.current += 1

    if (observed) {
      setMix(observedMix(observed))
    }

    setResult(null)
    setMessage('Final CO₂ prediction model is awaiting integration.')
    setRunStatus('')
    setLoading(false)
    setSimulationStatus('idle')
  }, [country])

  const selectedPathValue = q3?.scenarios[q3Names[path]]?.find(
    (point) => point.year === selectedForecastYear,
  )?.co2_per_capita_t

  const bauValue = q3?.scenarios.BAU?.find(
    (point) => point.year === selectedForecastYear,
  )?.co2_per_capita_t
  const q3Chart = useMemo(
    () => [
      ...rows.map((row) => ({
        year: row.year,
        observed: row.co2_per_capita_t,
        current: row.year === 2026 && q3 ? row.co2_per_capita_t : undefined,
        moderate: row.year === 2026 && q3 ? row.co2_per_capita_t : undefined,
        fast: row.year === 2026 && q3 ? row.co2_per_capita_t : undefined,
      })),
      ...[2027, 2028, 2029, 2030].map((year) => ({
        year,
        observed: undefined,
        current: q3?.scenarios.BAU.find((p) => p.year === year)?.co2_per_capita_t,
        moderate: q3?.scenarios.Moderate.find((p) => p.year === year)?.co2_per_capita_t,
        fast: q3?.scenarios.Accelerated.find((p) => p.year === year)?.co2_per_capita_t,
      })),
    ],
    [rows, q3],
  )

  const baselineAnnual = result?.baseline.yearly_forecast?.find(
    (point) => point.year === selectedForecastYear,
  )?.co2_per_capita_t

  const scenarioAnnual = result?.user_scenario.yearly_forecast?.find(
    (point) => point.year === selectedForecastYear,
  )?.co2_per_capita_t

  const baselineSelected =
    baselineAnnual ??
    (result?.target_year === selectedForecastYear ? result.baseline.co2_per_capita_t : undefined)

  const scenarioSelected =
    scenarioAnnual ??
    (result?.target_year === selectedForecastYear
      ? result.user_scenario.co2_per_capita_t
      : undefined)

  const selectedDifference =
    baselineSelected !== undefined && scenarioSelected !== undefined
      ? scenarioSelected - baselineSelected
      : undefined

  const total = fields.reduce((sum, { key }) => sum + mix[key], 0)

  const valid =
    fields.every(({ key }) => Number.isFinite(mix[key]) && mix[key] >= 0 && mix[key] <= 100) &&
    Math.abs(total - 100) <= 0.5

  const chart = q3Chart

  const perCapitaChart = useMemo(() => (result ? buildPerCapitaChart(result) : []), [result])

  const mixChart = fields.map(({ key, label }) => ({
    source: label,
    'Current energy mix': observed?.[key],
    'Your 2030 plan': Number.isFinite(mix[key]) ? mix[key] : undefined,
  }))

  function changeMix(key: keyof EnergyMix, raw: string) {
    requestVersion.current += 1

    setMix((previous) => rebalanceEnergyMix(previous, key, raw === '' ? 0 : Number(raw)))

    setResult(null)
    setLoading(false)

    setMessage('Your plan has changed. Run Simulation to request a new prediction.')

    setRunStatus('')
    setSimulationStatus('idle')
  }

  async function run() {
    if (!valid) return

    const version = ++requestVersion.current

    setLoading(true)
    setResult(null)

    setMessage('Running your energy scenario…')

    setRunStatus('Running your energy scenario…')

    setSimulationStatus('loading')

    try {
      const response = await compareScenario(country, mix, selectedForecastYear)

      if (version !== requestVersion.current) {
        return
      }

      if (response.status === 'success') {
        setResult(response)
        setMessage('')
        setRunStatus('Simulation complete.')
        setSimulationStatus('success')
      } else {
        const detail =
          response.status === 'model_not_connected'
            ? 'Final CO₂ prediction model is awaiting integration.'
            : response.status === 'baseline_not_available'
              ? 'The Current Trend baseline is not available yet.'
              : response.message

        setMessage(detail)
        setRunStatus(detail)

        setSimulationStatus(response.status === 'prediction_error' ? 'error' : response.status)
      }
    } catch (error) {
      if (version !== requestVersion.current) {
        return
      }

      const detail = error instanceof Error ? error.message : 'Simulation is unavailable.'

      setMessage(detail)
      setRunStatus(detail)
      setSimulationStatus('error')
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
      }
    }
  }

  if (!observed) {
    return <div className="v2-error">Country data is unavailable.</div>
  }

  const increase = selectedDifference !== undefined && selectedDifference > 0

  const pct =
    baselineSelected !== undefined && baselineSelected > 0 && selectedDifference !== undefined
      ? Math.abs((selectedDifference / baselineSelected) * 100)
      : undefined

  return (
    <>
      <div className="v2-page-head">
        <div>
          <span className="v2-eyebrow">Future pathways</span>

          <h1>2030 Emissions Simulator</h1>

          <p>
            Change a country&apos;s future energy mix and see how its predicted CO₂ emissions could
            change by 2030.
          </p>
        </div>

        <div className="v2-controls scenario-controls">
          <label className="v2-select">
            <span>Country</span>

            <select
              value={country}
              onChange={(event) => {
                requestVersion.current += 1
                setCountry(event.target.value)
                setResult(null)
                setLoading(false)
                setRunStatus('')
                setSimulationStatus('idle')
              }}
            >
              {data.countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="v2-select">
            <span>Forecast Year</span>

            <select
              value={selectedForecastYear}
              onChange={(event) => {
                requestVersion.current += 1

                setSelectedForecastYear(Number(event.target.value) as 2027 | 2028 | 2029 | 2030)

                setResult(null)
                setLoading(false)
                setRunStatus('')
                setSimulationStatus('idle')

                setMessage('Run Simulation to request a prediction for the selected year.')
              }}
            >
              {([2027, 2028, 2029, 2030] as const).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="v2-select">
            <span>Energy path</span>

            <select value={path} onChange={(event) => setPath(event.target.value as ScenarioName)}>
              {paths.map((item) => (
                <option key={item} value={item}>
                  {labels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <SectionTitle
        title={`${selectedForecastYear} CO₂ Prediction`}
        detail="Observed CO₂ per person is compared with validated Q3 conditional scenarios. Your custom plan uses the separate CO₂ specialist model."
      />

      <div className="v2-kpi-grid">
        <Metric
          label={`Observed CO₂ per person · ${observed.year}`}
          value={`${fmt(observed.co2_per_capita_t, 2)} t/person`}
          detail="Observed · co2_emissions_yearly.csv"
        />

        <Metric
          label={`${labels[path]} · ${selectedForecastYear}`}
          value={
            selectedPathValue === undefined
              ? 'Unavailable'
              : `${fmt(selectedPathValue, 2)} t/person`
          }
          detail="Q3 conditional scenario · separate from final specialist model"
        />

        <Metric
          label={`Your Plan · ${selectedForecastYear}`}
          value={
            scenarioSelected === undefined
              ? 'Awaiting model'
              : `${fmt(scenarioSelected, 2)} t/person`
          }
          detail="CO₂ Specialist Model + your energy plan"
        />

        <Metric
          label={`Compared with Current Trend · ${selectedForecastYear}`}
          value={
            selectedDifference === undefined
              ? 'Unavailable'
              : `${signed(selectedDifference, 2)} t/person`
          }
          detail="Final-model scenario comparison · per person"
        />
      </div>

      <div className="v2-live-status" role="status">
        <strong>Final model prediction</strong>

        <span>{result ? `Connected: ${result.model.name}` : message}</span>
      </div>

      <SectionTitle
        title="Create Your 2030 Energy Plan"
        detail="Adjust the energy mix to see how a different energy strategy could affect predicted CO₂ emissions."
      />

      <section className="v2-card plan-card">
        <div className="plan-heading">
          <div>
            <h2>Set your energy shares</h2>

            <p>
              Starting values are {country}&apos;s observed {observed.year} energy mix. Changing one
              share automatically adjusts the others so the total stays at 100%. Source:
              energy_mix_yearly.csv.
            </p>
          </div>

          <span className="plan-year">{country} · 2030</span>
        </div>

        <div className="scenario-baseline">
          <strong>Current Trend {selectedForecastYear} energy mix</strong>

          {result ? (
            <span>
              {fields
                .map(({ key, label }) => `${label} ${fmt(result.baseline.energy_mix[key])}%`)
                .join(' · ')}
            </span>
          ) : (
            <span>
              Awaiting validated baseline output. The inputs below start from observed{' '}
              {observed.year} values.
            </span>
          )}
        </div>

        <div className="plan-grid">
          {fields.map(({ key, label }) => (
            <label className="plan-field" key={key}>
              <span>{label}</span>

              <div>
                <input
                  aria-label={`${label} share slider`}
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number.isFinite(mix[key]) ? mix[key] : 0}
                  onChange={(event) => changeMix(key, event.target.value)}
                />

                <input
                  aria-label={`${label} percentage`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={Number.isFinite(mix[key]) ? mix[key] : ''}
                  onChange={(event) => changeMix(key, event.target.value)}
                />

                <span>%</span>
              </div>
            </label>
          ))}
        </div>

        <div className="plan-actions">
          <span className={valid ? 'plan-valid' : 'plan-invalid'}>
            Total Energy Mix: {fmt(total, 1)}% · target 100%
          </span>

          <div className="plan-action-buttons">
            <button
              type="button"
              className="plan-secondary"
              onClick={() => {
                requestVersion.current += 1

                setMix(balanceEnergyMix(mix))

                setResult(null)
                setLoading(false)
                setSimulationStatus('idle')
                setRunStatus('')

                setMessage('Your plan has changed. Run Simulation to request a new prediction.')
              }}
            >
              Balance to 100%
            </button>

            <button
              type="button"
              className="plan-secondary"
              onClick={() => {
                requestVersion.current += 1

                setMix(observedMix(observed))

                setResult(null)
                setLoading(false)
                setSimulationStatus('idle')
                setRunStatus('')

                setMessage(
                  'Observed energy mix restored. Run Simulation to request a new prediction.',
                )
              }}
            >
              Reset
            </button>

            <button type="button" onClick={run} disabled={!valid || loading}>
              {loading ? 'Running simulation…' : 'Run Simulation'}
            </button>
          </div>
        </div>

        {!valid && (
          <p className="plan-feedback" role="status">
            Adjust the energy shares until the total is approximately 100%, or use Balance to 100%.
          </p>
        )}

        {runStatus && (
          <p className={`plan-feedback plan-run-status ${simulationStatus}`} role="status">
            {runStatus}
          </p>
        )}
      </section>

      <section className="v2-card v2-chart-card">
        <h2>
          How could {country}&apos;s CO₂ per person change by {selectedForecastYear}?
        </h2>

        <p className="v2-subtitle">
          Observed CO₂ per person, 2000–{observed.year}, and validated Q3 conditional scenario
          pathways through 2030 · tonnes CO₂/person.
        </p>

        <div className="v2-periods">
          <span>
            <b>HISTORICAL</b> 2000–{observed.year} · co2_emissions_yearly.csv
          </span>

          <span>
            <b>SCENARIO PROJECTION</b> 2027–2030 · Q3 conditional scenarios
          </span>
        </div>

        <div className="v2-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chart}
              margin={{
                top: 16,
                right: 25,
                bottom: 5,
                left: 5,
              }}
            >
              <CartesianGrid vertical={false} stroke="#e7edef" />

              <XAxis dataKey="year" tick={{ fontSize: 11 }} />

              <YAxis
                width={62}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => fmt(Number(value), 0)}
              />

              <Tooltip
                formatter={(value: any, name: any) => [`${fmt(Number(value), 2)} t/person`, name]}
              />

              <Legend verticalAlign="bottom" height={38} />

              <ReferenceLine
                x={selectedForecastYear}
                stroke="#cb8a40"
                strokeDasharray="3 3"
                label={{
                  value: `Selected: ${selectedForecastYear}`,
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />

              <ReferenceLine
                x={2026}
                stroke="#7c929b"
                strokeDasharray="5 4"
                label={{
                  value: 'Forecast starts',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />

              <Line
                dataKey="observed"
                name="Observed CO₂"
                stroke="#287d62"
                strokeWidth={2.7}
                dot={false}
                isAnimationActive={false}
              />

              <Line
                dataKey="current"
                name="Current Trend · Q3"
                stroke="#546877"
                strokeDasharray="7 3"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />

              <Line
                dataKey="moderate"
                name="Moderate · Q3"
                stroke="#2a8ba3"
                strokeDasharray="4 3"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />

              <Line
                dataKey="fast"
                name="Accelerated · Q3"
                stroke="#cf8a3d"
                strokeDasharray="2 3"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {result && (
        <section className="v2-card v2-chart-card">
          <h2>Current Trend vs Your Energy Plan · CO₂ per person</h2>

          <p className="v2-subtitle">
            Specialist model output · tonnes of CO₂ per person. A single point is shown when only
            the selected year is available; no intermediate years are inferred.
          </p>

          <div className="v2-chart v2-chart-compact">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={perCapitaChart}
                margin={{
                  top: 16,
                  right: 25,
                  bottom: 5,
                  left: 5,
                }}
              >
                <CartesianGrid vertical={false} stroke="#e7edef" />

                <XAxis
                  dataKey="year"
                  type="number"
                  domain={[2027, 2030]}
                  ticks={[2027, 2028, 2029, 2030]}
                  tick={{
                    fontSize: 11,
                  }}
                />

                <YAxis
                  width={58}
                  tick={{
                    fontSize: 11,
                  }}
                  tickFormatter={(value) => fmt(Number(value), 1)}
                  domain={['auto', 'auto']}
                />

                <Tooltip
                  formatter={(value: any, name: any) => [`${fmt(Number(value), 2)} t/person`, name]}
                />

                <Legend verticalAlign="bottom" height={34} />

                <ReferenceLine x={selectedForecastYear} stroke="#cb8a40" strokeDasharray="3 3" />

                <Line
                  dataKey="current"
                  name="Current Trend · model"
                  stroke="#546877"
                  strokeWidth={2.4}
                  dot={{ r: 5 }}
                  isAnimationActive={false}
                />

                <Line
                  dataKey="plan"
                  name="Your Energy Plan · model"
                  stroke="#8b5bb2"
                  strokeWidth={2.8}
                  dot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="v2-subtitle">
            Custom specialist predictions are shown separately from Q3 conditional scenario
            pathways. Both charts use tonnes CO₂ per person.
          </p>
        </section>
      )}

      {result && (
        <>
          <SectionTitle
            title={`Your Energy Plan in ${selectedForecastYear}`}
            detail={
              baselineSelected === undefined || scenarioSelected === undefined
                ? 'Annual specialist predictions for this year are awaiting integration.'
                : `Final-model comparison · tonnes of CO₂ per person in ${selectedForecastYear}`
            }
          />

          <div className="plan-metrics">
            <div>
              <span>Current Trend · {selectedForecastYear}</span>

              <strong>
                {baselineSelected === undefined
                  ? 'Unavailable'
                  : `${fmt(baselineSelected, 2)} t/person`}
              </strong>
            </div>

            <div>
              <span>Your Plan · {selectedForecastYear}</span>

              <strong>
                {scenarioSelected === undefined
                  ? 'Unavailable'
                  : `${fmt(scenarioSelected, 2)} t/person`}
              </strong>
            </div>

            <div>
              <span>Difference</span>

              <strong>
                {selectedDifference === undefined
                  ? 'Unavailable'
                  : `${signed(selectedDifference, 2)} t/person`}
              </strong>
            </div>

            <div>
              <span>{increase ? 'Projected increase' : 'Potential reduction'}</span>

              <strong>{pct === undefined ? 'Unavailable' : `${fmt(pct, 2)}%`}</strong>
            </div>
          </div>

          <div className="v2-explain v2-neutral">
            <strong>What does this mean?</strong>

            <p>
              {baselineSelected === undefined || scenarioSelected === undefined
                ? `No validated specialist prediction is available for ${selectedForecastYear}. Run the simulation for this year after the model and baseline are connected.`
                : `Under your selected plan, ${country}'s predicted CO₂ per person in ${selectedForecastYear} is ${fmt(
                    scenarioSelected,
                    2,
                  )} tonnes versus ${fmt(
                    baselineSelected,
                    2,
                  )} tonnes under Current Trend. This is ${
                    selectedDifference === 0
                      ? 'unchanged'
                      : pct === undefined
                        ? 'a change whose percentage is unavailable because Current Trend is zero'
                        : `a ${fmt(pct, 2)}% ${increase ? 'increase' : 'decrease'}`
                  } relative to Current Trend. Source: CO₂ Specialist Model + your energy plan.`}
            </p>
          </div>
        </>
      )}

      <SectionTitle
        title="Compare Energy Paths"
        detail={`Validated Q3 conditional scenario pathways for ${selectedForecastYear} · tonnes CO₂ per person.`}
      />

      {!q3 && (
        <div className="v2-live-status" role="status">
          {q3Message}
        </div>
      )}

      <div className="v2-compare-grid">
        {paths.map((name) => {
          const value = q3?.scenarios[q3Names[name]]?.find(
            (point) => point.year === selectedForecastYear,
          )?.co2_per_capita_t

          return (
            <button
              className={`v2-path ${path === name ? 'v2-path-active' : ''}`}
              key={name}
              onClick={() => setPath(name)}
            >
              <span className="v2-path-title">{labels[name]}</span>

              <strong>{value === undefined ? 'Unavailable' : `${fmt(value, 2)} t/person`}</strong>

              <small>Q3 conditional pathway · {selectedForecastYear} estimate</small>

              <span className="v2-path-difference">
                {name === 'Business-as-Usual'
                  ? 'Reference path'
                  : value === undefined || bauValue === undefined
                    ? 'Unavailable'
                    : `${signed(value - bauValue, 2)} t/person vs Current Trend`}
              </span>
            </button>
          )
        })}
      </div>

      <SectionTitle
        title="Energy Path Assumptions"
        detail="Q3 deterministic scenario methodology · conditional pathways, not probability forecasts"
      />

      <div className="v2-assumption-grid">
        {paths.map((name) => {
          const annualRate = q3?.scenarios[q3Names[name]]?.find(
            (point) => point.year === selectedForecastYear,
          )?.annual_rate

          return (
            <div className="v2-assumption" key={name}>
              <strong>{labels[name]}</strong>

              <p>
                {q3?.scenario_method[q3Names[name]] ??
                  'Validated Q3 pathway unavailable for this country.'}
              </p>
              <div>
                <span>Annual CO₂/person rate</span>
                <b>
                  {annualRate === undefined
                    ? 'Unavailable'
                    : `${signed(annualRate * 100, 2)}%/year`}
                </b>
              </div>
            </div>
          )
        })}
      </div>

      <div className="v2-explain v2-neutral">
        <strong>Why this matters</strong>

        <p>
          {selectedDifference !== undefined
            ? `The selected energy plan is associated with ${fmt(
                Math.abs(selectedDifference),
                2,
              )} tonnes ${
                increase ? 'higher' : 'lower'
              } projected CO₂ per person in ${selectedForecastYear} than Current Trend. This is a model comparison, not a causal estimate.`
            : selectedPathValue === undefined
              ? q3Message
              : `The Q3 ${labels[path]} pathway gives ${fmt(selectedPathValue, 2)} tonnes CO₂ per person in ${selectedForecastYear}${bauValue === undefined ? '.' : `, ${fmt(Math.abs(selectedPathValue - bauValue), 2)} tonnes ${selectedPathValue > bauValue ? 'above' : 'below'} Current Trend.`} A custom energy-mix comparison requires the separate CO₂ specialist model.`}
        </p>
      </div>

      <details className="v2-details">
        <summary>Model Details</summary>

        <div className="v2-detail-body">
          {result ? (
            <p>
              Model: {result.model.name}. Target: CO₂ per capita. R²: {fmt(result.model.r2, 3)}.
              RMSE: {fmt(result.model.rmse, 3)} t/person. Both scenarios use the same model.
            </p>
          ) : (
            <p>
              Final model name, features, R², RMSE, training period and testing method will appear
              when validated team outputs are connected. No final-model score is available yet.
            </p>
          )}

          <p>
            Q3 pathways continue the 2018–2026 CO₂/person CAGR for BAU; Moderate subtracts 1.5
            percentage points per year and Accelerated subtracts 3.5. These are conditional
            scenarios, not ML probability forecasts.
          </p>

          <p>
            Historical emissions: co2_emissions_yearly.csv. Current energy mix:
            energy_mix_yearly.csv. Standard paths: validated Q3 annual scenario outputs for six
            representative countries only.
          </p>
        </div>
      </details>

      <SectionTitle
        title="Current Energy Mix vs Your 2030 Plan"
        detail="See exactly how your proposed 2030 energy strategy differs from the current energy mix."
      />

      <section className="v2-card v2-chart-card">
        <p className="v2-subtitle">
          Observed {observed.year} mix vs your inputs · percent of energy · source:
          energy_mix_yearly.csv + your plan
        </p>

        <div className="plan-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={mixChart}
              margin={{
                top: 8,
                right: 10,
                left: 0,
                bottom: 28,
              }}
            >
              <CartesianGrid vertical={false} stroke="#e8edef" />

              <XAxis
                dataKey="source"
                angle={-28}
                textAnchor="end"
                height={60}
                tick={{
                  fontSize: 10,
                }}
              />

              <YAxis
                unit="%"
                tick={{
                  fontSize: 10,
                }}
              />

              <Tooltip formatter={(value: any) => `${fmt(Number(value))}%`} />

              <Legend />

              <Bar dataKey="Current energy mix" fill="#4d7180" />

              <Bar dataKey="Your 2030 plan" fill="#3a9a75" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  )
}
const q3Names: Record<ScenarioName, Q3Scenario> = {
  'Business-as-Usual': 'BAU',
  'Moderate Transition': 'Moderate',
  'Accelerated Transition': 'Accelerated',
}
