'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BackendUnavailableError,
  getCountries,
  getCountryEnergyCO2,
  predictCO2,
  type CO2PredictionSuccess,
  type CountryEnergyCO2,
  type EnergyMix,
} from '@/lib/api/client'
import { localCountryProfile } from '@/lib/api/observed-fallback'
import { balanceEnergyMix, rebalanceEnergyMix } from '@/lib/calculations/energy-mix'
import type { DashboardData } from '@/lib/assistant/types'
import Q3CountryStatus from '@/components/q3/Q3CountryStatus'

const sources: { key: keyof EnergyMix; label: string }[] = [
  { key: 'coal_pct', label: 'Coal' },
  { key: 'oil_pct', label: 'Oil' },
  { key: 'gas_pct', label: 'Gas' },
  { key: 'nuclear_pct', label: 'Nuclear' },
  { key: 'hydro_pct', label: 'Hydro' },
  { key: 'solar_pct', label: 'Solar' },
  { key: 'wind_pct', label: 'Wind' },
  { key: 'other_renewables_pct', label: 'Other renewables' },
]
const mixFromProfile = (profile: CountryEnergyCO2): EnergyMix =>
  Object.fromEntries(sources.map(({ key }) => [key, profile.energy_mix[key]])) as EnergyMix
const fmt = (value: number | undefined, digits = 1) =>
  value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi-label">{label}</div>
      <div className="v2-kpi-value">{value}</div>
      <p>{detail}</p>
    </div>
  )
}

