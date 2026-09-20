export type EnergyMix = {
  coal_pct: number; oil_pct: number; gas_pct: number; nuclear_pct: number
  hydro_pct: number; solar_pct: number; wind_pct: number; other_renewables_pct: number
}

export type ApiState = { status: 'model_not_connected' | 'baseline_not_available' | 'forecast_not_available' | 'year_not_supported' | 'validation_error' | 'prediction_error'; message: string; target_year?: ForecastYear }
export type CarbonForecastSuccess = {
  status: 'success'; market: string; currency: string; last_observed_date: string
  last_observed_price: number; forecast: { date: string; predicted_price: number }[]
  model: { name: string; rmse: number; mape: number }
}
export type CO2PredictionSuccess = { status: 'success'; co2_per_capita_t: number; model: { name: string; r2: number; rmse: number } }
export type CountryEnergyCO2 = {
  status: 'success'; country: string; region: string; latest_year: number
  co2: { co2_emissions_mt: number; co2_per_capita_t: number; co2_intensity_kg_per_gdp_usd: number }
  energy_mix: EnergyMix & { renewables_total_pct: number; fossil_total_pct: number }
  history: {
    co2: { year: number; co2_emissions_mt: number; co2_per_capita_t: number }[]
    energy_mix: { year: number; renewables_total_pct: number; fossil_total_pct: number }[]
  }
  sources: string[]
  origin?: 'backend' | 'local_export'
}
export type ForecastYear = 2027 | 2028 | 2029 | 2030
export type ScenarioSuccess = {
  status: 'success'; country: string; target_year: ForecastYear
  baseline: { label: string; energy_mix: EnergyMix; co2_per_capita_t: number; co2_emissions_mt?: number | null; yearly_forecast?: { year: ForecastYear; co2_per_capita_t: number; co2_emissions_mt?: number | null }[] | null }
  user_scenario: { label: string; energy_mix: EnergyMix; co2_per_capita_t: number; co2_emissions_mt?: number | null; yearly_forecast?: { year: ForecastYear; co2_per_capita_t: number; co2_emissions_mt?: number | null }[] | null }
  comparison: { baseline: number; scenario: number; difference: number; reduction: number; reduction_percent: number; direction: 'increase' | 'decrease' | 'unchanged' }
  model: { name: string; r2: number; rmse: number; features?: string[] | null; train_period?: string | null; test_methodology?: string | null }
}

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export class BackendUnavailableError extends Error {
  constructor() { super('Prediction service is offline. Start the FastAPI backend to enable model predictions.'); this.name = 'BackendUnavailableError' }
}

export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new BackendUnavailableError()
  }
  const result = await response.json().catch(() => null)
  if (!result || typeof result !== 'object') throw new Error('Prediction service returned an unreadable response.')
  if (!response.ok && result.status !== 'validation_error') throw new Error(result.message || 'Prediction request failed.')
  return result as T
}

export const getBackendHealth = () => request<{ status: 'ok'; carbon_model: 'connected' | 'not_connected'; co2_model: 'connected' | 'not_connected' }>('/health')
export const getCarbonForecast = (market: string) => request<CarbonForecastSuccess | ApiState>('/api/carbon/forecast', { market })
export const predictCO2 = (energyMix: EnergyMix) => request<CO2PredictionSuccess | ApiState>('/api/co2/predict', { energy_mix: energyMix })
export const getCountries = () => request<{ status: 'success'; countries: string[] }>('/api/countries')
export const getCountryEnergyCO2 = (country: string) => request<CountryEnergyCO2>(`/api/countries/${encodeURIComponent(country)}/energy-co2`)
export const compareScenario = (country: string, energyMix: EnergyMix, targetYear: ForecastYear = 2030) => request<ScenarioSuccess | ApiState>('/api/scenario/compare', { country, target_year: targetYear, energy_mix: energyMix })
