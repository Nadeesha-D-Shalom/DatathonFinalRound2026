import { request, type EnergyMix } from './client'

export type CO2Summary = {
  status: 'success'
  summary: {
    model: string
    target: string
    validation: { r2: number; rmse: number; mae: number }
    test: { r2: number; rmse: number; mae: number }
    data_split: { train: string; validation: string; test: string }
    features: string[]
  }
  final_test_result: Record<string, string>
}
export type CO2Feature = { feature: string; importance: number }
export type CO2Comparison = { model: string; r2: number; rmse: number; mae: number }
export type CO2TestPrediction = {
  year: number
  iso3: string
  country: string
  region: string
  co2_per_capita_t: number
  predicted_co2_per_capita_t: number
  absolute_error: number
}

export const getCO2ModelSummary = () => request<CO2Summary>('/api/co2/model-summary')
export const getCO2FeatureImportance = () =>
  request<{ status: 'success'; features: CO2Feature[] }>('/api/co2/feature-importance')
export const getCO2ModelComparison = () =>
  request<{ status: 'success'; models: CO2Comparison[] }>('/api/co2/model-comparison')
export const getCO2TestPredictions = () =>
  request<{ status: 'success'; period: string; predictions: CO2TestPrediction[] }>(
    '/api/co2/test-predictions',
  )
export { predictCO2 } from './client'
export type { EnergyMix }
