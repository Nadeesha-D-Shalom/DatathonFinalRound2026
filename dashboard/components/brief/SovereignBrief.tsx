'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DashboardData } from '@/lib/assistant/types'
import {
  getCountryEnergyCO2,
  getCarbonAnalysisOutlook,
  type CarbonAnalysisOutlook,
  type CountryEnergyCO2,
} from '@/lib/api/client'
import { getCountryTransition, getCountry2030Summary, type Q3Transition } from '@/lib/api/q3'
import { getQ2Summary, type Q2Summary } from '@/lib/api/q2'

type Scenario2030 = {
  status: 'success'
  country: string
  BAU: number
  Moderate: number
  Accelerated: number
}
const fmt = (value: number | undefined, digits = 2) =>
  value === undefined || !Number.isFinite(value)
    ? 'Not available'
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })

function BriefItem({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi-label">{label}</div>
      <div className="v2-kpi-value">{value}</div>
      <p>{source}</p>
    </div>
  )
}

export default function SovereignBrief({ data }: { data: DashboardData }) {
  const [country, setCountry] = useState(
    data.countries.includes('Algeria') ? 'Algeria' : data.countries[0],
  )
  const [market, setMarket] = useState(data.markets.includes('EU_ETS') ? 'EU_ETS' : data.markets[0])
  const [observed, setObserved] = useState<CountryEnergyCO2 | null>(null)
  const [transition, setTransition] = useState<Q3Transition | null>(null)
  const [scenario, setScenario] = useState<Scenario2030 | null>(null)
  const [outlook, setOutlook] = useState<CarbonAnalysisOutlook | null>(null)
  const [q2, setQ2] = useState<Q2Summary | null>(null)
  const [countryError, setCountryError] = useState('')
  const [forecastMessage, setForecastMessage] = useState('Loading validated Q3 pathways…')
  const [outlookMessage, setOutlookMessage] = useState('Loading delivered Q1 outlook…')

  useEffect(() => {
    let active = true
    setObserved(null)
    setTransition(null)
    setScenario(null)
    setCountryError('')
    setForecastMessage('Loading validated Q3 pathways…')
    Promise.allSettled([
      getCountryEnergyCO2(country),
      getCountryTransition(country),
      getCountry2030Summary(country),
    ]).then(([a, b, c]) => {
      if (!active) return
      if (a.status === 'fulfilled' && a.value.status === 'success') setObserved(a.value)
      else
        setCountryError(
          'Observed country data is not available from FastAPI. Start or restart the backend.',
        )
      if (b.status === 'fulfilled' && b.value.status === 'success') setTransition(b.value)
      if (c.status === 'fulfilled' && c.value.status === 'success') {
        setScenario(c.value)
        setForecastMessage('')
      } else
        setForecastMessage('Validated Q3 2030 scenario output is not available for this country.')
    })
    return () => {
      active = false
    }
  }, [country])

  useEffect(() => {
    let active = true
    setOutlook(null)
    setOutlookMessage('Loading delivered Q1 outlook…')
    getCarbonAnalysisOutlook(market)
      .then((value) => {
        if (!active) return
        if (value.status === 'success') {
          setOutlook(value)
          setOutlookMessage('')
        } else setOutlookMessage(value.message)
      })
      .catch(() => {
        if (active)
          setOutlookMessage(
            'ARIMA analysis outlook is awaiting integration with the running backend.',
          )
      })
    return () => {
      active = false
    }
  }, [market])

  useEffect(() => {
    getQ2Summary()
      .then((value) => {
        if (value.status === 'success') setQ2(value)
      })
      .catch(() => setQ2(null))
  }, [])

  const eventContext = useMemo(
    () =>
      data.events
        .filter(
          (event) =>
            event.region.toLowerCase() === country.toLowerCase() ||
            (observed && event.region.toLowerCase() === observed.region.toLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3),
    [data.events, country, observed],
  )
  const latestTemperature = data.temperature.at(-1)
  const difference = scenario ? scenario.BAU - scenario.Accelerated : undefined
  const reductionPercent =
    scenario && scenario.BAU > 0 ? (difference! / scenario.BAU) * 100 : undefined

  return (
    <>
      <div className="v2-page-head">
        <div>
          <span className="v2-eyebrow">Decision brief · supplied data</span>
          <h1>Mandate 2030 Sovereign Climate &amp; Energy Brief</h1>
          <p>
            A concise, source-labeled country view for policy and investment decisions. Scenarios
            are conditional, not guaranteed outcomes.
          </p>
        </div>
        <div className="v2-controls">
          <label className="v2-select">
            <span>Country</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              {data.countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-select">
            <span>Carbon market context</span>
            <select value={market} onChange={(event) => setMarket(event.target.value)}>
              {data.markets.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {countryError && (
        <div className="v2-error" role="alert">
          {countryError}
        </div>
      )}
      <div className="v2-kpi-grid">
        <BriefItem
          label="Transition archetype"
          value={transition?.trajectory ?? 'Awaiting integration'}
          source="Q3 transition analysis"
        />
        <BriefItem
          label="Transition Score"
          value={transition ? fmt(transition.transition_score) : 'Awaiting integration'}
          source="Q3 country transition fingerprints"
        />
        <BriefItem
          label="Renewable share"
          value={observed ? `${fmt(observed.energy_mix.renewables_total_pct)}%` : 'Not available'}
          source={`Observed energy mix${observed ? ` · ${observed.latest_year}` : ''}`}
        />
        <BriefItem
          label="Fossil share"
          value={observed ? `${fmt(observed.energy_mix.fossil_total_pct)}%` : 'Not available'}
          source={`Observed energy mix${observed ? ` · ${observed.latest_year}` : ''}`}
        />
        <BriefItem
          label="CO₂ per person"
          value={observed ? `${fmt(observed.co2.co2_per_capita_t)} t/person` : 'Not available'}
          source={`Observed emissions${observed ? ` · ${observed.latest_year}` : ''}`}
        />
        <BriefItem
          label="Temperature anomaly"
          value={
            latestTemperature ? `${fmt(latestTemperature.temp_anomaly_c)} °C` : 'Not available'
          }
          source={`Global context${latestTemperature ? ` · ${latestTemperature.year_month}` : ''}; not country-specific`}
        />
      </div>
      <div className="v2-two">
        <section className="v2-card">
          <h2>Climate and policy event context</h2>
          <p className="v2-subtitle">
            Exact country or recorded region matches from climate_events.csv
          </p>
          {eventContext.length ? (
            <div className="v2-event-list">
              {eventContext.map((event) => (
                <div key={`${event.date}-${event.description}`}>
                  <span>
                    {event.date} · {event.region} · severity {event.severity_score}
                  </span>
                  <strong>{event.description}</strong>
                  <small>
                    {event.event_type} ·{' '}
                    {event.is_policy
                      ? 'Policy'
                      : event.is_disaster
                        ? 'Disaster'
                        : event.is_extreme_weather
                          ? 'Extreme weather'
                          : 'Climate event'}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p>
              No exact country or region event match in the supplied event file. This does not mean
              no event occurred.
            </p>
          )}
          <p>
            Q2 found only marginal forecast improvement from event features
            {q2
              ? ` (${fmt(q2.experiment.comparison.rmse_improvement_percent, 4)}% lower pooled RMSE)`
              : ''}
            . Events are a contextual alert layer, not the main carbon pricing model. A geographic
            match does not establish price causality.
          </p>
          <small>Source: climate_events.csv; Q2 validated model comparison.</small>
        </section>
        <section className="v2-card">
          <h2>{market.replaceAll('_', ' ')} · 30 trading day carbon outlook</h2>
          <p className="v2-subtitle">
            Market context, separate from the selected country's emissions
          </p>
          {outlook ? (
            <div className="v2-technical-kpis">
              <div>
                <span>Latest observed price</span>
                <strong>
                  {fmt(outlook.last_observed_price)} {outlook.currency}
                </strong>
              </div>
              <div>
                <span>Day 30 outlook</span>
                <strong>
                  {fmt(outlook.forecast_price)} {outlook.currency}
                </strong>
              </div>
              <div>
                <span>Projected change</span>
                <strong>{fmt(outlook.change_percent)}%</strong>
              </div>
              <div>
                <span>Outlook date</span>
                <strong>{outlook.forecast_date}</strong>
              </div>
            </div>
          ) : (
            <p role="status">{outlookMessage}</p>
          )}
          <small>
            {outlook
              ? `${outlook.model} · delivered Q1 analysis export. Live Carbon agent awaits integration. Source: ${outlook.source}.`
              : 'No carbon price value is inferred from country CO₂ or events.'}
          </small>
        </section>
      </div>
      <section className="v2-card">
        <h2>2030 CO₂ per person · conditional Q3 pathways</h2>
        <p className="v2-subtitle">
          BAU continues 2018–2026 CAGR; Moderate subtracts 1.5 percentage points/year; Accelerated
          subtracts 3.5 percentage points/year.
        </p>
        {scenario ? (
          <div className="v2-technical-kpis">
            <div>
              <span>BAU · Current Trend</span>
              <strong>{fmt(scenario.BAU)} t/person</strong>
            </div>
            <div>
              <span>Moderate</span>
              <strong>{fmt(scenario.Moderate)} t/person</strong>
            </div>
            <div>
              <span>Accelerated</span>
              <strong>{fmt(scenario.Accelerated)} t/person</strong>
            </div>
          </div>
        ) : (
          <p role="status">{forecastMessage}</p>
        )}
        <small>
          Source: Q3 co2_scenario_2030_summary.csv. Available only for six validated representative
          countries.
        </small>
      </section>
      <div className="v2-explain v2-neutral">
        <strong>Scenario Insight</strong>
        <p>
          {scenario && difference !== undefined
            ? `For ${country}, the Q3 Accelerated pathway is ${fmt(Math.abs(difference))} t CO₂/person ${difference >= 0 ? 'below' : 'above'} BAU in 2030${reductionPercent === undefined ? '' : ` (${fmt(Math.abs(reductionPercent))}% ${difference >= 0 ? 'lower' : 'higher'})`}. This is a comparison of stated assumptions, not a causal or probability forecast.`
            : `A 2030 scenario insight is not available for ${country} in the validated Q3 package. Its observed indicators and transition classification remain available.`}
        </p>
      </div>
      <p className="v2-subtitle">
        Sources: co2_emissions_yearly.csv · energy_mix_yearly.csv · temperature_anomaly_monthly.csv
        (Global series) · climate_events.csv · validated Q1, Q2 and Q3 analysis exports. No country
        temperature value or unsupported scenario has been inferred.
      </p>
    </>
  )
}
