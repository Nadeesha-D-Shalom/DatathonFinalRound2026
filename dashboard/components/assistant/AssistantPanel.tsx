'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowUp, Database, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { answerQuestion } from '@/lib/assistant/resolver'
import type { AssistantAnswer, AssistantContext, DashboardData } from '@/lib/assistant/types'

type Message = { role: 'user' | 'assistant'; text?: string; answer?: AssistantAnswer }
const starters = [
  'Forecast EU ETS',
  'Compare Germany and France',
  'What happened in climate events?',
  'China 2030 scenarios',
]
function MetricResponse({ answer }: { answer: AssistantAnswer }) {
  return answer.metrics?.length ? (
    <div className="assistant-metrics">
      {answer.metrics.map((m, i) => (
        <div className="assistant-metric" key={i}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          {m.detail && <small>{m.detail}</small>}
        </div>
      ))}
    </div>
  ) : null
}
function ComparisonResponse({ answer }: { answer: AssistantAnswer }) {
  return answer.table ? (
    <div className="assistant-table-wrap">
      <table className="assistant-table">
        <thead>
          <tr>
            {answer.table.columns.map((x, i) => (
              <th key={i}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {answer.table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null
}
function ChartResponse({ answer }: { answer: AssistantAnswer }) {
  const chart = answer.chart
  if (!chart || !chart.points.length) return null
  return (
    <div className="assistant-chart">
      <div className="assistant-chart-title">{chart.title}</div>
      <ResponsiveContainer width="100%" height={165}>
        {chart.kind === 'bar' ? (
          <BarChart data={chart.points} margin={{ top: 4, right: 4, bottom: 8, left: -16 }}>
            <CartesianGrid stroke="#e9f0f1" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip
              formatter={(v: any) =>
                `${v?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'Unavailable'} ${chart.unit}`
              }
            />
            <Bar dataKey="value" fill="#318d72" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={chart.points} margin={{ top: 4, right: 4, bottom: 8, left: -16 }}>
            <CartesianGrid stroke="#e9f0f1" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v: any) =>
                `${v?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'Unavailable'} ${chart.unit}`
              }
            />
            <Line dataKey="value" stroke="#318d72" strokeWidth={2} dot={chart.points.length < 12} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
function AssistantMessage({ message }: { message: Message }) {
  if (message.role === 'user') return <div className="assistant-user-message">{message.text}</div>
  const a = message.answer!
  return (
    <div className="assistant-answer">
      <div className="assistant-answer-label">
        <ShieldCheck size={13} /> Evidence-based answer
      </div>
      <h3>{a.title}</h3>
      <p>{a.summary}</p>
      <MetricResponse answer={a} />
      <ComparisonResponse answer={a} />
      <ChartResponse answer={a} />
      {a.bullets?.length ? (
        <ul>
          {a.bullets.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : null}
      {a.caveat && <div className="assistant-caveat">{a.caveat}</div>}
      <div className="assistant-source">
        <Database size={12} /> Source: {a.source}
      </div>
    </div>
  )
}
export default function AssistantPanel({
  data,
  open,
  onClose,
}: {
  data: DashboardData
  open: boolean
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [context, setContext] = useState<AssistantContext>({})
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    const body = bodyRef.current
    const last = body?.querySelector('.assistant-answer:last-of-type')
    if (body && last) {
      const top =
        last.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop
      body.scrollTo({ top: Math.max(0, top - 14), behavior: 'smooth' })
    }
  }, [messages])
  const send = (question: string) => {
    const text = question.trim()
    if (!text) return
    const result = answerQuestion(text, data, context)
    setContext(result.context)
    setMessages((old) => [...old, { role: 'user', text }, { role: 'assistant', answer: result }])
    setDraft('')
  }
  return (
    <>
      {open && <div className="assistant-mobile-scrim" onClick={onClose} />}
      <aside className={'assistant-panel ' + (open ? 'assistant-open' : '')} aria-hidden={!open}>
        <div className="assistant-header">
          <div className="assistant-icon">
            <MessageCircle size={20} />
          </div>
          <div>
            <strong>Briefwright</strong>
            <span>Rule-based analysis · competition data only</span>
          </div>
          <button type="button" aria-label="Close assistant" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div ref={bodyRef} className="assistant-body">
          {messages.length === 0 && (
            <div className="assistant-welcome">
              <div className="assistant-welcome-icon">
                <MessageCircle size={22} />
              </div>
              <h2>Ask the climate data</h2>
              <p>
                Explore carbon markets, emissions, events, energy transitions and 2030 scenarios.
                Answers are calculated from the supplied datasets and our model outputs.
              </p>
              <div className="assistant-chip-list">
                {starters.map((x) => (
                  <button type="button" key={x} onClick={() => send(x)}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <AssistantMessage key={i} message={m} />
          ))}
        </div>
        <form
          className="assistant-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <div className="assistant-input-row">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about the climate data..."
              aria-label="Ask Briefwright"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Send question">
              <ArrowUp size={17} />
            </button>
          </div>
          <small>No external AI service. Questions are parsed and answered locally.</small>
        </form>
      </aside>
    </>
  )
}
