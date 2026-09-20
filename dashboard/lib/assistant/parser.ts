import {extractEntities} from './entities'
import {normalizeText} from './normalize'
import type {AssistantContext,DashboardData,Intent,ParsedQuestion} from './types'

const test=(s:string,p:RegExp)=>p.test(s)
export function parseQuestion(question:string,data:DashboardData,context:AssistantContext={}):ParsedQuestion {
  const normalized=normalizeText(question)
  const entities=extractEntities(normalized,data,context)
  const scores=new Map<Intent,number>()
  const add=(intent:Intent,n:number)=>scores.set(intent,(scores.get(intent)||0)+n)
  const hasMarket=entities.markets.length>0
  const hasCountry=entities.countries.length>0
  const hasCarbon=test(normalized,/\b(carbon price|carbon market|allowance|ets|rggi|trading price)\b/) || hasMarket
  const hasEvent=test(normalized,/\b(event|events|policy|weather|disaster|heatwave|flood|storm|wildfire|earthquake|severity)\b/) || !!entities.eventType
  const hasEmission=test(normalized,/\b(co2|emissions?|per capita|intensity)\b/)
  const hasEnergy=test(normalized,/\b(energy|mix|renewable|fossil|coal|oil|gas|solar|wind|hydro|nuclear)\b/) || !!entities.source
  const hasScenario=test(normalized,/\b(2030|scenario|pathway|transition forecast|avoided|reduction vs|under accelerated|under moderate|under bau)\b/) || !!entities.scenario
  const forecast=test(normalized,/\b(forecast|predict|future|next|heading|outlook|expect|will|going to|30 days|tomorrow|might)\b/)
  const history=test(normalized,/\b(history|historical|trend|past|over time|since|between|changed|change|evolution|previous|high|low|peak)\b/)
  const technical=test(normalized,/\b(model|algorithm|accuracy|accurate|performance|rmse|mape|r2|r squared|features|importance|train|test|validation)\b/)
  const compare=entities.compare

  if(test(normalized,/\b(gdp forecast|gdp projection|stock price|weather forecast|temperature forecast|revenue forecast)\b/))add('unknown',20)
  if(hasCarbon){add('carbon_price_current',4);if(forecast)add('carbon_price_forecast',9);if(history)add('carbon_price_history',7);if(compare)add('carbon_market_comparison',8);if(test(normalized,/\b(volatility|volatile|risk|variability)\b/))add('carbon_market_volatility',10);if(technical)add('model_performance',3)}
  if(hasEvent){add('climate_event_summary',5);if(entities.eventType||test(normalized,/\b(show|find|list|occurred|happened|which|what|policy|weather|disaster)\b/))add('climate_event_search',7);if(test(normalized,/\b(severe|severity|worst|strongest)\b/))add('climate_event_severity',9);if(test(normalized,/\b(impact|affect|effect|move|improve|prediction|predictive|model|price|carbon)\b/))add('climate_event_price_impact',12)}
  if(hasEmission||hasCountry){if(hasCountry)add('country_overview',3);if(hasEmission)add('country_co2',5);if(test(normalized,/\b(per capita|per person|per head)\b/))add('co2_per_capita',9);if(history&&hasEmission)add('country_co2_history',7);if(compare&&hasCountry)add('country_co2_comparison',7);if(test(normalized,/\b(predict co2|forecast co2 per capita|estimated co2|co2 prediction)\b/))add('co2_prediction',12)}
  if(hasEnergy){add('energy_mix',5);if(entities.source==='renewables_total')add('renewable_share',7);if(entities.source==='fossil_total')add('fossil_share',7);if(entities.source && !['renewables_total','fossil_total'].includes(entities.source))add('energy_mix',4);if(compare)add('energy_source_comparison',9);if(test(normalized,/\b(transition|archetype|classification|category|progress)\b/))add('transition_status',9)}
  if(test(normalized,/\b(transition|archetype|classification|category)\b/)){add('transition_status',7);if(compare)add('transition_comparison',9)}
  if(hasScenario){add('emissions_forecast',10);if(entities.scenario)add('emissions_forecast',3);if(compare||test(normalized,/\b(all scenarios|each scenario|three scenarios|scenarios compare)\b/))add('scenario_comparison',11);if(test(normalized,/\b(avoided|reduction|reduce|save|lower than|compared to bau|vs bau)\b/))add('avoided_emissions',12)}
  if(technical){add('model_performance',8);if(test(normalized,/\b(compare|better|best|difference)\b/))add('model_comparison',9);if(test(normalized,/\b(feature|driver|importance|influential)\b/))add('feature_importance',10)}
  if(test(normalized,/\b(dataset|data|data source|csv|rows|columns|missing|quality|coverage|available data|data range)\b/)){add('dataset_information',12);if(test(normalized,/\b(coverage|covered|range|years|countries|markets|regions)\b/))add('data_coverage',8)}
  if(test(normalized,/\b(summary|overview|everything|tell me about|profile|all about)\b/)){add(hasCountry?'country_overview':'general_summary',11)}
  if(test(normalized,/\b(insight|finding|takeaway|important|matter)\b/))add('key_insights',10)
  if(normalized==='2030'||(entities.years.includes(2030)&&!hasCountry&&!hasEmission&&!hasEnergy&&!entities.scenario))add('clarify',20)
  if(hasCountry && !hasEmission&&!hasEnergy&&!hasScenario&&!hasEvent&&!hasCarbon&&!technical)add('country_overview',7)
  if(hasMarket&&!forecast&&!history&&!compare&&!technical&&!hasEvent)add('carbon_price_current',4)
  if(!scores.size && context.activeIntent && (hasCountry||hasMarket||entities.source||entities.years.length||test(normalized,/\b(what about|how about|and|both|their|those)\b/)))add(context.activeIntent,7)
  if(context.activeIntent && test(normalized,/\b(what about|how about|and|those|their|it)\b/)){
    if(!hasEnergy&&!hasEmission&&!hasCarbon&&!hasScenario&&!technical&&!hasEvent)add(context.activeIntent,9)
    else if(hasEnergy&&context.activeCountries?.length)add(entities.source==='renewables_total'?'renewable_share':entities.source==='fossil_total'?'fossil_share':'energy_mix',8)
  }
  if(hasCountry && entities.countries.length>1 && !hasScenario && !hasEnergy && !hasCarbon)add('country_co2_comparison',6)
  if(hasCarbon&&forecast)add('carbon_price_forecast',8)
  if(hasEmission&&hasScenario)add('emissions_forecast',8)
  if(hasCountry && test(normalized,/\b(what happens if|increases renewable|quickly|rapidly)\b/))add('emissions_forecast',10)
  const ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1])
  let intent=ranked[0]?.[0]||'unknown'
  // Domain cues resolve overlaps after weighted scoring. They describe concepts,
  // not exact user questions, so paraphrases retain the same route.
  if(intent!=='unknown' || !/\b(gdp forecast|stock price|weather forecast|temperature forecast|revenue forecast)\b/.test(normalized)){
    if(hasEvent&&test(normalized,/\b(impact|affect|effect|move|improve|predictive|prediction|model)\b/))intent='climate_event_price_impact'
    else if(hasEvent&&test(normalized,/\b(severe|severity|worst|strongest)\b/))intent='climate_event_severity'
    else if(hasEvent&&test(normalized,/\b(show|find|list|occurred|happened|policy|weather|disaster|heatwave|flood)\b/))intent='climate_event_search'
    else if(hasEvent&&test(normalized,/\b(summary|overview)\b/))intent='climate_event_summary'
    else if(hasScenario&&hasCountry&&test(normalized,/\b(avoided|reduction|reduce|save|lower than|compare to bau|compared to bau|vs bau)\b/))intent='avoided_emissions'
    else if(hasScenario&&hasCountry&&test(normalized,/\b(compare|all scenario|each scenario|three scenario)\b/))intent='scenario_comparison'
    else if(hasScenario&&hasCountry)intent='emissions_forecast'
    else if(test(normalized,/\b(feature|features|driver|importance|influential)\b/)&&!hasCountry)intent='feature_importance'
    else if(hasEnergy&&entities.rank&&!hasCountry)intent='energy_mix'
    else if(hasEnergy&&entities.countries.length>1)intent='energy_source_comparison'
    else if(test(normalized,/\b(transition|archetype|classification|category)\b/)&&hasCountry)intent=entities.countries.length>1?'transition_comparison':'transition_status'
    else if(hasCountry&&hasEmission&&!compare&&!history&&!test(normalized,/\b(per capita|per person|per head)\b/)&&!technical)intent='country_co2'
    else if(hasCarbon&&forecast)intent='carbon_price_forecast'
    else if(test(normalized,/\b(what about|how about)\b/)&&entities.markets.length===1&&context.activeIntent?.startsWith('carbon_')&&!forecast&&!history&&!technical)intent=context.activeIntent
    else if(test(normalized,/\b(what about|how about)\b/)&&context.activeIntent&&entities.countries.length===1&&!hasEnergy&&!hasScenario&&!hasCarbon&&!hasEvent&&!technical)intent=context.activeIntent
    else if(test(normalized,/\b(covered|coverage|range)\b/)&&test(normalized,/\b(data|dataset|years)\b/))intent='data_coverage'
  }
  const top=ranked[0]?.[1]||0;const next=ranked[1]?.[1]||0
  const confidence=Math.max(.35,Math.min(.98,.58+top*.025+(top-next)*.01))
  return {original:question,normalized,intent,confidence,...entities,metric:entities.source,context}
}
