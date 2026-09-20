const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')

function load(relative, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const sandbox = { exports: {}, ...globals }
  vm.runInNewContext(compiled, sandbox)
  return sandbox.exports
}

const { buildTotalEmissionsChart, buildPerCapitaChart } = load('lib/scenario/chart-data.ts')
const paths = Object.fromEntries(
  ['Business-as-Usual', 'Moderate Transition', 'Accelerated Transition'].map((name) => [
    name,
    {
      forecast: [2026, 2027, 2028, 2029, 2030].map((year) => ({
        year,
        co2_emissions_mt: year - 1900,
      })),
    },
  ]),
)
const rows = [{ year: 2026, co2_emissions_mt: 100 }]
assert.equal(
  buildTotalEmissionsChart(rows, paths, null).find((row) => row.year === 2028).plan,
  undefined,
)

const mix = {
  coal_pct: 15,
  oil_pct: 10,
  gas_pct: 20,
  nuclear_pct: 10,
  hydro_pct: 5,
  solar_pct: 20,
  wind_pct: 15,
  other_renewables_pct: 5,
}
const result = {
  status: 'success',
  country: 'Egypt',
  target_year: 2028,
  baseline: { label: 'Current Trend', energy_mix: mix, co2_per_capita_t: 8 },
  user_scenario: {
    label: 'Your Energy Plan',
    energy_mix: mix,
    co2_per_capita_t: 6,
    co2_emissions_mt: 111,
  },
  comparison: {
    baseline: 8,
    scenario: 6,
    difference: -2,
    reduction: 2,
    reduction_percent: 25,
    direction: 'decrease',
  },
  model: { name: 'test adapter', r2: 0.5, rmse: 1 },
}
let chart = buildTotalEmissionsChart(rows, paths, result)
assert.equal(chart.find((row) => row.year === 2028).plan, 111)
assert.equal(chart.find((row) => row.year === 2029).plan, undefined)
assert.equal(chart.find((row) => row.year === 2028).current, 128)
let perCapita = buildPerCapitaChart(result)
assert.equal(perCapita.find((row) => row.year === 2028).plan, 6)
assert.equal(perCapita.find((row) => row.year === 2030).plan, undefined)

const annualResult = structuredClone(result)
annualResult.user_scenario.co2_emissions_mt = undefined
annualResult.user_scenario.yearly_forecast = [2027, 2028, 2029, 2030].map((year) => ({
  year,
  co2_per_capita_t: year - 2020,
  co2_emissions_mt: year - 1900,
}))
chart = buildTotalEmissionsChart(rows, paths, annualResult)
assert.equal(chart.find((row) => row.year === 2029).plan, 129)
assert.equal(buildPerCapitaChart(annualResult).find((row) => row.year === 2030).plan, 10)

const requests = []
const { compareScenario } = load('lib/api/client.ts', {
  process: { env: { NEXT_PUBLIC_API_BASE_URL: 'http://test.local' } },
  fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return {
      ok: true,
      json: async () => ({ status: 'model_not_connected', message: 'Awaiting model' }),
    }
  },
})
;(async () => {
  await compareScenario('Egypt', mix, 2028)
  await compareScenario('Egypt', { ...mix, wind_pct: 30, solar_pct: 5 }, 2028)
  await compareScenario('Egypt', { ...mix, gas_pct: 25, solar_pct: 15 }, 2030)
  assert.equal(requests[0].body.country, 'Egypt')
  assert.equal(requests[0].body.target_year, 2028)
  assert.deepEqual(Object.keys(requests[0].body.energy_mix).sort(), Object.keys(mix).sort())
  assert.equal(requests[0].body.energy_mix.wind_pct, 15)
  assert.equal(requests[1].body.energy_mix.wind_pct, 30)
  assert.equal(requests[2].body.target_year, 2030)
  assert.equal(requests[2].body.energy_mix.gas_pct, 25)
  assert.equal(requests[1].url, 'http://test.local/api/scenario/compare')
  console.log('Scenario request and chart mapping checks passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
