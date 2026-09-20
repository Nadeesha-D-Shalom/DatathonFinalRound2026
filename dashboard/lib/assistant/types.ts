export type ScenarioName = 'Business-as-Usual' | 'Moderate Transition' | 'Accelerated Transition'
export type EnergySource =
  | 'coal'
  | 'oil'
  | 'gas'
  | 'nuclear'
  | 'hydro'
  | 'solar'
  | 'wind'
  | 'other_renewables'
  | 'renewables_total'
  | 'fossil_total'

export interface CountryYear {
  year: number
  country: string
  iso3: string
  region: string
  co2_emissions_mt: number
  population_millions: number
  co2_per_capita_t: number
  co2_intensity_kg_per_gdp_usd: number
  coal_pct: number
  oil_pct: number
  gas_pct: number
  nuclear_pct: number
  hydro_pct: number
  solar_pct: number
  wind_pct: number
  other_renewables_pct: number
  renewables_total_pct: number
  fossil_total_pct: number
}
export interface CarbonPoint {
  date: string
  price: number
  rolling30: number
  volatility30: number | null
}
export interface CarbonForecastPoint {
  date: string
  price: number
  lower: number
  upper: number
}
export interface CarbonMarket {
  currency: string
  history: CarbonPoint[]
  annual: {
    year: number
    first: number
    last: number
    mean: number
    min: number
    max: number
    count: number
  }[]
  latest: number
  latestDate: string
  volatility: number | null
  forecast: CarbonForecastPoint[]
  model: {
    name: string
    features: string[]
    train: string
    test: string
    rmse: number
    mape: number
    horizon: number
    interval: string
  }
}
export interface ClimateEvent {
  date: string
  region: string
  event_type: string
  severity_score: number
  description: string
  is_policy: number
  is_extreme_weather: number
  is_disaster: number
}
export interface ScenarioOutput {
  assumptions: { emissionsGrowthPct: number; renewablePpPerYear: number; fossilPpPerYear: number }
  forecast: { year: number; co2_emissions_mt: number }[]
}
import type { Q2Summary } from '@/lib/api/q2'

export interface DashboardData {
  markets: string[]
  countries: string[]
  regions: string[]
  carbon: Record<string, CarbonMarket>
  events: ClimateEvent[]
  countriesData: CountryYear[]
  temperature: { year_month: string; temp_anomaly_c: number; co2_ppm: number | null }[]
  archetypes: {
    country: string
    renewableChange: number
    fossilChange: number
    emissionsChange: number
    category: string
    firstYear: number
    lastYear: number
  }[]
  scenarios: Record<string, Record<ScenarioName, ScenarioOutput>>
  scenarioMethod: string
  eventExperiment: {
    market: string
    baseline: { rmse: number; mape: number }
    eventAware: { rmse: number; mape: number }
    improvementPct: number
    train: string
    test: string
    features: string[]
    scope: string
  }
  q2Summary?: Q2Summary
  co2Model: {
    algorithm: string
    target: string
    features: string[]
    train: string
    test: string
    r2: number
    rmse: number
    predictions: { actual: number; predicted: number; country: string; year: number }[]
    importance: { feature: string; value: number }[]
  }
  quality: {
    name: string
    rows: number
    columns: number
    missing: number
    start: string
    end: string
    countries: number | null
    markets: number | null
    regions: number | null
  }[]
  summary: {
    carbonRows: number
    eventCount: number
    countryCount: number
    latestYear: number
    globalTemperatureLatest: { year_month: string; temp_anomaly_c: number }
  }
}
export interface AssistantContext {
  activeCountry?: string
  activeCountries?: string[]
  activeMarket?: string
  activeMetric?: string
  activeScenario?: ScenarioName
  activeYear?: number
  activeIntent?: Intent
}
export type Intent =
  | 'carbon_price_current'
  | 'carbon_price_history'
  | 'carbon_price_forecast'
  | 'carbon_market_comparison'
  | 'carbon_market_volatility'
  | 'climate_event_search'
  | 'climate_event_summary'
  | 'climate_event_price_impact'
  | 'climate_event_severity'
  | 'country_overview'
  | 'country_co2'
  | 'country_co2_history'
  | 'country_co2_comparison'
  | 'co2_per_capita'
  | 'co2_prediction'
  | 'energy_mix'
  | 'renewable_share'
  | 'fossil_share'
  | 'energy_source_comparison'
  | 'transition_status'
  | 'transition_comparison'
  | 'emissions_forecast'
  | 'scenario_comparison'
  | 'avoided_emissions'
  | 'model_performance'
  | 'model_comparison'
  | 'feature_importance'
  | 'dataset_information'
  | 'data_coverage'
  | 'general_summary'
  | 'key_insights'
  | 'unknown'
  | 'clarify'
export interface ParsedQuestion {
  original: string
  normalized: string
  intent: Intent
  confidence: number
  countries: string[]
  markets: string[]
  regions: string[]
  years: number[]
  scenario?: ScenarioName
  source?: EnergySource
  eventType?: string
  metric?: string
  compare: boolean
  rank?: 'most' | 'least'
  context: AssistantContext
}
export interface AnswerMetric {
  label: string
  value: string
  detail?: string
}
export interface AnswerTable {
  columns: string[]
  rows: string[][]
}
export interface AnswerChart {
  kind: 'bar' | 'line'
  title: string
  points: { label: string; value: number }[]
  unit: string
}
export interface AssistantAnswer {
  intent: Intent
  title: string
  summary: string
  metrics?: AnswerMetric[]
  bullets?: string[]
  table?: AnswerTable
  chart?: AnswerChart
  source: string
  caveat?: string
  suggestions?: string[]
  context: AssistantContext
}
