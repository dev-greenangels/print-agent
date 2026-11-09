import { getConfig } from './config'
import { eventsUrl, type PrintJob } from './nest-api'
import { processJob } from './job-runner'

export type SseStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type StatusListener = (status: SseStatus, detail?: string) => void

let abort: AbortController | null = null
let status: SseStatus = 'disconnected'
let lastDetail = ''
const listeners = new Set<StatusListener>()

export function getSseStatus() {
  return status
}

export function getSseDetail() {
  return lastDetail
}

export function onSseStatus(fn: StatusListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setStatus(next: SseStatus, detail?: string) {
  status = next
  lastDetail = detail || ''
  for (const fn of listeners) fn(next, detail)
}

export function stopSse() {
  abort?.abort()
  abort = null
  setStatus('disconnected')
}

export async function startSse() {
  stopSse()
  const c = getConfig()
  if (!c.apiUrl || !c.agentId || !c.secret) {
    setStatus('disconnected', 'Не зареєстровано')
    return
  }

  abort = new AbortController()
  setStatus('connecting')

  const run = async () => {
    while (abort && !abort.signal.aborted) {
      try {
        const res = await fetch(eventsUrl(), {
          headers: {
            Accept: 'text/event-stream',
            'X-Print-Agent-Id': c.agentId,
            'X-Print-Agent-Secret': c.secret,
          },
          signal: abort.signal,
        })
        if (!res.ok || !res.body) {
          setStatus('error', `SSE HTTP ${res.status}`)
          await sleep(5000)
          continue
        }
        setStatus('connected')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const chunk of parts) {
            await handleSseChunk(chunk)
          }
        }
        setStatus('connecting', 'reconnect')
        await sleep(2000)
      } catch (err) {
        if (abort?.signal.aborted) break
        const message = err instanceof Error ? err.message : String(err)
        setStatus('error', message)
        await sleep(5000)
      }
    }
  }

  void run()
}

async function handleSseChunk(chunk: string) {
  const lines = chunk.split('\n')
  let dataLine = ''
  for (const line of lines) {
    if (line.startsWith('data:')) dataLine += line.slice(5).trim()
  }
  if (!dataLine) return
  try {
    const event = JSON.parse(dataLine) as {
      type?: string
      job?: PrintJob
    }
    if (event.type === 'job' && event.job) {
      await processJob(event.job)
    }
  } catch {
    /* ignore malformed */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
