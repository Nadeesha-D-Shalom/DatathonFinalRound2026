'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CloudSun,
  Database,
  Earth,
  FlaskConical,
  Gauge,
  Globe2,
  LayoutDashboard,
  Leaf,
  LineChart as LineIcon,
  Menu,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { Card as UiCard } from '@/components/ui/card'
import AssistantPanel from '@/components/assistant/AssistantPanel'
import type { DashboardData } from '@/lib/assistant/types'
type Row = {
  year: number
  country: string
  region: string
  co2_emissions_mt: number
  co2_per_capita_t: number
  co2_intensity_kg_per_gdp_usd: number
  population_millions: number
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
type Point = { date: string; price: number; rolling30: number; volatility30: number | null }
type Data = {
  markets: string[]
  countries: string[]
  regions: string[]
  carbon: Record<
    string,
    {
      currency: string
      history: Point[]
      latest: number
      latestDate: string
      volatility: number | null
    }
  >
  events: {
    date: string
    region: string
    event_type: string
    severity_score: number
    description: string
    is_policy: number
    is_extreme_weather: number
    is_disaster: number
  }[]
  countriesData: Row[]
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
  co2Model?: {
    algorithm: string
    features: string[]
    target: string
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
const nav = [
  ['Overview', LayoutDashboard],
  ['Carbon Markets', LineIcon],
  ['Climate Event Impact', CloudSun],
  ['CO₂ Intelligence', Activity],
  ['Energy Transition', Leaf],
  ['2030 Scenario Lab', FlaskConical],
  ['Country Explorer', Globe2],
  ['Model Performance', Gauge],
  ['Product / Business Case', BriefcaseBusiness],
  ['Data Quality', Database],
] as const
const colors = {
  green: '#2b8c69',
  blue: '#2782a1',
  orange: '#d99645',
  dark: '#173b48',
  light: '#b9d8ce',
}
const fmt = (n: number | undefined, d = 1) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
    : 'Unavailable'
function Card({
  title,
  sub,
  children,
  className = '',
}: {
  title: string
  sub?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <UiCard className={className}>
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </UiCard>
  )
}
function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="detail">{detail}</div>
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}
function Chart({
  children,
  tall = false,
  short = false,
}: {
  children: React.ReactNode
  tall?: boolean
  short?: boolean
}) {
  return (
    <div className={'chart ' + (tall ? 'tall ' : '') + (short ? 'short' : '')}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}
function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (s: string) => void
  options: string[]
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  )
}
function Title({
  title,
  sub,
  controls,
}: {
  title: string
  sub: string
  controls?: React.ReactNode
}) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">Monsoon Mandate / Helios Pane</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {controls && <div className="controls">{controls}</div>}
    </div>
  )
}
function Section({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="section">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  )
}
function CarbonChart({ market, data }: { market: string; data: Data }) {
  const c = data.carbon[market]
  const points = c?.history.slice(-450) || []
  return (
    <Chart tall>
      <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 6, left: 0 }}>
        <CartesianGrid stroke="#edf1f2" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={55} />
        <YAxis tick={{ fontSize: 10 }} width={48} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(v: any) => [fmt(v, 2) + ' ' + c.currency, 'Price']}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="price"
          name="Observed carbon price"
          stroke={colors.green}
          fill="#dff0e8"
          strokeWidth={2}
          fillOpacity={0.5}
          dot={false}
        />
      </ComposedChart>
    </Chart>
  )
}
function ForecastChart({ market, data }: { market: string; data: Data }) {
  const c = data.carbon[market] as any
  const history = c.history.slice(-160).map((p: Point) => ({ date: p.date, observed: p.price }))
  const boundary = history.at(-1)
  const forecast = c.forecast || []
  const points = [
    ...history,
    ...(boundary ? [{ date: boundary.date, forecast: boundary.observed }] : []),
    ...forecast.map((p: any) => ({
      date: p.date,
      forecast: p.price,
      lower: p.lower,
      upper: p.upper,
    })),
  ]
  return (
    <Chart tall>
      <ComposedChart data={points}>
        <CartesianGrid stroke="#edf1f2" vertical={false} />
        <XAxis dataKey="date" minTickGap={52} tick={{ fontSize: 10 }} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
        <Tooltip formatter={(v: any, name: any) => [fmt(Number(v), 2) + ' ' + c.currency, name]} />
        <Legend />
        <ReferenceLine
          x={boundary?.date}
          stroke="#8aa0a8"
          strokeDasharray="4 4"
          label={{ value: 'Forecast starts', fontSize: 10, position: 'top' }}
        />
        <Line
          dataKey="observed"
          name="Observed price"
          stroke={colors.green}
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="forecast"
          name="30-day forecast"
          stroke={colors.blue}
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          dataKey="lower"
          name="Approx. lower band"
          stroke={colors.light}
          strokeDasharray="4 4"
          dot={false}
        />
        <Line
          dataKey="upper"
          name="Approx. upper band"
          stroke={colors.light}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </Chart>
  )
}
function EventPriceChart({ market, data }: { market: string; data: Data }) {
  const source = data.carbon[market].history
  const marks = data.events.filter((e) => e.date >= source[0].date && e.date <= source.at(-1)!.date)
  const points = source.map((p) => ({
    ...p,
    policyMarker: null as number | null,
    weatherMarker: null as number | null,
    disasterMarker: null as number | null,
    otherMarker: null as number | null,
    eventDetails: [] as string[],
  }))
  for (const e of marks) {
    const i = points.findIndex((p) => p.date >= e.date)
    if (i < 0) continue
    const key = e.is_policy
      ? 'policyMarker'
      : e.is_extreme_weather
        ? 'weatherMarker'
        : e.is_disaster
          ? 'disasterMarker'
          : 'otherMarker'
    ;(points[i] as any)[key] = points[i].price
    points[i].eventDetails.push(
      `${e.date} · ${e.region} · ${e.event_type} · severity ${e.severity_score}: ${e.description}`,
    )
  }
  return (
    <Chart tall>
      <ComposedChart data={points}>
        <CartesianGrid stroke="#edf1f2" vertical={false} />
        <XAxis dataKey="date" minTickGap={60} tick={{ fontSize: 10 }} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="tooltip" style={{ padding: 10, maxWidth: 280 }}>
                <strong>{label}</strong>
                <div>
                  {fmt(Number(payload[0]?.payload?.price), 2)} {data.carbon[market].currency}
                </div>
                {(payload[0]?.payload?.eventDetails || []).map((x: string) => (
                  <div key={x} style={{ marginTop: 6 }}>
                    {x}
                  </div>
                ))}
              </div>
            ) : null
          }
        />
        <Legend />
        <Line
          dataKey="price"
          name="Observed price"
          stroke={colors.green}
          dot={false}
          strokeWidth={2}
        />
        <Scatter dataKey="policyMarker" name="Policy" fill={colors.blue} />
        <Scatter dataKey="weatherMarker" name="Extreme weather" fill={colors.orange} />
        <Scatter dataKey="disasterMarker" name="Disaster" fill="#b74e5a" />
        <Scatter dataKey="otherMarker" name="Other event" fill="#8b7ca9" />
      </ComposedChart>
    </Chart>
  )
}
export function Overview({
  data,
  market,
  setMarket,
}: {
  data: Data
  market: string
  setMarket: (x: string) => void
}) {
  const latest = data.countriesData.filter((x) => x.year === data.summary.latestYear)
  const renew = latest.length
    ? latest.reduce((a, b) => a + b.renewables_total_pct, 0) / latest.length
    : 0
  const global = data.countriesData.filter((x) => x.country === 'World' || x.country === 'Global')
  const years = Array.from(new Set(data.countriesData.map((x) => x.year))).sort()
  const trend = years.map((year) => {
    const rows = data.countriesData.filter((x) => x.year === year)
    return {
      year,
      renewable: rows.reduce((a, b) => a + b.renewables_total_pct, 0) / rows.length,
      fossil: rows.reduce((a, b) => a + b.fossil_total_pct, 0) / rows.length,
      emissions: rows.reduce((a, b) => a + b.co2_emissions_mt, 0),
    }
  })
  const c = data.carbon[market]
  return (
    <>
      <Title
        title="Climate & Energy Intelligence Overview"
        sub="Data-driven insights across carbon markets, emissions and the global energy transition."
        controls={<Select value={market} onChange={setMarket} options={data.markets} />}
      />
      <div className="grid kpis">
        <Kpi
          label={market.replaceAll('_', ' ') + ' carbon price'}
          value={c ? `${fmt(c.latest, 2)} ${c.currency}` : 'Unavailable'}
          detail={c?.latestDate || 'No source data'}
        />
        <Kpi
          label="Average renewable share"
          value={fmt(renew, 1) + '%'}
          detail={`${data.summary.latestYear} · unweighted country average`}
        />
        <Kpi
          label="Countries analyzed"
          value={String(data.summary.countryCount)}
          detail="CO₂ and energy mix datasets"
        />
        <Kpi
          label="Climate events"
          value={String(data.summary.eventCount)}
          detail="Supplied event records"
        />
      </div>
      <Card
        title={`${market.replaceAll('_', ' ')} carbon price history`}
        sub="Observed daily prices · 30-trading-day model forecast · chronological held-out evaluation"
      >
        <ForecastChart market={market} data={data} />
        <div className="note">
          The forecast and 95% intervals come from the validated Q1 ARIMA package. The backend serves these saved outputs without retraining.
        </div>
      </Card>
      <div className="grid two" style={{ marginTop: 16 }}>
        <Card
          title="How is the energy mix changing?"
          sub="Unweighted country average · percentage of total energy"
        >
          <Chart>
            <LineChart data={trend}>
              <CartesianGrid stroke="#edf1f2" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis unit="%" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line
                dataKey="renewable"
                name="Renewables"
                stroke={colors.green}
                dot={false}
                strokeWidth={2}
              />
              <Line
                dataKey="fossil"
                name="Fossil fuels"
                stroke={colors.orange}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </Chart>
        </Card>
        <Card
          title="How have reported CO₂ emissions changed?"
          sub="Sum across supplied countries · million tonnes CO₂"
        >
          <Chart>
            <AreaChart data={trend}>
              <CartesianGrid stroke="#edf1f2" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={50} />
              <Tooltip formatter={(v: any) => fmt(v, 0) + ' Mt'} />
              <Area
                dataKey="emissions"
                name="CO₂ emissions"
                stroke={colors.blue}
                fill="#dceef3"
                dot={false}
              />
            </AreaChart>
          </Chart>
        </Card>
      </div>
      <Section title="Climate event activity" detail="Recorded events in the supplied file" />
      <EventBars data={data} />
      <Section title="Key intelligence" detail="Calculated from the competition datasets" />
      <div className="grid three">
        <div className="card insight">
          <strong>Renewables gained share across the observed country panel</strong>
          <div className="evidence">
            {fmt(trend.at(-1)?.renewable, 1)}% latest vs {fmt(trend[0]?.renewable, 1)}% first year
          </div>
          <p>
            Transition speed varies by country, making country-level scenario analysis more useful
            than a single global assumption.
          </p>
        </div>
        <div className="card insight">
          <strong>Fossil fuels remain material in the energy mix</strong>
          <div className="evidence">{fmt(trend.at(-1)?.fossil, 1)}% latest country average</div>
          <p>
            Policy and capital allocation should consider the remaining fossil exposure alongside
            renewable growth.
          </p>
        </div>
        <div className="card insight">
          <strong>Carbon markets differ in currency and history</strong>
          <div className="evidence">
            {data.markets.length} markets · {data.summary.carbonRows.toLocaleString()} daily
            observations
          </div>
          <p>
            Compare each market within its own units before translating price movements into
            decisions.
          </p>
        </div>
      </div>
    </>
  )
}
function EventBars({ data }: { data: Data }) {
  const byYear = Array.from(new Set(data.events.map((e) => Number(e.date.slice(0, 4)))))
    .sort()
    .map((year) => ({
      year,
      policy: data.events.filter((e) => e.date.startsWith(String(year)) && e.is_policy).length,
      weather: data.events.filter((e) => e.date.startsWith(String(year)) && e.is_extreme_weather)
        .length,
      disaster: data.events.filter((e) => e.date.startsWith(String(year)) && e.is_disaster).length,
    }))
  return (
    <Card
      title="What types of events were recorded?"
      sub="Annual counts · categories may overlap for an event"
    >
      <Chart short>
        <BarChart data={byYear}>
          <CartesianGrid stroke="#edf1f2" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="policy" stackId="a" fill={colors.blue} name="Policy" />
          <Bar dataKey="weather" stackId="a" fill={colors.orange} name="Extreme weather" />
          <Bar dataKey="disaster" stackId="a" fill={colors.green} name="Disaster" />
        </BarChart>
      </Chart>
    </Card>
  )
}
export function CarbonMarkets({
  data,
  market,
  setMarket,
}: {
  data: Data
  market: string
  setMarket: (x: string) => void
}) {
  const c = data.carbon[market]
  return (
    <>
      <Title
        title="Carbon Market Forecasting"
        sub="Daily observed prices and market-specific risk signals."
        controls={<Select value={market} onChange={setMarket} options={data.markets} />}
      />
      <div className="grid kpis">
        <Kpi
          label="Latest price"
          value={`${fmt(c.latest, 2)} ${c.currency}`}
          detail={c.latestDate}
        />
        <Kpi
          label="30-day predicted price"
          value={`${fmt((c as any).forecast?.at(-1)?.price, 2)} ${c.currency}`}
          detail="30th trading-day estimate"
        />
        <Kpi
          label="30-day movement"
          value={fmt(((c as any).forecast?.at(-1)?.price / c.latest - 1) * 100, 1) + '%'}
          detail="Forecast end vs latest observed"
        />
        <Kpi
          label="30-day historical volatility"
          value={c.volatility === null ? 'Unavailable' : fmt(c.volatility, 2) + '%'}
          detail="Standard deviation of daily returns"
        />
      </div>
      <Card
        title={`${market.replaceAll('_', ' ')} — observed price and 30-trading-day forecast`}
        sub={`Daily price in ${c.currency}; validated ARIMA forecast follows the observed boundary`}
      >
        <ForecastChart market={market} data={data} />
        <div className="note">
          Approximate bands use held-out one-step absolute errors scaled by forecast horizon. They
          do not guarantee multi-step coverage.
        </div>
      </Card>
      <div className="grid two" style={{ marginTop: 16 }}>
        <Card title="Price vs 30-day rolling average" sub={`Observed ${c.currency} per unit`}>
          <Chart short>
            <LineChart data={c.history.slice(-320)}>
              <CartesianGrid stroke="#edf1f2" vertical={false} />
              <XAxis dataKey="date" minTickGap={55} tick={{ fontSize: 10 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line dataKey="price" stroke={colors.green} dot={false} name="Daily price" />
              <Line dataKey="rolling30" stroke={colors.orange} dot={false} name="30-day average" />
            </LineChart>
          </Chart>
        </Card>
        <Card
          title="Rolling market volatility"
          sub="30-observation standard deviation of daily percentage returns"
        >
          <Chart short>
            <AreaChart data={c.history.slice(-320)}>
              <CartesianGrid stroke="#edf1f2" vertical={false} />
              <XAxis dataKey="date" minTickGap={55} tick={{ fontSize: 10 }} />
              <YAxis unit="%" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area
                dataKey="volatility30"
                stroke={colors.blue}
                fill="#e1f0f4"
                name="Volatility %"
              />
            </AreaChart>
          </Chart>
        </Card>
      </div>
      <Card title="Forecast model summary" sub="Technical evidence required before release">
        <div className="grid three">
          <Kpi
            label="Algorithm"
            value="Random forest"
            detail={(c as any).model.train + ' training'}
          />
          <Kpi
            label="RMSE / MAPE"
            value={fmt((c as any).model.rmse, 2) + ' / ' + fmt((c as any).model.mape, 1) + '%'}
            detail={(c as any).model.test + ' test'}
          />
          <Kpi label="Horizon" value="30 days" detail="Target trading-day horizon" />
        </div>
      </Card>
    </>
  )
}
export function Quality({ data }: { data: Data }) {
  return (
    <>
      <Title
        title="Data Quality & Provenance"
        sub="Five competition datasets; no external observations or pretrained weights."
      />
      <Card title="Dataset inventory" sub="Counts and ranges calculated directly from source CSVs">
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Rows</th>
                <th>Columns</th>
                <th>Missing cells</th>
                <th>Range</th>
                <th>Countries</th>
                <th>Markets</th>
                <th>Regions</th>
              </tr>
            </thead>
            <tbody>
              {data.quality.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td>{x.rows.toLocaleString()}</td>
                  <td>{x.columns}</td>
                  <td>{x.missing.toLocaleString()}</td>
                  <td>
                    {x.start} – {x.end}
                  </td>
                  <td>{x.countries ?? '—'}</td>
                  <td>{x.markets ?? '—'}</td>
                  <td>{x.regions ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ height: 16 }} />
      <Card
        title="Global temperature anomaly and atmospheric CO₂"
        sub="Monthly climate context from temperature_anomaly_monthly.csv"
      >
        <Chart>
          <LineChart data={data.temperature}>
            <CartesianGrid stroke="#edf1f2" vertical={false} />
            <XAxis dataKey="year_month" minTickGap={65} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="a" unit="°C" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="b" orientation="right" unit="ppm" tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="a"
              dataKey="temp_anomaly_c"
              name="Temperature anomaly °C"
              stroke={colors.orange}
              dot={false}
            />
            <Line yAxisId="b" dataKey="co2_ppm" name="CO₂ ppm" stroke={colors.blue} dot={false} />
          </LineChart>
        </Chart>
      </Card>
    </>
  )
}
export function Product() {
  return (
    <>
      <Title
        title="From Climate Data to Decision Intelligence"
        sub="One intelligence layer connecting carbon markets, climate events, emissions and energy transitions."
      />
      <div className="grid two">
        <Card
          title="The decision problem"
          sub="A fragmented evidence base creates slow, inconsistent climate decisions"
        >
          <p>
            ESG analysts need comparable emissions evidence. Carbon-market participants need price
            and event context. Energy companies need transition signals. Policy teams need
            transparent scenario assumptions.
          </p>
        </Card>
        <Card title="Value proposition" sub="Traceable analytics for decisions">
          <p>
            Monsoon Mandate connects the five supplied datasets in one workflow: observe market and
            climate signals, evaluate predictive models, compare country transitions, and review
            documented 2030 pathways.
          </p>
        </Card>
      </div>
      <Section title="Product modules" />
      <div className="grid three">
        {[
          ['Carbon Market Forecasting', 'Daily market context and evaluated price outlooks'],
          [
            'Event Shock Intelligence',
            'Dated climate and policy events with measured predictive value',
          ],
          ['CO₂ Driver Analytics', 'Energy mix variables linked to per-capita emissions'],
          ['Transition Monitoring', 'Country movement across fossil and renewable shares'],
          ['2030 Scenario Modelling', 'Transparent assumptions and comparable trajectories'],
        ].map(([a, b]) => (
          <Card key={a} title={a}>
            <p className="sub">{b}</p>
          </Card>
        ))}
      </div>
      <Section title="Customers & commercial model" />
      <div className="grid two">
        <Card title="Target customers">
          <p>
            Primary: energy, environment and finance ministries, and disaster agencies. Secondary:
            ESG and sustainability teams. South Asia first: Bangladesh, India and Pakistan are
            present in the supplied dataset.
          </p>
        </Card>
        <Card title="Potential monetization">
          <p>Government license + SaaS subscriptions + API access</p>
          <p className="sub">
            Commercial options are conceptual; no revenue projections are claimed.
          </p>
        </Card>
      </div>
      <Section title="Solution architecture" />
      <Card
        title="From source data to decisions"
        sub="Analysis and model training happen outside the dashboard"
      >
        <div className="architecture">
          {[
            'Provided CSVs',
            'Cleaning & validation',
            'Feature engineering',
            'Predictive & scenario models',
            'Validated JSON outputs',
            'Dashboard data layer',
            'Decision makers',
          ].map((x, i) => (
            <span key={x}>
              {x}
              {i < 6 && <em> →</em>}
            </span>
          ))}
        </div>
        <p className="sub">
          Modules: carbon forecasting · CO₂ regression · event experiment · transition analysis ·
          2030 scenarios.
        </p>
      </Card>
    </>
  )
}
