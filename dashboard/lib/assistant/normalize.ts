const substitutions: [RegExp, string][] = [
  [/co₂|carbon dioxide|carbon emission(s)?/g, ' co2 '],
  [/greenhouse gas(es)?/g, ' co2 '],
  [/renewable energy|clean energy|green energy|renewables/g, ' renewable '],
  [/fossil fuels?|fossil energy/g, ' fossil '],
  [/per person|per head|per-capita/g, ' per capita '],
  [/business as usual|business-as-usual|b\.a\.u\./g, ' bau '],
  [/eu emissions trading system|european carbon market|eu carbon market/g, ' eu ets '],
  [/uk emissions trading system|british carbon market/g, ' uk ets '],
  [/next month|coming month|next 30 days|30 day forecast/g, ' next 30 days '],
  [/predictions?|projections?|outlooks?/g, ' forecast '],
  [/compare|compared with|versus|\bvs\b|difference between/g, ' compare '],
  [/how polluted|pollution from/g, ' emissions '],
  [/climate incidents?|climate shocks?/g, ' climate events '],
  [/\bdisasters\b/g, ' disaster '],
  [/\bscenarios\b/g, ' scenario '],
  [/\bfindings\b/g, ' finding '],
  [/\bprices\b/g, ' price '],
]
export function normalizeText(input: string): string {
  let text = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[‐‑–—]/g, '-')
  for (const [pattern, replacement] of substitutions) text = text.replace(pattern, replacement)
  return text
    .replace(/[^a-z0-9%+\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
export function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(text)
}
