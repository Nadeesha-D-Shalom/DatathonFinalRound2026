'use client'
import { useEffect, useState } from 'react'
import { getCarbonResults } from '@/lib/api/carbon'

export default function CarbonModelResults() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCarbonResults>> | null>(null)
  const [message, setMessage] = useState('Loading ARIMA evidence…')
  useEffect(() => {
    let active = true
    getCarbonResults().then(result => {
      if (!active) return
      if (result.status === 'success') setData(result)
      else setMessage('ARIMA evidence unavailable.')
    }).catch(() => { if (active) setMessage('ARIMA evidence unavailable.') })
    return () => { active = false }
  }, [])
  return <section className="v2-card">
    <span className="v2-model-number">01 / CARBON PRICE</span>
    <h2>ARIMA · 30 trading-day forecasts</h2>
    {!data ? <p role="status">{message}</p> : <>
      <p>Source: {data.source}. Rolling-origin errors below are market-specific and use each market&apos;s quoted currency.</p>
      <table><thead><tr><th>Market</th><th>Mean RMSE</th><th>Mean MAPE (%)</th></tr></thead>
        <tbody>{data.rolling_summary.map(row => <tr key={row.market}><td>{row.market.replaceAll('_', ' ')}</td><td>{Number(row.Avg_RMSE).toFixed(4)}</td><td>{Number(row.Avg_MAPE).toFixed(4)}</td></tr>)}</tbody></table>
      <h3>True 30-step comparison</h3>
      <table><thead><tr><th>Model</th><th>RMSE</th><th>MAPE (%)</th></tr></thead>
        <tbody>{data.true_30step.map(row => <tr key={row.Model}><td>{row.Model}</td><td>{row.RMSE}</td><td>{row['MAPE_%']}</td></tr>)}</tbody></table>
      <p>Pooled comparison errors span markets with different quoted currencies.</p>
    </>}
  </section>
}
