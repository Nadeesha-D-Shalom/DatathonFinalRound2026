import { containsPhrase, normalizeText } from './normalize'
import type { AssistantContext, DashboardData, EnergySource, ScenarioName } from './types'

const marketAliases: Record<string, string[]> = {
  EU_ETS: ['eu ets', 'european ets', 'european carbon', 'eu carbon', 'europe carbon'],
  UK_ETS: ['uk ets', 'british ets', 'uk carbon', 'british carbon'],
  China_ETS: ['china ets', 'chinese ets', 'china carbon', 'chinese carbon'],
  California: ['california', 'california carbon', 'california market'],
  RGGI: ['rggi', 'regional greenhouse gas initiative'],
}
const sourceAliases: [EnergySource, string[]][] = [
  ['other_renewables', ['other renewables', 'other renewable']],
  ['renewables_total', ['renewable', 'renewables']],
  ['fossil_total', ['fossil']],
  ['coal', ['coal']],
  ['oil', ['oil', 'petroleum']],
  ['gas', ['gas', 'natural gas']],
  ['nuclear', ['nuclear']],
  ['hydro', ['hydro', 'hydropower']],
  ['solar', ['solar']],
  ['wind', ['wind']],
]
export function extractEntities(text: string, data: DashboardData, context: AssistantContext) {
  const countries = data.countries
    .filter((name) => containsPhrase(text, normalizeText(name)))
    .sort((a, b) => b.length - a.length)
  const countryList = countries.filter(
    (name, i) =>
      !countries
        .slice(0, i)
        .some(
          (long) =>
            normalizeText(long).includes(normalizeText(name)) &&
            normalizeText(long) !== normalizeText(name),
        ),
  )
  const markets = data.markets.filter((name) =>
    [normalizeText(name.replaceAll('_', ' ')), ...(marketAliases[name] || [])].some((alias) =>
      containsPhrase(text, alias),
    ),
  )
  const regions = data.regions.filter(
    (name) =>
      containsPhrase(text, normalizeText(name)) &&
      !countryList.some((country) => normalizeText(country) === normalizeText(name)),
  )
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)]
    .map((m) => Number(m[0]))
    .filter((y) => y >= 1900 && y <= 2100)
  let scenario: ScenarioName | undefined
  if (/\b(accelerated|rapid|fast|aggressive)\b/.test(text)) scenario = 'Accelerated Transition'
  else if (/\b(moderate|medium|middle)\b/.test(text)) scenario = 'Moderate Transition'
  else if (/\b(bau|baseline|status quo)\b/.test(text)) scenario = 'Business-as-Usual'
  const source = sourceAliases.find(([, aliases]) =>
    aliases.some((alias) => containsPhrase(text, alias)),
  )?.[0]
  const eventTypes = [
    ...new Set(data.events.map((e) => normalizeText(e.event_type.replaceAll('_', ' ')))),
  ]
  const eventType = eventTypes.find((e) => containsPhrase(text, e))
  const compare =
    /\b(compare|which|more|less|most|least|highest|lowest|bigger|smaller|better|worse|ranking|rank)\b/.test(
      text,
    ) ||
    countryList.length > 1 ||
    markets.length > 1
  const rank: 'most' | 'least' | undefined = /\b(most|highest|largest|biggest|top)\b/.test(text)
    ? 'most'
    : /\b(least|lowest|smallest|bottom)\b/.test(text)
      ? 'least'
      : undefined
  const resolvedCountries = countryList.length
    ? countryList
    : /\b(what about|how about|and|their|them|those|both|it|its)\b/.test(text)
      ? context.activeCountries || ([context.activeCountry].filter(Boolean) as string[])
      : []
  const resolvedMarkets = markets.length
    ? markets
    : /\b(what about|how about|and|it|its)\b/.test(text) && context.activeMarket
      ? [context.activeMarket]
      : []
  return {
    countries: resolvedCountries,
    markets: resolvedMarkets,
    regions,
    years,
    scenario:
      scenario ||
      (/\b(what about|how about|and|it|its)\b/.test(text) ? context.activeScenario : undefined),
    source,
    eventType,
    compare,
    rank,
  }
}
