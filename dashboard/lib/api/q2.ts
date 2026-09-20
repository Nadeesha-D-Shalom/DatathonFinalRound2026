import { request } from './client'

export type Q2Metric = { model: string; rmse: number; mae: number; mape: number }
export type Q2Summary = {
  status: 'success'
  experiment: {
    question: string
    model_type: string
    markets: string[]
    baseline: Q2Metric
    event_aware: Q2Metric
    comparison: { rmse_improvement_percent: number; mape_improvement_percent: number; event_window_improvement_percent: number }
  }
  conclusion: string
  source: string[]
}
export type Q2Features = { status: 'success'; metric: string; features: { feature: string; coefficient: number; abs_coefficient: number; description: string }[]; source: string }
export type Q2Window = { status: 'success'; event_window: { rows: number; baseline_rmse: number; event_aware_rmse: number; improvement_percent: number }; source: string }
export type Q2Impact = { status: 'success'; count: number; results: { date: string; market: string; currency: string; price: number; baseline_prediction: number; event_aware_prediction: number; event_active_30d: number }[]; source: string }

export const getQ2Summary = () => request<Q2Summary>('/api/q2/summary')
export const getQ2FeatureImportance = () => request<Q2Features>('/api/q2/feature-importance')
export const getQ2EventWindowAnalysis = () => request<Q2Window>('/api/q2/event-window-analysis')
export const getQ2ImpactResults = () => request<Q2Impact>('/api/q2/impact-results')
