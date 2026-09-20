import { absoluteChange, formatNumber as f, percentChange, signed } from './calculations'
import { parseQuestion } from './parser'
import type {
  AssistantAnswer,
  AssistantContext,
  CarbonMarket,
  CountryYear,
  DashboardData,
  EnergySource,
  ParsedQuestion,
  ScenarioName,
} from './types'

const sourceLabel: Record<EnergySource, string> = {
  coal: 'Coal',
  oil: 'Oil',
  gas: 'Gas',
  nuclear: 'Nuclear',
  hydro: 'Hydro',
  solar: 'Solar',
  wind: 'Wind',
  other_renewables: 'Other renewables',
  renewables_total: 'Renewables',
  fossil_total: 'Fossil fuels',
}
const sourceKey = (source: EnergySource) => `${source}_pct` as keyof CountryYear
const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? 'Unavailable' : `${f(v, d)}%`
const mt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? 'Unavailable' : `${f(v, d)} Mt CO₂`
const tonnes = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? 'Unavailable' : `${f(v, d)} t CO₂/person`
const answer = (
  intent: AssistantAnswer['intent'],
  title: string,
  summary: string,
  source: string,
  rest: Partial<AssistantAnswer> = {},
): AssistantAnswer => ({ intent, title, summary, source, context: {}, ...rest })
const latestCountry = (data: DashboardData, country: string, year?: number) =>
  data.countriesData
    .filter((x) => x.country === country && (year === undefined || x.year === year))
    .sort((a, b) => b.year - a.year)[0]
const firstCountry = (data: DashboardData, country: string) =>
  data.countriesData.filter((x) => x.country === country).sort((a, b) => a.year - b.year)[0]
const scenarioEnd = (data: DashboardData, country: string, scenario: ScenarioName) =>
  data.scenarios[country]?.[scenario]?.forecast.at(-1)?.co2_emissions_mt
const marketLabel = (name: string) => name.replaceAll('_', ' ')
const marketSource = 'carbon_prices_daily.csv + Carbon Forecast Model'

