import { request } from './client'
import type { DashboardData } from '@/lib/assistant/types'

export async function getDashboard() {
  const response = await request<DashboardData & { status: string; message?: string }>('/api/dashboard')
  if (response.status !== 'success') throw new Error(response.message || 'Dashboard data unavailable.')
  if (!response.countries.length || !response.markets.length) throw new Error('No dashboard records available.')
  return response
}
