import {
  ackJob,
  claimJob,
  fetchPendingJobs,
  heartbeat,
  type PrintJob,
} from './nest-api'
import { getConfig, type PrinterRole } from './config'
import { printPdfBase64 } from './print-pdf'

export type JobLog = {
  at: string
  jobId: string
  role: string
  ok: boolean
  message: string
}

type LogListener = (logs: JobLog[]) => void

const recent: JobLog[] = []
const seen = new Set<string>()
const logListeners = new Set<LogListener>()

export function getRecentLogs(): JobLog[] {
  return [...recent].slice(0, 30)
}

export function onJobLogs(fn: LogListener) {
  logListeners.add(fn)
  return () => logListeners.delete(fn)
}

function pushLog(entry: JobLog) {
  recent.unshift(entry)
  if (recent.length > 50) recent.pop()
  for (const fn of logListeners) fn(getRecentLogs())
}

function printerForRole(role: string): string | null {
  const map = getConfig().rolePrinters
  if (role === 'carrier-label' || role === 'plant-label') {
    return map[role as PrinterRole] || null
  }
  return null
}

export async function sendHeartbeat() {
  const c = getConfig()
  const printers = Object.entries(c.rolePrinters)
    .filter(([, name]) => Boolean(name))
    .map(([role, name]) => ({ name: name!, role }))
  // Also report unassigned names? Agent UI lists OS printers separately.
  return heartbeat(printers)
}

export async function processJob(job: PrintJob): Promise<void> {
  if (seen.has(job.id) && job.status === 'printed') return
  if (job.status === 'printed' || job.status === 'failed') {
    seen.add(job.id)
    return
  }

  try {
    const claimed = await claimJob(job.id)
    if (claimed.status === 'printed') {
      seen.add(job.id)
      return
    }
    const pdf = claimed.pdfBase64 || job.pdfBase64
    if (!pdf) {
      await ackJob(job.id, false, 'Немає PDF у завданні')
      pushLog({
        at: new Date().toISOString(),
        jobId: job.id,
        role: job.role,
        ok: false,
        message: 'Немає PDF',
      })
      seen.add(job.id)
      return
    }
    const printer = printerForRole(claimed.role || job.role)
    if (!printer) {
      await ackJob(
        job.id,
        false,
        `Не призначено принтер для ролі ${claimed.role || job.role}`,
      )
      pushLog({
        at: new Date().toISOString(),
        jobId: job.id,
        role: job.role,
        ok: false,
        message: 'Немає принтера для ролі',
      })
      seen.add(job.id)
      return
    }
    await printPdfBase64(pdf, printer)
    await ackJob(job.id, true)
    pushLog({
      at: new Date().toISOString(),
      jobId: job.id,
      role: job.role,
      ok: true,
      message: `Надруковано на ${printer}`,
    })
    seen.add(job.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await ackJob(job.id, false, message.slice(0, 500))
    } catch {
      /* ignore */
    }
    pushLog({
      at: new Date().toISOString(),
      jobId: job.id,
      role: job.role,
      ok: false,
      message,
    })
    seen.add(job.id)
  }
}

export async function drainPending() {
  let jobs: PrintJob[]
  try {
    jobs = await fetchPendingJobs()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    pushLog({
      at: new Date().toISOString(),
      jobId: '-',
      role: '-',
      ok: false,
      message: `pending: ${message}`,
    })
    throw err
  }
  if (jobs.length === 0) {
    pushLog({
      at: new Date().toISOString(),
      jobId: '-',
      role: '-',
      ok: true,
      message: 'pending: 0 (черга порожня для цього агента)',
    })
    return
  }
  pushLog({
    at: new Date().toISOString(),
    jobId: '-',
    role: '-',
    ok: true,
    message: `pending: забираю ${jobs.length}`,
  })
  for (const job of jobs) {
    await processJob(job)
  }
}
