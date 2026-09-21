import { request } from './client'

export type AssistantContext = { country?: string | null; market?: string | null }
export const queryAssistant = (query: string, context: AssistantContext) =>
  request<{ status: string; intent: string; answer: string; sources: string[]; context: AssistantContext }>(
    '/api/assistant/query', { query, context },
  )
