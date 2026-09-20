import type { EnergyMix } from '@/lib/api/client'

export const energyKeys: (keyof EnergyMix)[] = [
  'coal_pct', 'oil_pct', 'gas_pct', 'nuclear_pct', 'hydro_pct',
  'solar_pct', 'wind_pct', 'other_renewables_pct',
]

const cents = (value: number) => Math.round(value * 100)

/** Keep the edited share; distribute the remaining percentage across other sources. */
export function rebalanceEnergyMix(current: EnergyMix, edited: keyof EnergyMix, input: number): EnergyMix {
  if (!Number.isFinite(input)) return current
  const editedCents = Math.max(0, Math.min(10000, cents(input)))
  const remainingCents = 10000 - editedCents
  const others = energyKeys.filter(key => key !== edited)
  const weights = others.map(key => Number.isFinite(current[key]) ? Math.max(0, current[key]) : 0)
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const fallbackWeight = weightTotal === 0
  const divisor = fallbackWeight ? others.length : weightTotal
  const anchor = weights.indexOf(Math.max(...weights))
  const output = { ...current, [edited]: editedCents / 100 }
  let assigned = 0
  others.forEach((key, index) => {
    if (index === anchor) return
    const weight = fallbackWeight ? 1 : weights[index]
    const share = Math.max(0, Math.min(remainingCents - assigned, Math.round(remainingCents * weight / divisor)))
    output[key] = share / 100
    assigned += share
  })
  output[others[anchor]] = (remainingCents - assigned) / 100
  return output
}

/** Repair an already invalid draft without privileging an energy source. */
export function balanceEnergyMix(current: EnergyMix): EnergyMix {
  const weights = energyKeys.map(key => Number.isFinite(current[key]) ? Math.max(0, current[key]) : 0)
  const total = weights.reduce((sum, value) => sum + value, 0)
  if (total === 0) return current
  const output = { ...current }
  let assigned = 0
  energyKeys.slice(0, -1).forEach((key, index) => {
    const share = Math.max(0, Math.min(10000 - assigned, Math.round(10000 * weights[index] / total)))
    output[key] = share / 100
    assigned += share
  })
  output.other_renewables_pct = (10000 - assigned) / 100
  return output
}
