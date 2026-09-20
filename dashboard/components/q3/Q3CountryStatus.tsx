'use client'
import { useEffect, useState } from 'react'
import { getCountry2030Summary, getCountryTransition, type Q3Transition } from '@/lib/api/q3'

const fmt = (value: number, digits = 2) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })

export default function Q3CountryStatus({
  country,
  compact = false,
}: {
  country: string
  compact?: boolean
}) {
  const [transition, setTransition] = useState<Q3Transition | null>(null)
  const [forecast, setForecast] = useState<{
    BAU: number
    Moderate: number
    Accelerated: number
  } | null>(null)
  const [message, setMessage] = useState('Loading Q3 transition analysis…')
  useEffect(() => {
    let active = true
    setTransition(null)
    setForecast(null)
    setMessage('Loading Q3 transition analysis…')
    Promise.all([getCountryTransition(country), getCountry2030Summary(country)])
      .then(([status, scenario]) => {
        if (!active) return
        if (status.status === 'success') {
          setTransition(status)
          setMessage('')
        } else setMessage(status.message)
        if (scenario.status === 'success') setForecast(scenario)
        else if (status.status === 'success')
          setMessage('2030 scenario output not available in validated Q3 package for this country.')
      })
      .catch(() => {
        if (active)
          setMessage('Q3 service unavailable. Restart FastAPI to load transition results.')
      })
    return () => {
      active = false
    }
  }, [country])
  return (
    <section className="v2-card">
      <h2>Transition status</h2>
      <p className="v2-subtitle">Q3 transition analysis · observed change from 2000 to 2026</p>
      {transition ? (
        <>
          <div className="v2-technical-kpis">
            <div>
              <span>Archetype</span>
              <strong>{transition.trajectory}</strong>
            </div>
            <div>
              <span>Transition score</span>
              <strong>{fmt(transition.transition_score)}</strong>
            </div>
            <div>
              <span>Renewable share</span>
              <strong>{fmt(transition.renewable_change_pp)} points</strong>
            </div>
            <div>
              <span>Fossil share</span>
              <strong>{fmt(transition.fossil_change_pp)} points</strong>
            </div>
            <div>
              <span>CO₂ per person</span>
              <strong>{fmt(transition.co2_change)} t/person</strong>
            </div>
          </div>
          {forecast && !compact && (
            <>
              <h3>2030 conditional scenarios</h3>
              <div className="v2-technical-kpis">
                <div>
                  <span>Current Trend · BAU</span>
                  <strong>{fmt(forecast.BAU)} t/person</strong>
                </div>
                <div>
                  <span>Moderate</span>
                  <strong>{fmt(forecast.Moderate)} t/person</strong>
                </div>
                <div>
                  <span>Accelerated</span>
                  <strong>{fmt(forecast.Accelerated)} t/person</strong>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
      {message && <p role="status">{message}</p>}
      <small>
        Source: country_transition_archetypes.csv{forecast ? '; co2_scenario_2030_summary.csv' : ''}
        . Conditional pathways are separate from the CO₂ specialist model.
      </small>
    </section>
  )
}
