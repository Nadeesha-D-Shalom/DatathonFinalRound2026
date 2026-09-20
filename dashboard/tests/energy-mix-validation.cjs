const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../lib/calculations/energy-mix.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const sandbox = { exports: {} }
vm.runInNewContext(compiled, sandbox)
const { rebalanceEnergyMix, balanceEnergyMix, energyKeys } = sandbox.exports
const initial = { coal_pct: 0.52, oil_pct: 43.39, gas_pct: 46.2, nuclear_pct: 0, hydro_pct: 0, solar_pct: 3, wind_pct: 4, other_renewables_pct: 2.89 }
const total = mix => energyKeys.reduce((sum, key) => sum + mix[key], 0)

for (const value of [0, 0.52, 15, 55.2, 100, 120, -10]) {
  const result = rebalanceEnergyMix(initial, 'solar_pct', value)
  assert.equal(Math.round(total(result) * 100), 10000)
  assert.equal(result.solar_pct, Math.max(0, Math.min(100, value)))
  for (const key of energyKeys) assert.ok(result[key] >= 0 && result[key] <= 100, key)
}
const invalid = { ...initial, nuclear_pct: 53.8, hydro_pct: 47, solar_pct: 55.2, wind_pct: 49.6, other_renewables_pct: 62.7 }
assert.equal(Math.round(total(balanceEnergyMix(invalid)) * 100), 10000)
assert.equal(Math.round(total(rebalanceEnergyMix(invalid, 'coal_pct', 10)) * 100), 10000)
assert.equal(Math.round(total(rebalanceEnergyMix(Object.fromEntries(energyKeys.map(key => [key, 0])), 'coal_pct', 50)) * 100), 10000)
console.log('Energy mix balancing checks passed')
