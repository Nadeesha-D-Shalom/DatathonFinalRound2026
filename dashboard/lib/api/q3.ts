import { request } from './client'

export type Q3Scenario = 'BAU' | 'Moderate' | 'Accelerated'
export type Q3AnnualPoint = { year: number; co2_per_capita_t: number; annual_rate: number }
export type Q3Scenarios = {
  status: 'success'
  country: string
  unit: string
  forecast_type: string
  source: string
  scenario_method: Record<Q3Scenario, string>
  scenarios: Record<Q3Scenario, Q3AnnualPoint[]>
}
export type Q3Unavailable = {
  status: 'scenario_not_available' | 'country_not_found' | 'invalid_q3_data'
  country?: string
  message: string
}
export type Q3Transition = {
  status: 'success'
  country: string
  region: string
  trajectory: Q3Scenario
  transition_score: number
  renewable_change_pp: number
  fossil_change_pp: number
  co2_change: number
  renewable_2000: number
  renewable_2026: number
  fossil_2000: number
  fossil_2026: number
  co2_2000: number
  co2_2026: number
}
export type Q3Summary = {
  status: 'success'
  launch_year: number
  forecast_end_year: number
  archetype_counts: Record<Q3Scenario, number>
  scenario_method: Record<Q3Scenario, string>
  representative_countries: string[]
  interpretation: string
}
export const getQ3Summary = () => request<Q3Summary | Q3Unavailable>('/api/q3/summary')
export const getGlobalTransitionTrends = () =>
  request<{
    status: 'success'
    trends: { year: number; avg_renewables: number; avg_fossil: number; avg_co2_pc: number }[]
  }>('/api/q3/global-trends')
export const getArchetypes = () =>
  request<{
    status: 'success'
    archetypes: {
      trajectory: Q3Scenario
      countries: number
      avg_renewable_change_pp: number
      avg_fossil_change_pp: number
      avg_co2_change: number
    }[]
    countries: Q3Transition[]
  }>('/api/q3/archetypes')
export const getCountryTransition = (country: string) =>
  request<Q3Transition | Q3Unavailable>(
    `/api/q3/countries/${encodeURIComponent(country)}/transition`,
  )
export const getScenarioCountries = () =>
  request<{ status: 'success'; countries: string[] }>('/api/q3/scenario-countries')
export const getCountryScenarios = (country: string) =>
  request<Q3Scenarios | Q3Unavailable>(`/api/q3/countries/${encodeURIComponent(country)}/scenarios`)
export const getCountry2030Summary = (country: string) =>
  request<
    | {
        status: 'success'
        country: string
        year: 2030
        BAU: number
        Moderate: number
        Accelerated: number
      }
    | Q3Unavailable
  >(`/api/q3/countries/${encodeURIComponent(country)}/2030`)
