import type { DashboardData } from '@/lib/assistant/types'
import type { CountryEnergyCO2 } from './client'

/** Uses the existing build_data.py export, which is generated from the supplied CSVs. */
export function localCountryProfile(data: DashboardData, country: string): CountryEnergyCO2 | null {
  const rows = data.countriesData.filter(row => row.country === country).sort((a, b) => a.year - b.year)
  const latest = rows.at(-1)
  if (!latest) return null
  return {
    status: 'success', country: latest.country, region: latest.region, latest_year: latest.year,
    co2: {
      co2_emissions_mt: latest.co2_emissions_mt,
      co2_per_capita_t: latest.co2_per_capita_t,
      co2_intensity_kg_per_gdp_usd: latest.co2_intensity_kg_per_gdp_usd,
    },
    energy_mix: {
      coal_pct: latest.coal_pct, oil_pct: latest.oil_pct, gas_pct: latest.gas_pct,
      nuclear_pct: latest.nuclear_pct, hydro_pct: latest.hydro_pct,
      solar_pct: latest.solar_pct, wind_pct: latest.wind_pct,
      other_renewables_pct: latest.other_renewables_pct,
      renewables_total_pct: latest.renewables_total_pct, fossil_total_pct: latest.fossil_total_pct,
    },
    history: {
      co2: rows.map(row => ({ year: row.year, co2_emissions_mt: row.co2_emissions_mt, co2_per_capita_t: row.co2_per_capita_t })),
      energy_mix: rows.map(row => ({ year: row.year, renewables_total_pct: row.renewables_total_pct, fossil_total_pct: row.fossil_total_pct })),
    },
    sources: ['co2_emissions_yearly.csv', 'energy_mix_yearly.csv'],
    origin: 'local_export',
  }
}
