import { request, type CountryEnergyCO2, type CO2PredictionSuccess, type CarbonAnalysisOutlook } from './client'
import type { Q3Transition } from './q3'
import type { Q2Summary } from './q2'
import type { ClimateEvent } from '@/lib/assistant/types'

type State = { status: 'unavailable'; message?: string }
export type Brief = {
  status: 'success'; observed: CountryEnergyCO2; transition: Q3Transition | State
  scenario: { status: 'success'; country: string; BAU: number; Moderate: number; Accelerated: number } | State
  co2_estimate: CO2PredictionSuccess | State; q2: Q2Summary | State; outlook: CarbonAnalysisOutlook | State
  events: ClimateEvent[]; temperature: { year_month: string; temp_anomaly_c: number }
}
export const getBrief = (country: string, market: string) =>
  request<Brief | State>(`/api/brief/${encodeURIComponent(country)}?market=${encodeURIComponent(market)}`)
