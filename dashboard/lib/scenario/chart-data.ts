import type { CountryYear, ScenarioName, ScenarioOutput } from '@/lib/assistant/types'
import type { ScenarioSuccess } from '@/lib/api/client'

type Paths = Record<ScenarioName, ScenarioOutput>

export function buildTotalEmissionsChart(rows: CountryYear[], paths: Paths, result: ScenarioSuccess | null) {
  const observed = rows.map(row => ({ year: row.year, observed: row.co2_emissions_mt }))
  const projected = Array.from({ length: 5 }, (_, index) => {
    const year = 2026 + index
    const annualBaseline = result?.baseline.yearly_forecast?.find(point => point.year === year)?.co2_emissions_mt
    const annualPlan = result?.user_scenario.yearly_forecast?.find(point => point.year === year)?.co2_emissions_mt
    return {
      year,
      current: annualBaseline ?? paths['Business-as-Usual']?.forecast[index]?.co2_emissions_mt,
      moderate: paths['Moderate Transition']?.forecast[index]?.co2_emissions_mt,
      fast: paths['Accelerated Transition']?.forecast[index]?.co2_emissions_mt,
      plan: annualPlan ?? (result?.target_year === year ? result.user_scenario.co2_emissions_mt : undefined),
    }
  })
  return [...observed, ...projected]
}

export function buildPerCapitaChart(result: ScenarioSuccess) {
  return ([2027, 2028, 2029, 2030] as const).map(year => ({
    year,
    current: result.baseline.yearly_forecast?.find(point => point.year === year)?.co2_per_capita_t ?? (result.target_year === year ? result.baseline.co2_per_capita_t : undefined),
    plan: result.user_scenario.yearly_forecast?.find(point => point.year === year)?.co2_per_capita_t ?? (result.target_year === year ? result.user_scenario.co2_per_capita_t : undefined),
  }))
}
