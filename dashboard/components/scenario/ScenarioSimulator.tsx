'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CountryYear, DashboardData, ScenarioName } from '@/lib/assistant/types'
import { compareScenario, type EnergyMix, type ScenarioSuccess } from '@/lib/api/client'

const paths: ScenarioName[] = ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition']
const labels: Record<ScenarioName, string> = { 'Business-as-Usual': 'Current Trend', 'Moderate Transition': 'Moderate Renewable Growth', 'Accelerated Transition': 'Fast Renewable Growth' }
const fields: { key: keyof EnergyMix; label: string }[] = [
  { key: 'coal_pct', label: 'Coal' }, { key: 'oil_pct', label: 'Oil' }, { key: 'gas_pct', label: 'Gas' },
  { key: 'nuclear_pct', label: 'Nuclear' }, { key: 'hydro_pct', label: 'Hydro' },
  { key: 'solar_pct', label: 'Solar' }, { key: 'wind_pct', label: 'Wind' },
  { key: 'other_renewables_pct', label: 'Other renewables' },
]
const observedMix = (row: CountryYear): EnergyMix => Object.fromEntries(fields.map(({ key }) => [key, row[key]])) as EnergyMix
const fmt = (value: number | undefined, digits = 1) => value === undefined || !Number.isFinite(value) ? 'Unavailable' : value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const signed = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return <div className="v2-section-heading"><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="v2-kpi"><div className="v2-kpi-label">{label}</div><div className="v2-kpi-value">{value}</div><p>{detail}</p></div>
}

