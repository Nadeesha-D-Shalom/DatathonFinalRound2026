'use client'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import type { DashboardData } from '@/lib/assistant/types'
import { getCarbonForecast, type CarbonForecastSuccess } from '@/lib/api/client'

const fmt = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : 'Unavailable'

export default function ConnectedCarbonPage({
  data,
  market,
  setMarket,
  children,
}: {
  data: DashboardData
  market: string
  setMarket: (market: string) => void
  children: ReactNode
}) {
  const [result, setResult] = useState<CarbonForecastSuccess | null>(null)
  const [message, setMessage] = useState('Checking specialist model…')
  useEffect(() => {
    let active = true
    setResult(null)
    setMessage('Checking specialist model…')
    getCarbonForecast(market)
      .then((response) => {
        if (!active) return
        if (response.status === 'success') {
          setResult(response)
          setMessage('')
        } else setMessage(response.message)
      })
      .catch((error) => {
        if (active)
          setMessage(error instanceof Error ? error.message : 'Prediction service is offline.')
      })
    return () => {
      active = false
    }
  }, [market])
  if (!result)
    return (
      <>
        <div className="v2-live-status" role="status">
          <strong>Live carbon specialist</strong>
          <span>{message}</span>
        </div>
        <p className="v2-export-label">
          The analysis export below is a separate, previously generated result from the supplied
          competition data.
        </p>
        {children}
      </>
    )
  const end = result.forecast.at(-1)
  const delta = end ? end.predicted_price - result.last_observed_price : 0
  const history = (data.carbon[market]?.history || [])
    .filter((point) => point.date <= result.last_observed_date)
    .slice(-160)
    .map((point) => ({
      date: point.date,
      observed: point.price,
      forecast: undefined as number | undefined,
    }))
  const points = [
    ...history,
    {
      date: result.last_observed_date,
      observed: undefined as number | undefined,
      forecast: result.last_observed_price,
    },
    ...result.forecast.map((point) => ({
      date: point.date,
      observed: undefined as number | undefined,
      forecast: point.predicted_price,
    })),
  ]
  return (
    <>
      <div className="v2-live-status" role="status">
        <strong>Live carbon specialist</strong>
        <span>{result.model.name} connected · 30 trading-day forecast</span>
      </div>
      <div className="v2-page-head">
        <div>
          <span className="v2-eyebrow">Carbon markets</span>
          <h1>Carbon Price Forecast</h1>
          <p>Observed prices and the connected specialist&apos;s 30 trading-day forecast.</p>
        </div>
        <label className="v2-select">
          <span>Carbon market</span>
          <select value={market} onChange={(event) => setMarket(event.target.value)}>
            {data.markets.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="v2-kpi-grid">
        <div className="v2-kpi">
          <div className="v2-kpi-label">Latest observed price</div>
          <div className="v2-kpi-value">
            {fmt(result.last_observed_price)} {result.currency}
          </div>
          <p>{result.last_observed_date}</p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Predicted price</div>
          <div className="v2-kpi-value">
            {end ? fmt(end.predicted_price) : 'Unavailable'} {result.currency}
          </div>
          <p>{end?.date || 'Forecast date unavailable'}</p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Expected change</div>
          <div className="v2-kpi-value">
            {fmt(delta)} {result.currency}
          </div>
          <p>
            {result.last_observed_price
              ? `${fmt((delta / result.last_observed_price) * 100)}% from observed price`
              : 'Percentage unavailable'}
          </p>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Model accuracy</div>
          <div className="v2-kpi-value">{fmt(result.model.mape)}% MAPE</div>
          <p>
            RMSE {fmt(result.model.rmse)} {result.currency}
          </p>
        </div>
      </div>
      <section className="v2-card v2-chart-card">
        <h2>{market.replaceAll('_', ' ')}: observed prices and specialist forecast</h2>
        <p className="v2-subtitle">
          Solid line: observed data. Dashed line: 30 trading-day prediction.
        </p>
        <div className="v2-periods">
          <span>
            <b>OBSERVED</b> through {result.last_observed_date}
          </span>
          <span>
            <b>FORECAST</b> next 30 trading days
          </span>
        </div>
        <div className="v2-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid vertical={false} stroke="#e7edef" />
              <XAxis dataKey="date" minTickGap={48} tick={{ fontSize: 10 }} />
              <YAxis width={55} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => `${fmt(Number(value))} ${result.currency}`} />
              <Legend />
              <ReferenceLine x={result.last_observed_date} stroke="#8ba0a6" strokeDasharray="5 4" />
              <Line
                dataKey="observed"
                name="Observed price"
                stroke="#287d62"
                dot={false}
                strokeWidth={2.5}
              />
              <Line
                dataKey="forecast"
                name="Specialist forecast"
                stroke="#2a8ba3"
                strokeDasharray="5 2"
                dot={false}
                strokeWidth={2.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  )
}
