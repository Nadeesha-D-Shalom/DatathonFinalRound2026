'use client'

import { useEffect, useState } from 'react'
import { getQ2Summary, type Q2Summary } from '@/lib/api/q2'

const fmt = (value: number) => Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : 'Unavailable'

export default function Q2ResultsCard({ onOpen }: { onOpen: () => void }) {
  const [summary, setSummary] = useState<Q2Summary | null>(null)
  const [message, setMessage] = useState('Loading validated Q2 results…')
  useEffect(() => {
    let active = true
    getQ2Summary().then(response => {
      if (!active) return
      if (response.status === 'success') { setSummary(response); setMessage('') }
      else setMessage('Validated Q2 analysis is unavailable.')
    }).catch(() => { if (active) setMessage('Q2 analysis service is unavailable.') })
    return () => { active = false }
  }, [])
  const comparison = summary?.experiment.comparison
  return <div className="v2-card"><span className="v2-model-number">03 / Q2 CLIMATE EVENTS</span><h2>Do event features improve prediction?</h2>{summary ? <><p>Baseline Ridge RMSE: <strong>{fmt(summary.experiment.baseline.rmse)}</strong></p><p>Ridge + events RMSE: <strong>{fmt(summary.experiment.event_aware.rmse)}</strong></p><p>RMSE improvement: <strong>{comparison && fmt(comparison.rmse_improvement_percent)}%</strong></p><p>The difference is marginal; MAPE did not improve.</p></> : <p role="status">{message}</p>}<button type="button" className="q2-open-link" onClick={onOpen}>View Climate Events Analysis</button></div>
}