export default function ScenarioSimulator({ data }: { data: DashboardData }) {
  const [country, setCountry] = useState(data.countries[0])
  const [selectedForecastYear, setSelectedForecastYear] = useState<2027 | 2028 | 2029 | 2030>(2030)
  const [path, setPath] = useState<ScenarioName>('Business-as-Usual')
  const rows = useMemo(() => data.countriesData.filter(row => row.country === country).sort((a, b) => a.year - b.year), [data, country])
  const observed = rows.at(-1)
  const [mix, setMix] = useState<EnergyMix>(() => observedMix(observed!))
  const [result, setResult] = useState<ScenarioSuccess | null>(null)
  const [message, setMessage] = useState('Final CO₂ prediction model is awaiting integration.')
  const [loading, setLoading] = useState(false)
  useEffect(() => { if (observed) setMix(observedMix(observed)); setResult(null); setMessage('Final CO₂ prediction model is awaiting integration.') }, [country, observed])

  const outputs = data.scenarios[country]
  const selected = outputs?.[path]
  const bau = outputs?.['Business-as-Usual']
  const selectedPathValue = selected?.forecast.find(point => point.year === selectedForecastYear)?.co2_emissions_mt
  const bauValue = bau?.forecast.find(point => point.year === selectedForecastYear)?.co2_emissions_mt
  const baselineAnnual = result?.baseline.yearly_forecast?.find(point => point.year === selectedForecastYear)?.co2_per_capita_t
  const scenarioAnnual = result?.user_scenario.yearly_forecast?.find(point => point.year === selectedForecastYear)?.co2_per_capita_t
  const baselineSelected = selectedForecastYear === 2030 ? baselineAnnual ?? result?.baseline.co2_per_capita_t : baselineAnnual
  const scenarioSelected = selectedForecastYear === 2030 ? scenarioAnnual ?? result?.user_scenario.co2_per_capita_t : scenarioAnnual
  const selectedDifference = baselineSelected !== undefined && scenarioSelected !== undefined ? scenarioSelected - baselineSelected : undefined
  const total = fields.reduce((sum, { key }) => sum + mix[key], 0)
  const valid = fields.every(({ key }) => Number.isFinite(mix[key]) && mix[key] >= 0 && mix[key] <= 100) && Math.abs(total - 100) <= 0.5
  const chart = useMemo(() => {
    const observedPoints = rows.map(row => ({ year: row.year, observed: row.co2_emissions_mt }))
    const projected = Array.from({ length: 5 }, (_, index) => ({
      year: 2026 + index,
      current: result?.baseline.yearly_forecast?.find(point => point.year === 2026 + index)?.co2_emissions_mt ?? outputs?.['Business-as-Usual']?.forecast[index]?.co2_emissions_mt,
      moderate: outputs?.['Moderate Transition']?.forecast[index]?.co2_emissions_mt,
      fast: outputs?.['Accelerated Transition']?.forecast[index]?.co2_emissions_mt,
      plan: result?.user_scenario.yearly_forecast?.find(point => point.year === 2026 + index)?.co2_emissions_mt,
    }))
    return [...observedPoints, ...projected]
  }, [rows, outputs, result])
  const mixChart = fields.map(({ key, label }) => ({ source: label, 'Current energy mix': observed?.[key], 'Your 2030 plan': Number.isFinite(mix[key]) ? mix[key] : undefined }))

  function changeMix(key: keyof EnergyMix, raw: string) {
    setMix(previous => ({ ...previous, [key]: raw === '' ? NaN : Number(raw) }))
    setResult(null)
    setMessage('Your plan has changed. Run Simulation to request a new prediction.')
  }
  async function run() {
    if (!valid) return
    setLoading(true); setResult(null); setMessage('Running simulation…')
    try {
      const response = await compareScenario(country, mix)
      if (response.status === 'success') { setResult(response); setMessage('') }
      else setMessage(response.message)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Simulation is unavailable.') }
    finally { setLoading(false) }
  }

  if (!observed || !outputs) return <div className="v2-error">Country data is unavailable.</div>
  const increase = selectedDifference !== undefined && selectedDifference > 0
  const pct = baselineSelected !== undefined && baselineSelected > 0 && selectedDifference !== undefined ? Math.abs(selectedDifference / baselineSelected * 100) : undefined
  return <>
    <div className="v2-page-head"><div><span className="v2-eyebrow">Future pathways</span><h1>2030 Emissions Simulator</h1><p>Change a country&apos;s future energy mix and see how its predicted CO₂ emissions could change by 2030.</p></div><div className="v2-controls scenario-controls"><label className="v2-select"><span>Country</span><select value={country} onChange={event => setCountry(event.target.value)}>{data.countries.map(item => <option key={item}>{item}</option>)}</select></label><label className="v2-select"><span>Forecast Year</span><select value={selectedForecastYear} onChange={event => setSelectedForecastYear(Number(event.target.value) as 2027 | 2028 | 2029 | 2030)}>{([2027, 2028, 2029, 2030] as const).map(year => <option key={year} value={year}>{year}</option>)}</select></label><label className="v2-select"><span>Energy path</span><select value={path} onChange={event => setPath(event.target.value as ScenarioName)}>{paths.map(item => <option key={item} value={item}>{labels[item]}</option>)}</select></label></div></div>

    <SectionTitle title={`${selectedForecastYear} CO₂ Prediction`} detail="Observed emissions appear alongside the live specialist model state. The standard paths below are separate, dataset-based estimates."/>
    <div className="v2-kpi-grid"><Metric label={`CO₂ in ${observed.year}`} value={`${fmt(observed.co2_emissions_mt)} Mt CO₂`} detail="Observed · co2_emissions_yearly.csv"/><Metric label={`${labels[path]} · ${selectedForecastYear}`} value={selectedPathValue === undefined ? 'Unavailable' : `${fmt(selectedPathValue)} Mt CO₂`} detail="Dataset-based path estimate · separate from final specialist model"/><Metric label={`Your Plan · ${selectedForecastYear}`} value={scenarioSelected === undefined ? 'Awaiting model' : `${fmt(scenarioSelected, 2)} t/person`} detail="CO₂ Specialist Model + your energy plan"/><Metric label={`Compared with Current Trend · ${selectedForecastYear}`} value={selectedDifference === undefined ? 'Unavailable' : `${signed(selectedDifference, 2)} t/person`} detail="Final-model scenario comparison · per person"/></div>
    <div className="v2-live-status" role="status"><strong>Final model prediction</strong><span>{result ? `Connected: ${result.model.name}` : message}</span></div>

    <SectionTitle title="Create Your 2030 Energy Plan" detail="Adjust the energy mix to see how a different energy strategy could affect predicted CO₂ emissions."/>
    <section className="v2-card plan-card"><div className="plan-heading"><div><h2>Set your energy shares</h2><p>Starting values are {country}&apos;s observed {observed.year} energy mix. Source: energy_mix_yearly.csv.</p></div><span className="plan-year">{country} · 2030</span></div><div className="scenario-baseline"><strong>Current Trend 2030 energy mix</strong>{result ? <span>{fields.map(({key,label})=>`${label} ${fmt(result.baseline.energy_mix[key])}%`).join(" · ")}</span> : <span>Awaiting validated baseline output. The inputs below start from observed {observed.year} values.</span>}</div><div className="plan-grid">{fields.map(({ key, label }) => <label className="plan-field" key={key}><span>{label}</span><div><input aria-label={`${label} share slider`} type="range" min="0" max="100" step="0.1" value={Number.isFinite(mix[key]) ? mix[key] : 0} onChange={event => changeMix(key, event.target.value)}/><input aria-label={`${label} percentage`} type="number" min="0" max="100" step="0.1" value={Number.isFinite(mix[key]) ? mix[key] : ''} onChange={event => changeMix(key, event.target.value)}/><span>%</span></div></label>)}</div><div className="plan-actions"><span className={valid ? 'plan-valid' : 'plan-invalid'}>Total Energy Mix: {fmt(total, 1)}% · target 100%</span><button type="button" onClick={run} disabled={!valid || loading}>{loading ? 'Running simulation…' : 'Run Simulation'}</button></div>{!valid && <p className="plan-feedback" role="status">Adjust the energy shares until the total is approximately 100%.</p>}</section>

    <section className="v2-card v2-chart-card"><h2>How could {country}&apos;s CO₂ emissions change by {selectedForecastYear}?</h2><p className="v2-subtitle">Observed 2000–{observed.year} emissions and separate historical-analogue path estimates through 2030 · million tonnes CO₂. These path estimates are awaiting replacement by the final team model.</p><div className="v2-periods"><span><b>HISTORICAL</b> 2000–{observed.year} · co2_emissions_yearly.csv</span><span><b>SCENARIO PROJECTION</b> 2027–2030 · current analysis export</span></div><div className="v2-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 16, right: 25, bottom: 5, left: 5 }}><CartesianGrid vertical={false} stroke="#e7edef"/><XAxis dataKey="year" tick={{ fontSize: 11 }}/><YAxis width={62} tick={{ fontSize: 11 }} tickFormatter={value => fmt(Number(value), 0)}/><Tooltip formatter={(value: any, name: any) => [`${fmt(Number(value))} Mt CO₂`, name]}/><Legend verticalAlign="bottom" height={38}/><ReferenceLine x={selectedForecastYear} stroke="#cb8a40" strokeDasharray="3 3" label={{ value: `Selected: ${selectedForecastYear}`, fontSize: 10, position: "insideTopLeft" }}/><ReferenceLine x={2026} stroke="#7c929b" strokeDasharray="5 4" label={{ value: 'Forecast starts', fontSize: 10, position: 'insideTopRight' }}/><Line dataKey="observed" name="Observed CO₂" stroke="#287d62" strokeWidth={2.7} dot={false} isAnimationActive={false}/><Line dataKey="current" name="Current Trend estimate" stroke="#546877" strokeDasharray="7 3" strokeWidth={2.2} dot={false} isAnimationActive={false}/><Line dataKey="moderate" name="Moderate estimate" stroke="#2a8ba3" strokeDasharray="4 3" strokeWidth={2.2} dot={false} isAnimationActive={false}/><Line dataKey="fast" name="Fast estimate" stroke="#cf8a3d" strokeDasharray="2 3" strokeWidth={2.2} dot={false} isAnimationActive={false}/>{result?.user_scenario.yearly_forecast?.some(point=>point.co2_emissions_mt!==null&&point.co2_emissions_mt!==undefined)&&<Line dataKey="plan" name="Your Energy Plan" stroke="#8b5bb2" strokeDasharray="4 2" strokeWidth={2.6} dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer></div></section>

    {result && <><SectionTitle title={`Your Energy Plan in ${selectedForecastYear}`} detail={baselineSelected === undefined || scenarioSelected === undefined ? 'Annual specialist predictions for this year are awaiting integration.' : `Final-model comparison · tonnes of CO₂ per person in ${selectedForecastYear}`}/><div className="plan-metrics"><div><span>Current Trend · {selectedForecastYear}</span><strong>{baselineSelected === undefined ? 'Unavailable' : `${fmt(baselineSelected, 2)} t/person`}</strong></div><div><span>Your Plan · {selectedForecastYear}</span><strong>{scenarioSelected === undefined ? 'Unavailable' : `${fmt(scenarioSelected, 2)} t/person`}</strong></div><div><span>Difference</span><strong>{selectedDifference === undefined ? 'Unavailable' : `${signed(selectedDifference, 2)} t/person`}</strong></div><div><span>{increase ? 'Projected increase' : 'Potential reduction'}</span><strong>{pct === undefined ? 'Unavailable' : `${fmt(pct, 2)}%`}</strong></div></div><div className="v2-explain v2-neutral"><strong>What does this mean?</strong><p>{baselineSelected === undefined || scenarioSelected === undefined ? `The final model supplied a 2030 endpoint, but no validated annual prediction for ${selectedForecastYear}. The selected year cannot be estimated from the endpoint alone.` : `Under your selected plan, ${country}'s predicted CO₂ per person in ${selectedForecastYear} is ${fmt(scenarioSelected, 2)} tonnes versus ${fmt(baselineSelected, 2)} tonnes under Current Trend. This is ${selectedDifference === 0 ? 'unchanged' : pct === undefined ? 'a change whose percentage is unavailable because Current Trend is zero' : `a ${fmt(pct, 2)}% ${increase ? 'increase' : 'decrease'}`} relative to Current Trend. Source: CO₂ Specialist Model + your energy plan.`}</p></div></>}

    <SectionTitle title="Compare Energy Paths" detail={`Compare all energy paths for ${selectedForecastYear}. Existing dataset-based estimates are separate from the final specialist model.`}/><div className="v2-compare-grid">{paths.map(name => { const value = outputs[name]?.forecast.find(point => point.year === selectedForecastYear)?.co2_emissions_mt; return <button className={`v2-path ${path === name ? 'v2-path-active' : ''}`} key={name} onClick={() => setPath(name)}><span className="v2-path-title">{labels[name]}</span><strong>{fmt(value)} Mt CO₂</strong><small>Dataset-based {selectedForecastYear} estimate</small><span className="v2-path-difference">{name === 'Business-as-Usual' ? 'Reference path' : `${signed((value || 0) - (bauValue || 0))} Mt vs Current Trend`}</span></button> })}</div>
    <SectionTitle title="Energy Path Assumptions" detail="Observed-rate inputs used by the existing historical-analogue projections"/><div className="v2-assumption-grid">{paths.map(name => { const assumptions = outputs[name].assumptions; return <div className="v2-assumption" key={name}><strong>{labels[name]}</strong><div><span>Renewable share</span><b>{signed(assumptions.renewablePpPerYear, 3)} points/year</b></div><div><span>Fossil share</span><b>{signed(assumptions.fossilPpPerYear, 3)} points/year</b></div><div><span>Emissions growth</span><b>{signed(assumptions.emissionsGrowthPct, 3)}%/year</b></div></div> })}</div>
    <div className="v2-explain v2-neutral"><strong>Why this matters</strong><p>{selectedDifference !== undefined ? `The selected energy plan is associated with ${fmt(Math.abs(selectedDifference), 2)} tonnes ${increase ? 'higher' : 'lower'} projected CO₂ per person in ${selectedForecastYear} than Current Trend. This is a model comparison, not a causal estimate.` : `The existing ${labels[path]} path has a dataset-based ${selectedForecastYear} estimate of ${fmt(selectedPathValue)} Mt CO₂. A custom annual impact comparison will appear when the final model supplies ${selectedForecastYear} outputs.`}</p></div>
    <details className="v2-details"><summary>Model Details</summary><div className="v2-detail-body">{result ? <p>Model: {result.model.name}. Target: CO₂ per capita. R²: {fmt(result.model.r2, 3)}. RMSE: {fmt(result.model.rmse, 3)} t/person. Both scenarios use the same model.</p> : <p>Final model name, features, R², RMSE, training period and testing method will appear when validated team outputs are connected. No final-model score is available yet.</p>}<p>{data.scenarioMethod}</p><p>Historical emissions: co2_emissions_yearly.csv. Current energy mix: energy_mix_yearly.csv. Existing standard paths are dataset-based analysis outputs.</p></div></details>

    <SectionTitle title="Current Energy Mix vs Your 2030 Plan" detail="See exactly how your proposed 2030 energy strategy differs from the current energy mix."/><section className="v2-card v2-chart-card"><p className="v2-subtitle">Observed {observed.year} mix vs your inputs · percent of energy · source: energy_mix_yearly.csv + your plan</p><div className="plan-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={mixChart} margin={{ top: 8, right: 10, left: 0, bottom: 28 }}><CartesianGrid vertical={false} stroke="#e8edef"/><XAxis dataKey="source" angle={-28} textAnchor="end" height={60} tick={{ fontSize: 10 }}/><YAxis unit="%" tick={{ fontSize: 10 }}/><Tooltip formatter={(value: any) => `${fmt(Number(value))}%`}/><Legend/><Bar dataKey="Current energy mix" fill="#4d7180"/><Bar dataKey="Your 2030 plan" fill="#3a9a75"/></BarChart></ResponsiveContainer></div></section>
  </>
}
