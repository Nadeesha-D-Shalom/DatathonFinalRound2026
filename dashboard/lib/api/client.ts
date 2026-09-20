export type EnergyMix = {
  coal_pct: number; oil_pct: number; gas_pct: number; nuclear_pct: number
  hydro_pct: number; solar_pct: number; wind_pct: number; other_renewables_pct: number
}

export type ApiState = { status: 'model_not_connected' | 'baseline_not_available' | 'validation_error' | 'prediction_error'; message: string }
export type CarbonForecastSuccess = {
  status: 'success'; market: string; currency: string; last_observed_date: string
  last_observed_price: number; forecast: { date: string; predicted_price: number }[]
  model: { name: string; rmse: number; mape: number }
}
export type CO2PredictionSuccess = { status: 'success'; co2_per_capita_t: number; model: { name: string; r2: number; rmse: number } }
export type ScenarioSuccess = {
  status: 'success'; country: string; target_year: 2030
  baseline: { label: string; energy_mix: EnergyMix; co2_per_capita_t: number }
  user_scenario: { label: string; energy_mix: EnergyMix; co2_per_capita_t: number }
  comparison: { baseline: number; scenario: number; difference: number; reduction: number; reduction_percent: number; direction: 'increase' | 'decrease' | 'unchanged' }
  model: { name: string; r2: number; rmse: number; features?: string[] | null; train_period?: string | null; test_methodology?: string | null }
}

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new Error('Prediction service is offline. Start the FastAPI backend and try again.')
  }
  const result = await response.json().catch(() => null)
  if (!result || typeof result !== 'object') throw new Error('Prediction service returned an unreadable response.')
  if (!response.ok && result.status !== 'validation_error') throw new Error(result.message || 'Prediction request failed.')
  return result as T
}

export const getBackendHealth = () => request<{ status: 'ok'; carbon_model: 'connected' | 'not_connected'; co2_model: 'connected' | 'not_connected' }>('/health')
export const getCarbonForecast = (market: string) => request<CarbonForecastSuccess | ApiState>('/api/carbon/forecast', { market })
export const predictCO2 = (energyMix: EnergyMix) => request<CO2PredictionSuccess | ApiState>('/api/co2/predict', { energy_mix: energyMix })
export const compareScenario = (country: string, energyMix: EnergyMix) => request<ScenarioSuccess | ApiState>('/api/scenario/compare', { country, target_year: 2030, energy_mix: energyMix })
