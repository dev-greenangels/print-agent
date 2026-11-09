import { getConfig } from './config'

export type PrintJob = {
  id: string
  agentId: string
  role: string
  status: string
  packageId: string | null
  contentType: string
  error: string | null
  pdfBase64?: string
  meta?: Record<string, unknown> | null
}

function baseUrl() {
  return getConfig().apiUrl.replace(/\/$/, '')
}

function agentHeaders(): Record<string, string> {
  const c = getConfig()
  return {
    'Content-Type': 'application/json',
    'X-Print-Agent-Id': c.agentId,
    'X-Print-Agent-Secret': c.secret,
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string | string[]; error?: string }
    if (Array.isArray(data.message)) return data.message.join(', ')
    if (typeof data.message === 'string') return data.message
    if (typeof data.error === 'string') return data.error
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`
}

export async function registerAgent(input: {
  apiUrl: string
  code: string
  name: string
}): Promise<{ agentId: string; secret: string }> {
  const url = `${input.apiUrl.replace(/\/$/, '')}/print-agent/register`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.code.trim(),
      name: input.name.trim() || 'Warehouse PC',
      agentVersion: '0.1.0',
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { agentId: string; secret: string }
  return data
}

export async function heartbeat(printers: Array<{ name: string; role?: string }>) {
  const res = await fetch(`${baseUrl()}/print-agent/heartbeat`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({
      printers,
      agentVersion: '0.1.0',
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchPendingJobs(): Promise<PrintJob[]> {
  const res = await fetch(`${baseUrl()}/print-agent/jobs/pending`, {
    headers: agentHeaders(),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as PrintJob[]
}

export async function claimJob(id: string): Promise<PrintJob> {
  const res = await fetch(`${baseUrl()}/print-agent/jobs/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    headers: agentHeaders(),
    body: '{}',
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as PrintJob
}

export async function ackJob(id: string, ok: boolean, error?: string) {
  const res = await fetch(`${baseUrl()}/print-agent/jobs/${encodeURIComponent(id)}/ack`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({ ok, error }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export function eventsUrl(): string {
  return `${baseUrl()}/print-agent/events`
}