export default function CO2EnergyPage({ data }: { data: DashboardData }) {
  const [countries, setCountries] = useState<string[]>([])
  const [country, setCountry] = useState('')
  const [profile, setProfile] = useState<CountryEnergyCO2 | null>(null)
  const [mix, setMix] = useState<EnergyMix | null>(null)
  const [observedPrediction, setObservedPrediction] = useState<CO2PredictionSuccess | null>(null)
  const [predictionMessage, setPredictionMessage] = useState('Checking specialist model…')
  const [customPrediction, setCustomPrediction] = useState<CO2PredictionSuccess | null>(null)
  const [customMessage, setCustomMessage] = useState('')
  const [countryError, setCountryError] = useState('')
  const [loadingCountry, setLoadingCountry] = useState(true)
  const [loadingPrediction, setLoadingPrediction] = useState(false)
  const [retry, setRetry] = useState(0)
  const [backendOffline, setBackendOffline] = useState(false)

  useEffect(() => {
    let active = true
    setCountryError('')
    setLoadingCountry(true)
    setBackendOffline(false)
    getCountries()
      .then((response) => {
        if (!active) return
        setCountries(response.countries)
        if (response.countries.length === 0) {
          setCountryError('No countries are available in the supplied datasets.')
          setLoadingCountry(false)
        } else
          setCountry((previous) =>
            response.countries.includes(previous) ? previous : response.countries[0],
          )
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof BackendUnavailableError) {
          const available = [...data.countries].sort((a, b) => a.localeCompare(b))
          setCountries(available)
          setBackendOffline(true)
          if (available.length)
            setCountry((previous) => (available.includes(previous) ? previous : available[0]))
          else setCountryError('The competition data export contains no country records.')
        } else
          setCountryError(error instanceof Error ? error.message : 'Country list is unavailable.')
        setLoadingCountry(false)
      })
    return () => {
      active = false
    }
  }, [retry, data])

  useEffect(() => {
    if (!country) return
    let active = true
    setLoadingCountry(true)
    setCountryError('')
    setProfile(null)
    setMix(null)
    setObservedPrediction(null)
    setPredictionMessage('Checking specialist model…')
    setCustomPrediction(null)
    setCustomMessage('')
    if (backendOffline) {
      const local = localCountryProfile(data, country)
      if (local) {
        setProfile(local)
        setMix(mixFromProfile(local))
        setPredictionMessage(
          'Final CO₂ prediction model is unavailable while the backend is offline.',
        )
      } else setCountryError('This country is unavailable in the competition data export.')
      setLoadingCountry(false)
      return () => {
        active = false
      }
    }
    getCountryEnergyCO2(country)
      .then(async (record) => {
        if (!active) return
        setProfile(record)
        setMix(mixFromProfile(record))
        setLoadingCountry(false)
        try {
          const response = await predictCO2(mixFromProfile(record))
          if (!active) return
          if (response.status === 'success') {
            setObservedPrediction(response)
            setPredictionMessage('')
          } else setPredictionMessage(response.message)
        } catch (error) {
          if (active)
            setPredictionMessage(
              error instanceof Error ? error.message : 'CO₂ prediction is unavailable.',
            )
        }
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof BackendUnavailableError) {
          const local = localCountryProfile(data, country)
          if (local) {
            setProfile(local)
            setMix(mixFromProfile(local))
            setBackendOffline(true)
            setPredictionMessage(
              'Final CO₂ prediction model is unavailable while the backend is offline.',
            )
          } else setCountryError('This country is unavailable in the competition data export.')
        } else
          setCountryError(error instanceof Error ? error.message : 'Country data is unavailable.')
        setLoadingCountry(false)
      })
    return () => {
      active = false
    }
  }, [country, retry, backendOffline, data])

  const total = mix ? sources.reduce((sum, { key }) => sum + mix[key], 0) : 0
  const valid =
    !!mix &&
    sources.every(({ key }) => Number.isFinite(mix[key]) && mix[key] >= 0 && mix[key] <= 100) &&
    Math.abs(total - 100) <= 0.5
  function changeMix(key: keyof EnergyMix, raw: string) {
    setMix((previous) =>
      previous ? rebalanceEnergyMix(previous, key, raw === '' ? 0 : Number(raw)) : previous,
    )
    setCustomPrediction(null)
    setCustomMessage('')
  }
  async function runCustomPrediction() {
    if (!mix || !valid || backendOffline) return
    setLoadingPrediction(true)
    setCustomPrediction(null)
    setCustomMessage('')
    try {
      const response = await predictCO2(mix)
      if (response.status === 'success') setCustomPrediction(response)
      else setCustomMessage(response.message)
    } catch (error) {
      setCustomMessage(error instanceof Error ? error.message : 'Prediction is unavailable.')
    } finally {
      setLoadingPrediction(false)
    }
  }

  const energyBars = profile
    ? sources.map(({ key, label }) => ({ name: label, value: profile.energy_mix[key] }))
    : []
  const firstEnergy = profile?.history.energy_mix[0]
  const renewChange =
    profile && firstEnergy
      ? profile.energy_mix.renewables_total_pct - firstEnergy.renewables_total_pct
      : undefined
  const observedDifference =
    profile && observedPrediction
      ? observedPrediction.co2_per_capita_t - profile.co2.co2_per_capita_t
      : undefined
  const customDifference =
    profile && customPrediction
      ? customPrediction.co2_per_capita_t - profile.co2.co2_per_capita_t
      : undefined
  const customRelation =
    customDifference === undefined || !profile
      ? ''
      : customDifference === 0
        ? `This matches ${profile.country}'s observed ${profile.latest_year} value.`
        : `This is ${fmt(Math.abs(customDifference), 2)} tonnes ${customDifference > 0 ? 'higher' : 'lower'} than ${profile.country}'s observed ${profile.latest_year} value of ${fmt(profile.co2.co2_per_capita_t, 2)} tonnes per person.`

  return (
    <>
      <div className="v2-page-head">
        <div>
          <span className="v2-eyebrow">Emissions and power</span>
          <h1>CO₂ &amp; Energy</h1>
          <p>
            See how a country&apos;s observed energy mix relates to its CO₂ emissions, then test a
            different mix with the specialist model.
          </p>
        </div>
        <div className="v2-controls">
          <label className="v2-select">
            <span>Country</span>
            <select
              aria-label="Country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={!countries.length}
            >
              {countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {countryError && (
        <div className="v2-error" role="alert">
          {countryError}
          <div>
            <button className="co2-retry" onClick={() => setRetry((value) => value + 1)}>
              Retry loading country data
            </button>
          </div>
        </div>
      )}
      {!countryError && loadingCountry && (
        <div className="v2-loading" role="status">
          Loading observed country data…
        </div>
      )}
      {backendOffline && profile && !countryError && (
        <div className="v2-live-status" role="status">
          <strong>Observed data available</strong>
          <span>
            Using the existing export generated from the competition CSVs. Live model predictions
            need the FastAPI backend.
          </span>
          <button className="co2-retry" onClick={() => setRetry((value) => value + 1)}>
            Reconnect backend
          </button>
        </div>
      )}
      {profile && !countryError && (
        <>
          <div className="v2-intro">
            <strong>Observed vs predicted</strong>
            <span>
              Observed values come from the competition CSVs. A model estimate appears only when the
              final CO₂ specialist is connected.
            </span>
          </div>
          <div className="v2-kpi-grid">
            <Kpi
              label="CO₂ per Person"
              value={`${fmt(profile.co2.co2_per_capita_t, 2)} t/person`}
              detail={`Observed emissions per resident in ${profile.latest_year} · co2_emissions_yearly.csv`}
            />
            <Kpi
              label="Renewable Energy"
              value={`${fmt(profile.energy_mix.renewables_total_pct)}%`}
              detail={`Observed ${profile.latest_year} energy share · energy_mix_yearly.csv`}
            />
            <Kpi
              label="Fossil Fuels"
              value={`${fmt(profile.energy_mix.fossil_total_pct)}%`}
              detail={`Observed ${profile.latest_year} energy share · energy_mix_yearly.csv`}
            />
            <Kpi
              label="Model-Predicted CO₂ per Person"
              value={
                observedPrediction
                  ? `${fmt(observedPrediction.co2_per_capita_t, 2)} t/person`
                  : 'Awaiting model'
              }
              detail="Specialist model estimate from the latest observed energy mix"
            />
          </div>
          <div className="v2-live-status" role="status">
            <strong>CO₂ specialist</strong>
            <span>
              {observedPrediction
                ? `Connected: ${observedPrediction.model.name}`
                : predictionMessage}
            </span>
          </div>
          <div className="v2-explain v2-neutral">
            <strong>What does this mean?</strong>
            <p>
              In {profile.latest_year}, {profile.country} emitted{' '}
              {fmt(profile.co2.co2_per_capita_t, 2)} tonnes of CO₂ per person. Renewables supplied{' '}
              {fmt(profile.energy_mix.renewables_total_pct)}% of its recorded energy mix
              {renewChange === undefined
                ? '.'
                : `, ${renewChange >= 0 ? 'up' : 'down'} ${fmt(Math.abs(renewChange))} percentage points since ${firstEnergy?.year}.`}{' '}
              These observed relationships do not establish causality.
            </p>
          </div>
          <div className="v2-two">
            <section className="v2-card v2-chart-card">
              <h2>What powers {profile.country}?</h2>
              <p className="v2-subtitle">
                {profile.latest_year} observed energy mix · share of total energy ·
                energy_mix_yearly.csv
              </p>
              <div className="v2-chart v2-chart-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={energyBars}
                    layout="vertical"
                    margin={{ top: 5, right: 12, bottom: 5, left: 25 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#e8edef" />
                    <XAxis type="number" unit="%" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => `${fmt(Number(value))}%`} />
                    <Bar
                      dataKey="value"
                      name="Observed share"
                      fill="#389176"
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="v2-card v2-chart-card">
              <h2>How has {profile.country}&apos;s CO₂ changed?</h2>
              <p className="v2-subtitle">
                Observed emissions, {profile.history.co2[0]?.year}–{profile.latest_year} · million
                tonnes CO₂ · co2_emissions_yearly.csv
              </p>
              <div className="v2-chart v2-chart-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profile.history.co2}>
                    <CartesianGrid vertical={false} stroke="#e8edef" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis width={50} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: any) => `${fmt(Number(value))} Mt CO₂`} />
                    <Area
                      dataKey="co2_emissions_mt"
                      name="Observed CO₂ emissions"
                      stroke="#287d62"
                      fill="#dcefe6"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
          {observedDifference !== undefined && (
            <div className="v2-mini-summary">
              <span>
                <strong>Observed {profile.latest_year}:</strong>{' '}
                {fmt(profile.co2.co2_per_capita_t, 2)} t/person
              </span>
              <span>
                <strong>Model estimate:</strong> {fmt(observedPrediction?.co2_per_capita_t, 2)}{' '}
                t/person
              </span>
              <span>
                <strong>Difference:</strong> {fmt(observedDifference, 2)} t/person
              </span>
              <small>
                One country-year comparison; this is not the model&apos;s overall accuracy.
              </small>
            </div>
          )}
          <div className="v2-section-heading">
            <h2>Try a Different Energy Mix</h2>
            <p>
              Change the energy shares and see what the trained model predicts for CO₂ emissions per
              person. This is not a 2030 forecast.
            </p>
          </div>
          <section className="v2-card plan-card">
            <div className="plan-heading">
              <div>
                <h2>Your energy mix</h2>
                <p>
                  Starting values are {profile.country}&apos;s observed {profile.latest_year}{' '}
                  shares. Changing one share adjusts the others to keep 100%. The model predicts
                  only when you click Predict CO₂.
                </p>
              </div>
              <span className="plan-year">Source: energy_mix_yearly.csv</span>
            </div>
            <div className="plan-grid">
              {mix &&
                sources.map(({ key, label }) => (
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
                Total Energy Mix: {fmt(total)}% · target 100%
              </span>
              <div className="plan-action-buttons">
                <button
                  type="button"
                  className="plan-secondary"
                  onClick={() => {
                    if (mix) setMix(balanceEnergyMix(mix))
                    setCustomPrediction(null)
                    setCustomMessage('')
                  }}
                >
                  Balance to 100%
                </button>
                <button
                  type="button"
                  className="plan-secondary"
                  onClick={() => {
                    setMix(mixFromProfile(profile))
                    setCustomPrediction(null)
                    setCustomMessage('')
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={runCustomPrediction}
                  disabled={!valid || loadingPrediction || backendOffline}
                >
                  {loadingPrediction ? 'Predicting…' : 'Predict CO₂'}
                </button>
              </div>
            </div>
            {!valid && (
              <p className="plan-feedback" role="status">
                Adjust the energy shares until the total is approximately 100%.
              </p>
            )}
            {customMessage && (
              <p className="plan-feedback" role="status">
                {customMessage}
              </p>
            )}
          </section>
          <Q3CountryStatus country={profile.country} compact />
          {customPrediction && (
            <div className="v2-explain v2-neutral">
              <strong>Your energy mix · model prediction</strong>
              <p>
                Using your selected energy mix, the CO₂ specialist predicts{' '}
                {fmt(customPrediction.co2_per_capita_t, 2)} tonnes of CO₂ per person.{' '}
                {customRelation} This is a model estimate for the chosen mix, not a 2030 forecast.
              </p>
              <small>Source: CO₂ Specialist Model + your energy mix.</small>
            </div>
          )}
          <details className="v2-details">
            <summary>View model details</summary>
            <div className="v2-detail-body">
              {observedPrediction ? (
                <p>
                  {observedPrediction.model.name} predicts CO₂ per person from the energy mix. R²:{' '}
                  {fmt(observedPrediction.model.r2, 3)}; RMSE:{' '}
                  {fmt(observedPrediction.model.rmse, 3)} tonnes per person. Full validation details
                  belong on Model Results.
                </p>
              ) : (
                <p>
                  Final model name, input feature order, R² and RMSE will appear once the trained
                  specialist model is connected.
                </p>
              )}
              <p>Observed source files: co2_emissions_yearly.csv and energy_mix_yearly.csv.</p>
            </div>
          </details>
        </>
      )}
    </>
  )
}