function countryOverview(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const country = p.countries[0]
  if (!country)
    return answer(
      'clarify',
      'Choose a country',
      'Which country would you like to explore? The assistant reads available country names from the competition datasets.',
      'co2_emissions_yearly.csv + energy_mix_yearly.csv',
      { suggestions: data.countries.slice(0, 4) },
    )
  const row = latestCountry(
    data,
    country,
    p.years.find((y) => y <= data.summary.latestYear),
  )
  const first = firstCountry(data, country)
  if (!row)
    return answer(
      'country_overview',
      `${country} data unavailable`,
      `There is no country record for ${p.years[0]}. Try another year from the supplied dataset.`,
      'co2_emissions_yearly.csv + energy_mix_yearly.csv',
    )
  const archetype = data.archetypes.find((x) => x.country === country)
  const metrics = [
    { label: 'CO₂ emissions', value: mt(row.co2_emissions_mt) },
    { label: 'CO₂ per capita', value: tonnes(row.co2_per_capita_t) },
    { label: 'CO₂ intensity', value: `${f(row.co2_intensity_kg_per_gdp_usd, 3)} kg / GDP USD` },
    { label: 'Renewables', value: pct(row.renewables_total_pct) },
    { label: 'Fossil fuels', value: pct(row.fossil_total_pct) },
    { label: 'Transition pattern', value: archetype?.category || 'Unavailable' },
  ]
  const energy: { label: string; value: string }[] = (Object.keys(sourceLabel) as EnergySource[])
    .filter((x) => !['renewables_total', 'fossil_total'].includes(x))
    .map((x) => ({ label: sourceLabel[x], value: pct(Number(row[sourceKey(x)])) }))
  const change = first ? absoluteChange(first.co2_emissions_mt, row.co2_emissions_mt) : null
  const scenarioRows = data.scenarios[country]
    ? (
        ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition'] as ScenarioName[]
      ).map((name) => [name, mt(scenarioEnd(data, country, name))])
    : []
  return answer(
    'country_overview',
    `${country} climate and energy profile`,
    `${country} is in ${row.region}. In ${row.year}, it recorded ${mt(row.co2_emissions_mt)} and ${tonnes(row.co2_per_capita_t)}. ${first && first.year !== row.year ? `Emissions changed by ${signed(change)} Mt CO₂ from ${first.year} to ${row.year}.` : ''}`,
    'co2_emissions_yearly.csv + energy_mix_yearly.csv + empirical scenario outputs',
    {
      metrics: [...metrics, ...energy],
      table: scenarioRows.length
        ? { columns: ['2030 pathway', 'Projected emissions'], rows: scenarioRows }
        : undefined,
      caveat:
        '2030 figures are empirical analogue projections. Energy-share assumptions are shown in the Scenario Lab; they are not causal inputs to the emissions formula.',
    },
  )
}
function carbonForecast(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const market = p.markets[0]
  if (!market)
    return answer(
      'clarify',
      'Select a carbon market',
      'Which market should I forecast? Available markets are ' +
        data.markets.map(marketLabel).join(', ') +
        '.',
      marketSource,
      { suggestions: data.markets.map((m) => `Forecast ${marketLabel(m)}`) },
    )
  const m = data.carbon[market]
  const end = m.forecast.at(-1)
  if (!end)
    return answer(
      'carbon_price_forecast',
      `${marketLabel(market)} forecast unavailable`,
      'No validated forecast output is available for this market.',
      marketSource,
    )
  const change = absoluteChange(m.latest, end.price)
  const move = percentChange(m.latest, end.price)
  return answer(
    'carbon_price_forecast',
    `${marketLabel(market)} carbon price forecast`,
    `${marketLabel(market)} last traded at ${f(m.latest, 2)} ${m.currency} on ${m.latestDate}. The 30th trading-day estimate is ${f(end.price, 2)} ${m.currency}, ${change === null ? 'with unavailable change' : `${change >= 0 ? 'up' : 'down'} ${f(Math.abs(change), 2)} ${m.currency} (${signed(move, 1)}%)`}.`,
    marketSource,
    {
      metrics: [
        {
          label: 'Latest observed',
          value: `${f(m.latest, 2)} ${m.currency}`,
          detail: m.latestDate,
        },
        { label: '30th trading day', value: `${f(end.price, 2)} ${m.currency}`, detail: end.date },
        {
          label: 'Expected movement',
          value: `${signed(move, 1)}%`,
          detail: `${signed(change, 2)} ${m.currency}`,
        },
        { label: 'Approximate band', value: `${f(end.lower, 2)}–${f(end.upper, 2)} ${m.currency}` },
        { label: 'Held-out RMSE', value: `${f(m.model.rmse, 3)} ${m.currency}` },
        { label: 'Held-out MAPE', value: pct(m.model.mape, 2) },
      ],
      bullets: [
        `Model: ${m.model.name}.`,
        `Training: ${m.model.train}; testing: ${m.model.test}.`,
        `Forecast horizon: ${m.model.horizon} trading days.`,
      ],
      chart: {
        kind: 'line',
        title: 'Observed and forecast closing prices',
        unit: m.currency,
        points: [
          ...m.history.slice(-15).map((x) => ({ label: x.date, value: x.price })),
          ...m.forecast
            .filter((_, i) => i % 5 === 4 || i === 29)
            .map((x) => ({ label: x.date, value: x.price })),
        ],
      },
      caveat: m.model.interval,
    },
  )
}
function carbonCurrent(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const names = p.markets.length ? p.markets : data.markets
  const rows = names.map((name) => {
    const m = data.carbon[name]
    return [
      marketLabel(name),
      `${f(m.latest, 2)} ${m.currency}`,
      m.latestDate,
      m.volatility === null ? 'Unavailable' : pct(m.volatility, 2),
    ]
  })
  return answer(
    'carbon_price_current',
    p.markets.length === 1
      ? `${marketLabel(names[0])} latest carbon price`
      : 'Latest carbon market prices',
    p.markets.length === 1
      ? `${marketLabel(names[0])} closed at ${rows[0][1]} on ${rows[0][2]}. The recent 30-observation return volatility was ${rows[0][3]}.`
      : 'These latest observed prices are in their own market currencies and should not be compared as a common unit.',
    'carbon_prices_daily.csv',
    { table: { columns: ['Market', 'Latest price', 'Date', '30-observation volatility'], rows } },
  )
}
function carbonHistory(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const market = p.markets[0]
  if (!market)
    return answer(
      'clarify',
      'Choose a carbon market',
      'Which market history should I inspect? ' + data.markets.map(marketLabel).join(', ') + '.',
      'carbon_prices_daily.csv',
    )
  const m = data.carbon[market]
  const year = p.years.find((y) => y <= 2026)
  const annual = year ? m.annual.find((x) => x.year === year) : m.annual.at(-1)
  if (!annual)
    return answer(
      'carbon_price_history',
      `${marketLabel(market)} history unavailable`,
      `The supplied ${marketLabel(market)} records do not cover ${year}. Available annual records run from ${m.annual[0]?.year} to ${m.annual.at(-1)?.year}.`,
      'carbon_prices_daily.csv',
    )
  const move = percentChange(annual.first, annual.last)
  return answer(
    'carbon_price_history',
    `${marketLabel(market)} price history · ${annual.year}`,
    `Across ${annual.count} observations in ${annual.year}, the price moved from ${f(annual.first, 2)} to ${f(annual.last, 2)} ${m.currency} (${signed(move, 1)}%). The low was ${f(annual.min, 2)} and the high was ${f(annual.max, 2)} ${m.currency}.`,
    'carbon_prices_daily.csv',
    {
      metrics: [
        { label: 'Start', value: `${f(annual.first, 2)} ${m.currency}` },
        { label: 'End', value: `${f(annual.last, 2)} ${m.currency}` },
        { label: 'Year low', value: `${f(annual.min, 2)} ${m.currency}` },
        { label: 'Year high', value: `${f(annual.max, 2)} ${m.currency}` },
        { label: 'Annual mean', value: `${f(annual.mean, 2)} ${m.currency}` },
      ],
      chart: {
        kind: 'line',
        title: 'Annual closing price',
        unit: m.currency,
        points: m.annual.map((x) => ({ label: String(x.year), value: x.last })),
      },
    },
  )
}
function carbonComparison(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const year = p.years.find((y) => y <= 2026)
  const markets = p.markets.length ? p.markets : data.markets
  const rows = markets
    .map((name) => {
      const m = data.carbon[name]
      const annual = year ? m.annual.find((x) => x.year === year) : m.annual.at(-1)
      return annual
        ? {
            name,
            start: annual.first,
            end: annual.last,
            change: percentChange(annual.first, annual.last),
            currency: m.currency,
            year: annual.year,
          }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  if (!rows.length)
    return answer(
      'carbon_market_comparison',
      'No comparable market observations',
      `No selected markets have observations for ${year}.`,
      'carbon_prices_daily.csv',
    )
  const ordered = [...rows].sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
  const top = ordered[0]
  return answer(
    'carbon_market_comparison',
    `Carbon market movement · ${year || rows[0].year}`,
    `${marketLabel(top.name)} had the largest absolute percentage movement in the selected period: ${signed(top.change, 1)}%. Percentage moves allow a cross-currency comparison; raw prices do not.`,
    'carbon_prices_daily.csv',
    {
      table: {
        columns: ['Market', 'Start', 'End', 'Change'],
        rows: ordered.map((x) => [
          marketLabel(x.name),
          `${f(x.start, 2)} ${x.currency}`,
          `${f(x.end, 2)} ${x.currency}`,
          `${signed(x.change, 1)}%`,
        ]),
      },
      chart: {
        kind: 'bar',
        title: 'Observed price change',
        unit: '%',
        points: ordered.map((x) => ({ label: marketLabel(x.name), value: x.change || 0 })),
      },
    },
  )
}
function carbonVolatility(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const names = p.markets.length ? p.markets : data.markets
  const rows = names
    .map((name) => ({ name, value: data.carbon[name].volatility }))
    .filter((x): x is { name: string; value: number } => x.value !== null)
  const top = [...rows].sort((a, b) => b.value - a.value)[0]
  return answer(
    'carbon_market_volatility',
    p.markets.length === 1 ? `${marketLabel(names[0])} volatility` : 'Carbon market volatility',
    p.markets.length === 1
      ? `${marketLabel(names[0])} has ${pct(rows[0]?.value, 2)} rolling 30-observation volatility in daily percentage returns.`
      : `${top ? marketLabel(top.name) : 'No market'} has the highest current rolling volatility among the supplied markets (${pct(top?.value, 2)}).`,
    'carbon_prices_daily.csv',
    {
      table: {
        columns: ['Market', 'Rolling volatility'],
        rows: rows.map((x) => [marketLabel(x.name), pct(x.value, 2)]),
      },
      chart: {
        kind: 'bar',
        title: 'Rolling return volatility',
        unit: '%',
        points: rows.map((x) => ({ label: marketLabel(x.name), value: x.value })),
      },
    },
  )
}
function eventAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  if (p.intent === 'climate_event_price_impact') {
    const q2 = data.q2Summary
    if (q2) {
      const e = q2.experiment
      const change = e.comparison.rmse_improvement_percent
      return answer(
        'climate_event_price_impact',
        'Q2 climate event feature experiment',
        `Across ${e.markets.length} supplied markets, Ridge plus event features changed held-out RMSE from ${f(e.baseline.rmse, 4)} to ${f(e.event_aware.rmse, 4)}, an improvement of ${f(change, 4)}%. MAPE moved from ${pct(e.baseline.mape, 3)} to ${pct(e.event_aware.mape, 3)}. The RMSE improvement was marginal; this does not establish event causality.`,
        'Q2 analysis: carbon_prices_daily.csv + climate_events.csv',
        {
          metrics: [
            { label: 'Baseline RMSE', value: f(e.baseline.rmse, 4) },
            { label: 'Event-aware RMSE', value: f(e.event_aware.rmse, 4) },
            { label: 'RMSE improvement', value: pct(change, 4) },
            { label: 'Baseline MAPE', value: pct(e.baseline.mape, 3) },
            { label: 'Event-aware MAPE', value: pct(e.event_aware.mape, 3) },
          ],
          bullets: [q2.conclusion, `Included markets: ${e.markets.join(', ')}.`],
          caveat:
            'The reported RMSE pools quoted prices across markets with different currencies; the experiment tests predictive value, not causality.',
        },
      )
    }
    const e = data.eventExperiment
    const direction = e.improvementPct > 0 ? 'improved' : 'worsened'
    return answer(
      'climate_event_price_impact',
      'Did climate events improve carbon prediction?',
      `For ${marketLabel(e.market)}, the event-aware model ${direction} held-out RMSE by ${f(Math.abs(e.improvementPct), 2)}%. Baseline RMSE was ${f(e.baseline.rmse, 3)}; event-aware RMSE was ${f(e.eventAware.rmse, 3)}. This tests predictive value, not whether events caused price changes.`,
      'Previous EU ETS analysis export from climate_events.csv + carbon_prices_daily.csv',
      {
        metrics: [
          { label: 'Baseline RMSE', value: f(e.baseline.rmse, 3) },
          { label: 'Event-aware RMSE', value: f(e.eventAware.rmse, 3) },
          { label: 'RMSE improvement', value: `${signed(e.improvementPct, 2)}%` },
          { label: 'Baseline MAPE', value: pct(e.baseline.mape, 2) },
          { label: 'Event-aware MAPE', value: pct(e.eventAware.mape, 2) },
        ],
        bullets: [
          `Training: ${e.train}; testing: ${e.test}.`,
          `Event features: ${e.features.join(', ')}.`,
          e.scope,
        ],
        caveat:
          'This is the previous EU ETS export. Open Climate Events for the final Q2 experiment when the backend is available.',
      },
    )
  }
  const year = p.years.find((y) => y <= 2026)
  let events = data.events.filter(
    (e) =>
      (!year || Number(e.date.slice(0, 4)) === year) &&
      (!p.regions.length || p.regions.some((r) => r.toLowerCase() === e.region.toLowerCase())) &&
      (!p.eventType || e.event_type.toLowerCase().replaceAll('_', ' ') === p.eventType) &&
      (!/\bpolicy\b/.test(p.normalized) || !!e.is_policy) &&
      (!/\b(extreme weather|weather)\b/.test(p.normalized) || !!e.is_extreme_weather) &&
      (!/\bdisaster\b/.test(p.normalized) || !!e.is_disaster),
  )
  if (p.intent === 'climate_event_severity')
    events = events.sort((a, b) => b.severity_score - a.severity_score)
  else events = events.sort((a, b) => b.date.localeCompare(a.date))
  if (!events.length)
    return answer(
      p.intent,
      'No matching climate events',
      `No supplied event records match those filters${year ? ` in ${year}` : ''}. Try another year, type, or region.`,
      'climate_events.csv',
    )
  const first = events[0]
  const title =
    p.intent === 'climate_event_severity'
      ? 'Most severe recorded climate events'
      : year
        ? `Climate events in ${year}`
        : 'Climate event activity'
  return answer(
    p.intent,
    title,
    `${events.length} matching event${events.length === 1 ? '' : 's'} found. ${p.intent === 'climate_event_severity' ? `The highest severity score is ${first.severity_score} for ${first.event_type} in ${first.region} on ${first.date}.` : `Most recent: ${first.event_type} in ${first.region} on ${first.date} (severity ${first.severity_score}).`}`,
    'climate_events.csv',
    {
      metrics: [
        { label: 'Matching events', value: String(events.length) },
        {
          label: 'Highest severity',
          value: String(Math.max(...events.map((x) => x.severity_score))),
        },
      ],
      table: {
        columns: ['Date', 'Region', 'Type', 'Severity', 'Description'],
        rows: events
          .slice(0, 10)
          .map((e) => [e.date, e.region, e.event_type, String(e.severity_score), e.description]),
      },
      caveat:
        'These are the supplied event records, not a complete census of global climate events.',
    },
  )
}
function countryCo2(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const country = p.countries[0]
  if (!country && p.regions.length) {
    const region = p.regions[0],
      year = p.years.find((y) => y <= 2026) || data.summary.latestYear
    const rows = data.countriesData.filter((x) => x.region === region && x.year === year)
    if (!rows.length)
      return answer(
        'country_co2',
        'No regional records',
        `No supplied country emissions records match ${region} in ${year}.`,
        'co2_emissions_yearly.csv',
      )
    const total = rows.reduce((n, x) => n + x.co2_emissions_mt, 0)
    return answer(
      'country_co2',
      `${region} CO₂ emissions · ${year}`,
      `The ${rows.length} supplied countries in ${region} sum to ${mt(total)} in ${year}. This is a panel total, not an official region-wide total.`,
      'co2_emissions_yearly.csv',
      {
        metrics: [
          { label: 'Panel emissions', value: mt(total) },
          { label: 'Countries', value: String(rows.length) },
        ],
      },
    )
  }
  if (!country)
    return answer(
      'clarify',
      'Choose a country',
      'Which country should I use for emissions?',
      'co2_emissions_yearly.csv',
      { suggestions: data.countries.slice(0, 4) },
    )
  const year = p.years.find((y) => y <= 2026),
    row = latestCountry(data, country, year),
    first = firstCountry(data, country)
  if (!row)
    return answer(
      'country_co2',
      `${country} emissions unavailable`,
      `No supplied emissions record exists for ${country} in ${year}.`,
      'co2_emissions_yearly.csv',
    )
  const series = data.countriesData
    .filter((x) => x.country === country)
    .sort((a, b) => a.year - b.year)
  return answer(
    p.intent,
    `${country} CO₂ emissions · ${row.year}`,
    `${country} recorded ${mt(row.co2_emissions_mt)}, or ${tonnes(row.co2_per_capita_t)}, in ${row.year}. ${first && first.year !== row.year ? `Since ${first.year}, total emissions changed by ${signed(absoluteChange(first.co2_emissions_mt, row.co2_emissions_mt))} Mt (${signed(percentChange(first.co2_emissions_mt, row.co2_emissions_mt))}%).` : ''}`,
    'co2_emissions_yearly.csv',
    {
      metrics: [
        { label: 'Total emissions', value: mt(row.co2_emissions_mt) },
        { label: 'Per capita', value: tonnes(row.co2_per_capita_t) },
        { label: 'CO₂ intensity', value: `${f(row.co2_intensity_kg_per_gdp_usd, 3)} kg / GDP USD` },
        { label: 'Population', value: `${f(row.population_millions, 2)} million` },
      ],
      chart: {
        kind: 'line',
        title: 'Observed emissions over time',
        unit: 'Mt CO₂',
        points: series.map((x) => ({ label: String(x.year), value: x.co2_emissions_mt })),
      },
    },
  )
}
function countryComparison(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const countries = p.countries.length ? p.countries : p.context.activeCountries || []
  if (countries.length < 2)
    return answer(
      'clarify',
      'Select two countries',
      'Which countries should I compare? For example, ask “Compare Germany and France.”',
      'co2_emissions_yearly.csv + energy_mix_yearly.csv',
    )
  const year = p.years.find((y) => y <= 2026) || data.summary.latestYear
  const rows = countries
    .map((country) => latestCountry(data, country, year))
    .filter((x): x is CountryYear => !!x)
  if (rows.length < 2)
    return answer(
      'country_co2_comparison',
      'Comparison unavailable',
      `At least one country lacks a ${year} record. Try another year.`,
      'co2_emissions_yearly.csv + energy_mix_yearly.csv',
    )
  const metric = p.source ? sourceKey(p.source) : undefined
  const columns = metric
    ? ['Country', `${sourceLabel[p.source!]} share`]
    : ['Country', 'CO₂ emissions', 'CO₂ per capita', 'Renewables', 'Fossil fuels', 'Transition']
  const table = rows.map((x) =>
    metric
      ? [x.country, pct(Number(x[metric]))]
      : [
          x.country,
          mt(x.co2_emissions_mt),
          tonnes(x.co2_per_capita_t),
          pct(x.renewables_total_pct),
          pct(x.fossil_total_pct),
          data.archetypes.find((a) => a.country === x.country)?.category || 'Unavailable',
        ],
  )
  const key = metric || 'co2_emissions_mt'
  const sorted = [...rows].sort((a, b) => Number(b[key]) - Number(a[key]))
  const unit = metric ? '%' : ' Mt CO₂'
  return answer(
    p.intent,
    `${rows.map((x) => x.country).join(' vs ')} · ${year}`,
    `${sorted[0].country} has the higher ${metric ? sourceLabel[p.source!].toLowerCase() + ' share' : 'total CO₂ emissions'} in ${year}: ${f(Number(sorted[0][key]))}${unit} versus ${f(Number(sorted.at(-1)![key]))}${unit} for ${sorted.at(-1)!.country}. ${!metric ? 'The table also shows per-capita emissions and energy transition indicators.' : ''}`,
    'co2_emissions_yearly.csv + energy_mix_yearly.csv + transition archetypes',
    {
      table: { columns, rows: table },
      chart: {
        kind: 'bar',
        title: metric ? `${sourceLabel[p.source!]} share` : 'Total emissions',
        unit,
        points: rows.map((x) => ({ label: x.country, value: Number(x[key]) })),
      },
    },
  )
}
function energyAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const source = p.source || 'renewables_total'
  const key = sourceKey(source)
  const year = p.years.find((y) => y <= 2026) || data.summary.latestYear
  if (p.countries.length > 1 || (p.compare && p.countries.length > 0))
    return countryComparison(data, { ...p, intent: 'energy_source_comparison', source })
  if (p.rank && !p.countries.length) {
    const changeQuery =
      /\b(reduced|decreased|declined|increased|grew|growth|changed|change|since)\b/.test(
        p.normalized,
      )
    if (changeQuery) {
      const rows = data.countriesData
        .filter((x) => x.year === year)
        .map((row) => {
          const first = firstCountry(data, row.country)
          return first
            ? {
                country: row.country,
                firstYear: first.year,
                change: Number(row[key]) - Number(first[key]),
              }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
      const reduction = /\b(reduced|decreased|declined)\b/.test(p.normalized)
      rows.sort((a, b) => (reduction ? a.change - b.change : b.change - a.change))
      const selected = p.rank === 'most' ? rows[0] : rows.at(-1)
      if (!selected)
        return answer(
          'energy_mix',
          'Energy data unavailable',
          `No records are available for ${year}.`,
          'energy_mix_yearly.csv',
        )
      return answer(
        p.intent,
        `${sourceLabel[source]} share change ranking`,
        `${selected.country} has the ${p.rank === 'most' ? 'largest' : 'smallest'} ${reduction ? 'reduction' : 'increase'} in ${sourceLabel[source].toLowerCase()} share among supplied countries: ${signed(selected.change)} percentage points from ${selected.firstYear} to ${year}.`,
        'energy_mix_yearly.csv',
        {
          table: {
            columns: ['Country', 'Share change'],
            rows: (p.rank === 'most' ? rows.slice(0, 8) : rows.slice(-8).reverse()).map((x) => [
              x.country,
              `${signed(x.change)} pp`,
            ]),
          },
          caveat:
            'Countries may have different first available years; the table uses each country’s first observed year.',
        },
      )
    }
    const rows = data.countriesData
      .filter((x) => x.year === year)
      .sort((a, b) => Number(b[key]) - Number(a[key]))
    const row = p.rank === 'most' ? rows[0] : rows.at(-1)
    if (!row)
      return answer(
        'energy_mix',
        'Energy data unavailable',
        `No records are available for ${year}.`,
        'energy_mix_yearly.csv',
      )
    return answer(
      p.intent,
      `${sourceLabel[source]} ranking · ${year}`,
      `${row.country} has the ${p.rank === 'most' ? 'highest' : 'lowest'} ${sourceLabel[source].toLowerCase()} share in the supplied ${year} country panel: ${pct(Number(row[key]))}.`,
      'energy_mix_yearly.csv',
      {
        table: {
          columns: ['Country', `${sourceLabel[source]} share`],
          rows: (p.rank === 'most' ? rows.slice(0, 8) : rows.slice(-8).reverse()).map((x) => [
            x.country,
            pct(Number(x[key])),
          ]),
        },
      },
    )
  }
  const country = p.countries[0]
  if (
    !country &&
    (p.regions.length || /\b(global|worldwide|across countries)\b/.test(p.normalized))
  ) {
    const region = p.regions[0]
    const rows = data.countriesData.filter(
      (x) => x.year === year && (!region || x.region === region),
    )
    if (!rows.length)
      return answer(
        'energy_mix',
        'Regional energy data unavailable',
        `No supplied country records match ${region || 'the global panel'} in ${year}.`,
        'energy_mix_yearly.csv',
      )
    const average = rows.reduce((n, x) => n + Number(x[key]), 0) / rows.length
    return answer(
      p.intent,
      `${region || 'Supplied-country'} ${sourceLabel[source].toLowerCase()} share · ${year}`,
      `The unweighted average ${sourceLabel[source].toLowerCase()} share across ${rows.length} supplied ${region ? `${region} ` : ''}countries was ${pct(average)} in ${year}.`,
      'energy_mix_yearly.csv',
      {
        metrics: [
          { label: 'Unweighted average', value: pct(average) },
          { label: 'Countries', value: String(rows.length) },
        ],
        caveat:
          'This is an unweighted average of available country energy shares, not a population- or energy-weighted regional total.',
      },
    )
  }
  if (!country)
    return answer(
      'clarify',
      'Choose a country',
      'Which country’s energy mix should I inspect?',
      'energy_mix_yearly.csv',
    )
  const row = latestCountry(data, country, year),
    first = firstCountry(data, country)
  if (!row)
    return answer(
      'energy_mix',
      `${country} energy data unavailable`,
      `No energy-mix record exists for ${country} in ${year}.`,
      'energy_mix_yearly.csv',
    )
  const current = Number(row[key]),
    previous = first ? Number(first[key]) : null
  const all = (Object.keys(sourceLabel) as EnergySource[]).filter(
    (x) => !['renewables_total', 'fossil_total'].includes(x),
  )
  return answer(
    p.intent,
    `${country} ${sourceLabel[source].toLowerCase()} · ${row.year}`,
    `${sourceLabel[source]} accounted for ${pct(current)} of ${country}'s energy mix in ${row.year}. ${previous !== null && first!.year !== row.year ? `That is ${signed(current - previous)} percentage points versus ${first!.year}.` : ''}`,
    'energy_mix_yearly.csv',
    {
      metrics: [
        { label: `${sourceLabel[source]} share`, value: pct(current) },
        { label: 'Renewables total', value: pct(row.renewables_total_pct) },
        { label: 'Fossil total', value: pct(row.fossil_total_pct) },
        ...(previous !== null
          ? [{ label: `Change since ${first!.year}`, value: `${signed(current - previous)} pp` }]
          : []),
      ],
      table:
        p.intent === 'energy_mix'
          ? {
              columns: ['Energy source', 'Share'],
              rows: all.map((x) => [sourceLabel[x], pct(Number(row[sourceKey(x)]))]),
            }
          : undefined,
      chart: {
        kind: 'line',
        title: `${sourceLabel[source]} share over time`,
        unit: '%',
        points: data.countriesData
          .filter((x) => x.country === country)
          .sort((a, b) => a.year - b.year)
          .map((x) => ({ label: String(x.year), value: Number(x[key]) })),
      },
    },
  )
}
function transitionAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const countries = p.countries.length ? p.countries : p.context.activeCountries || []
  if (!countries.length) {
    const counts = ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition'].map(
      (name) => [name, String(data.archetypes.filter((x) => x.category === name).length)],
    )
    return answer(
      'transition_status',
      'Observed transition patterns',
      `The supplied country panel has ${data.archetypes.length} classified pathways. Categories are calculated from first-to-last observed changes in renewable and fossil shares.`,
      'energy_mix_yearly.csv + co2_emissions_yearly.csv + transition rules',
      {
        table: { columns: ['Category', 'Countries'], rows: counts },
        caveat:
          'Accelerated: renewables +15 pp and fossil −10 pp or more. Moderate: renewables +5 pp and fossil decline. Remaining countries: Business-as-Usual.',
      },
    )
  }
  const rows = countries
    .map((country) => data.archetypes.find((x) => x.country === country))
    .filter((x): x is NonNullable<typeof x> => !!x)
  return answer(
    p.intent,
    `${countries.join(' vs ')} transition status`,
    rows
      .map(
        (x) =>
          `${x.country}: ${x.category}, renewables ${signed(x.renewableChange)} pp, fossil share ${signed(x.fossilChange)} pp, and emissions ${signed(x.emissionsChange)} Mt over ${x.firstYear}–${x.lastYear}.`,
      )
      .join(' '),
    'energy_mix_yearly.csv + co2_emissions_yearly.csv + transition rules',
    {
      table: {
        columns: ['Country', 'Category', 'Renewables Δ', 'Fossil Δ', 'Emissions Δ'],
        rows: rows.map((x) => [
          x.country,
          x.category,
          `${signed(x.renewableChange)} pp`,
          `${signed(x.fossilChange)} pp`,
          `${signed(x.emissionsChange)} Mt`,
        ]),
      },
      caveat: 'Categories use documented observed-share thresholds; they do not prove causality.',
    },
  )
}
function scenarioAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const country = p.countries[0]
  if (!country)
    return answer(
      'clarify',
      'Choose a country for 2030',
      'Would you like the 2030 CO₂ forecast for a country and transition scenario? For example, ask about Germany under Accelerated Transition.',
      'Empirical 2030 Scenario Model',
    )
  const scenarios = data.scenarios[country]
  if (!scenarios)
    return answer(
      'emissions_forecast',
      `${country} scenarios unavailable`,
      'No scenario output is available for this country.',
      'Empirical 2030 Scenario Model',
    )
  const scenario = p.scenario || 'Business-as-Usual'
  const selected = scenarios[scenario]
  const base = selected.forecast[0].co2_emissions_mt
  const end = selected.forecast.at(-1)!.co2_emissions_mt
  const bau = scenarios['Business-as-Usual'].forecast.at(-1)!.co2_emissions_mt
  const compare = p.intent === 'scenario_comparison'
  const rows = (
    ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition'] as ScenarioName[]
  ).map((name) => {
    const item = scenarios[name],
      value = item.forecast.at(-1)!.co2_emissions_mt
    return [
      name,
      mt(value),
      `${signed(absoluteChange(base, value))} Mt`,
      `${signed(percentChange(base, value))}%`,
      `${signed(bau - value)} Mt`,
    ]
  })
  return answer(
    p.intent,
    compare ? `${country} 2030 scenario comparison` : `${country} · ${scenario} to 2030`,
    compare
      ? `Starting from ${mt(base)} observed in 2026, the three empirical pathways lead to the 2030 values below. The differences reflect observed analogue growth rates, not causal effects of changing an energy share.`
      : `Under ${scenario}, ${country} moves from ${mt(base)} in 2026 to ${mt(end)} in 2030 (${signed(percentChange(base, end))}%). Compared with BAU, the 2030 projection is ${f(Math.abs(bau - end))} Mt ${bau - end >= 0 ? 'lower' : 'higher'}.`,
    'co2_emissions_yearly.csv + energy_mix_yearly.csv + Empirical 2030 Scenario Model',
    {
      metrics: [
        { label: '2026 observed', value: mt(base) },
        { label: '2030 projected', value: mt(end) },
        { label: 'Change vs 2026', value: `${signed(absoluteChange(base, end))} Mt` },
        {
          label: 'Difference vs BAU',
          value: `${signed(bau - end)} Mt`,
          detail: 'Positive means lower than BAU',
        },
        { label: 'Annual emissions rate', value: pct(selected.assumptions.emissionsGrowthPct, 3) },
        {
          label: 'Annual renewable change',
          value: `${signed(selected.assumptions.renewablePpPerYear, 3)} pp`,
        },
        {
          label: 'Annual fossil change',
          value: `${signed(selected.assumptions.fossilPpPerYear, 3)} pp`,
        },
      ],
      table: compare
        ? {
            columns: [
              'Pathway',
              '2030 emissions',
              'Change vs 2026',
              'Change %',
              'BAU minus scenario',
            ],
            rows,
          }
        : undefined,
      chart: {
        kind: 'line',
        title: '2026–2030 projected emissions',
        unit: 'Mt CO₂',
        points: selected.forecast.map((x) => ({
          label: String(x.year),
          value: x.co2_emissions_mt,
        })),
      },
      caveat: data.scenarioMethod,
    },
  )
}
function modelAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const question = p.normalized
  const event = /\b(event|policy|weather|disaster)\b/.test(question)
  const carbon = /\b(carbon price|carbon market|ets|rggi)\b/.test(question) || p.markets.length > 0
  const co2 = /\b(co2|emissions|energy mix|driver|per capita)\b/.test(question)
  if (event) return eventAnswer(data, { ...p, intent: 'climate_event_price_impact' })
  if (carbon) {
    const market = p.markets[0] || data.markets[0],
      m = data.carbon[market]
    return answer(
      'model_performance',
      `${marketLabel(market)} carbon forecast model`,
      `${m.model.name} predicts daily prices from ${m.model.features.join(', ')}. It was trained on ${m.model.train} and tested on ${m.model.test}; held-out RMSE was ${f(m.model.rmse, 3)} ${m.currency} and MAPE ${pct(m.model.mape, 2)}.`,
      'Carbon Forecast Model trained from carbon_prices_daily.csv',
      {
        metrics: [
          { label: 'RMSE', value: `${f(m.model.rmse, 3)} ${m.currency}` },
          { label: 'MAPE', value: pct(m.model.mape, 2) },
          { label: 'Horizon', value: `${m.model.horizon} trading days` },
        ],
        caveat: m.model.interval,
      },
    )
  }
  const m = data.co2Model
  if (
    p.intent === 'feature_importance' ||
    /\b(feature|driver|important|influential)\b/.test(question)
  ) {
    const ranking = [...m.importance].sort((a, b) => b.value - a.value)
    return answer(
      'feature_importance',
      'CO₂ model feature importance',
      `The highest random-forest importance is ${ranking[0].feature} at ${pct(ranking[0].value * 100, 1)}. These importances measure predictive split contribution, not causal effect.`,
      'CO₂ Regression Model trained from energy_mix_yearly.csv + co2_emissions_yearly.csv',
      {
        table: {
          columns: ['Feature', 'Importance'],
          rows: ranking.map((x) => [x.feature, pct(x.value * 100, 1)]),
        },
        chart: {
          kind: 'bar',
          title: 'Relative feature importance',
          unit: '%',
          points: ranking.map((x) => ({
            label: x.feature.replace('_pct', ''),
            value: x.value * 100,
          })),
        },
      },
    )
  }
  if (co2)
    return answer(
      'model_performance',
      'CO₂ per capita prediction model',
      `${m.algorithm} predicts ${m.target} using ${m.features.join(', ')}. Training covered ${m.train}; testing covered ${m.test}. Held-out R² was ${f(m.r2, 3)} and RMSE was ${f(m.rmse, 3)} t CO₂/person.`,
      'CO₂ Regression Model trained from energy_mix_yearly.csv + co2_emissions_yearly.csv',
      {
        metrics: [
          { label: 'R²', value: f(m.r2, 3) },
          { label: 'RMSE', value: `${f(m.rmse, 3)} t/person` },
          { label: 'Features', value: String(m.features.length) },
        ],
        caveat: 'Predictive association does not establish causal energy effects.',
      },
    )
  return answer(
    p.intent,
    'Model performance overview',
    `The carbon model uses market-specific random forest autoregression. The CO₂ regression has held-out R² ${f(m.r2, 3)} and RMSE ${f(m.rmse, 3)} t/person. ${data.q2Summary ? `The Q2 Ridge event experiment improved pooled RMSE by ${f(data.q2Summary.experiment.comparison.rmse_improvement_percent, 4)}%.` : `The previous EU ETS event export changed RMSE by ${signed(data.eventExperiment.improvementPct, 2)}%.`}`,
    'Carbon Forecast Model + CO₂ Regression Model + Event Feature Experiment',
    {
      table: {
        columns: ['Model', 'Validated metric', 'Method'],
        rows: [
          ...data.markets.map((name) => [
            `${marketLabel(name)} carbon forecast`,
            `RMSE ${f(data.carbon[name].model.rmse, 3)}; MAPE ${pct(data.carbon[name].model.mape, 2)}`,
            'Chronological 80/20 holdout',
          ]),
          [
            'CO₂ per capita',
            `R² ${f(m.r2, 3)}; RMSE ${f(m.rmse, 3)}`,
            'Train 2000–2020; test 2021–2026',
          ],
          data.q2Summary
            ? [
                'Q2 Ridge + event features',
                `RMSE ${f(data.q2Summary.experiment.event_aware.rmse, 4)}`,
                'Same Ridge approach plus event features',
              ]
            : [
                'Previous EU ETS event export',
                `RMSE ${f(data.eventExperiment.eventAware.rmse, 3)}`,
                'Previous analysis export',
              ],
        ],
      },
      caveat:
        'Metrics have different targets and units; comparing their numerical magnitudes does not identify a universally better model.',
    },
  )
}
function datasetAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const match = data.quality.find(
    (x) =>
      p.normalized.includes(x.name.replace('.csv', '').replaceAll('_', ' ')) ||
      p.normalized.includes(x.name),
  )
  const rows = (match ? [match] : data.quality).map((x) => [
    x.name,
    x.rows.toLocaleString(),
    String(x.columns),
    x.missing.toLocaleString(),
    `${x.start}–${x.end}`,
    x.countries === null ? '—' : String(x.countries),
    x.markets === null ? '—' : String(x.markets),
  ])
  return answer(
    p.intent,
    match ? `${match.name} coverage` : 'Competition dataset coverage',
    `The assistant uses only the five supplied datasets and locally generated model outputs. ${match ? `${match.name} contains ${match.rows.toLocaleString()} rows and ${match.columns} columns.` : `Together, the source files cover ${data.summary.countryCount} countries, ${data.markets.length} carbon markets and ${data.summary.eventCount} recorded climate events.`}`,
    'Dataset inventory generated from the five competition CSVs',
    {
      table: {
        columns: ['Dataset', 'Rows', 'Columns', 'Missing cells', 'Range', 'Countries', 'Markets'],
        rows,
      },
      caveat:
        'Missing-cell counts are measured from the original CSVs; model outputs are generated only from those files.',
    },
  )
}
function generalAnswer(data: DashboardData, p: ParsedQuestion): AssistantAnswer {
  const eu = data.carbon.EU_ETS
  const change = percentChange(eu.latest, eu.forecast.at(-1)!.price)
  const event = data.eventExperiment
  const co2 = data.co2Model
  return answer(
    p.intent,
    p.intent === 'key_insights' ? 'Key climate intelligence findings' : 'Monsoon Mandate summary',
    `The supplied panel covers ${data.summary.countryCount} countries, ${data.markets.length} carbon markets and ${data.summary.eventCount} recorded events through ${data.summary.latestYear}. EU ETS is forecast ${signed(change, 1)}% over 30 trading days. ${data.q2Summary ? `The Q2 Ridge event experiment improved pooled RMSE by ${f(data.q2Summary.experiment.comparison.rmse_improvement_percent, 4)}%.` : `The previous EU ETS event export ${event.improvementPct >= 0 ? 'improved' : 'worsened'} RMSE by ${f(Math.abs(event.improvementPct), 2)}%.`} The CO₂ regression held-out R² is ${f(co2.r2, 3)}.`,
    'Five competition CSVs + locally generated model outputs',
    {
      metrics: [
        { label: 'Countries', value: String(data.summary.countryCount) },
        { label: 'Markets', value: String(data.markets.length) },
        { label: 'Climate events', value: String(data.summary.eventCount) },
        { label: 'EU ETS 30-day change', value: `${signed(change, 1)}%` },
      ],
      bullets: [
        'Ask about a market forecast, country emissions, energy mix, recorded events or 2030 scenarios.',
        'Every quantitative answer comes from a source record, deterministic calculation or locally generated model output.',
      ],
      caveat: 'Forecasts and scenarios are projections, not observed facts.',
    },
  )
}
function nextContext(p: ParsedQuestion): AssistantContext {
  return {
    ...p.context,
    activeCountry: p.countries.length === 1 ? p.countries[0] : p.context.activeCountry,
    activeCountries: p.countries.length > 1 ? p.countries : p.context.activeCountries,
    activeMarket: p.markets[0] || p.context.activeMarket,
    activeMetric: p.source || p.context.activeMetric,
    activeScenario: p.scenario || p.context.activeScenario,
    activeYear: p.years.at(-1) || p.context.activeYear,
    activeIntent: p.intent,
  }
}
export function answerQuestion(
  question: string,
  data: DashboardData,
  context: AssistantContext = {},
): AssistantAnswer {
  const p = parseQuestion(question, data, context)
  let result: AssistantAnswer
  switch (p.intent) {
    case 'carbon_price_forecast':
      result = carbonForecast(data, p)
      break
    case 'carbon_price_current':
      result = carbonCurrent(data, p)
      break
    case 'carbon_price_history':
      result = carbonHistory(data, p)
      break
    case 'carbon_market_comparison':
      result = carbonComparison(data, p)
      break
    case 'carbon_market_volatility':
      result = carbonVolatility(data, p)
      break
    case 'climate_event_search':
    case 'climate_event_summary':
    case 'climate_event_severity':
    case 'climate_event_price_impact':
      result = eventAnswer(data, p)
      break
    case 'country_overview':
      result = countryOverview(data, p)
      break
    case 'country_co2':
    case 'country_co2_history':
    case 'co2_per_capita':
      result = countryCo2(data, p)
      break
    case 'country_co2_comparison':
    case 'energy_source_comparison':
      result = countryComparison(data, p)
      break
    case 'energy_mix':
    case 'renewable_share':
    case 'fossil_share':
      result = energyAnswer(data, p)
      break
    case 'transition_status':
    case 'transition_comparison':
      result = transitionAnswer(data, p)
      break
    case 'emissions_forecast':
    case 'scenario_comparison':
    case 'avoided_emissions':
      result = scenarioAnswer(data, p)
      break
    case 'co2_prediction':
    case 'model_performance':
    case 'model_comparison':
    case 'feature_importance':
      result = modelAnswer(data, p)
      break
    case 'dataset_information':
    case 'data_coverage':
      result = datasetAnswer(data, p)
      break
    case 'general_summary':
    case 'key_insights':
      result = generalAnswer(data, p)
      break
    case 'clarify':
      result = answer(
        'clarify',
        'Clarify the analysis',
        'Would you like a 2030 CO₂ forecast for a country, a comparison of the three transition scenarios, or information about the 2030 model?',
        'Empirical 2030 Scenario Model',
      )
      break
    default:
      result = answer(
        'unknown',
        'Outside the available data',
        'I don’t have that information in the provided Datathon datasets. I can help with carbon markets, recorded climate events, CO₂ emissions, energy mix, country comparisons, model performance and 2030 scenarios.',
        'Five supplied competition CSVs + locally generated outputs',
      )
  }
  result.context = nextContext({
    ...p,
    intent:
      result.intent === 'clarify' || result.intent === 'unknown'
        ? p.context.activeIntent || result.intent
        : result.intent,
  })
  return result
}
