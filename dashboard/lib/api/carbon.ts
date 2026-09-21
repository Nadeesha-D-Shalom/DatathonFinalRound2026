import { request } from './client'
export const getCarbonResults = () => request<{
  status: string; model: string; source: string
  model_comparison: Record<string, string>[]; rolling_summary: Record<string, string>[]
  true_30step: Record<string, string>[]
}>('/api/carbon/model-results')
