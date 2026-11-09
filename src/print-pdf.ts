import { app } from 'electron'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function listSystemPrinters(): Promise<string[]> {
  if (process.platform === 'win32') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getPrinters } = require('pdf-to-printer') as {
        getPrinters: () => Promise<Array<{ name: string }>>
      }
      const printers = await getPrinters()
      return printers.map((p) => p.name).filter(Boolean)
    } catch {
      return []
    }
  }
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const { stdout } = await execFileAsync('lpstat', ['-a'])
      return stdout
        .split('\n')
        .map((line) => line.split(' ')[0]?.trim())
        .filter((n): n is string => Boolean(n))
    } catch {
      return []
    }
  }
  return []
}

export async function printPdfBase64(
  pdfBase64: string,
  printerName: string,
): Promise<void> {
  const buf = Buffer.from(pdfBase64.replace(/\s+/g, ''), 'base64')
  if (!buf.length) throw new Error('Порожній PDF')
  const tmp = path.join(
    app.getPath('temp') || os.tmpdir(),
    `ga-label-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
  )
  await fs.writeFile(tmp, buf)
  try {
    if (process.platform === 'win32') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { print } = require('pdf-to-printer') as {
        print: (file: string, opts: { printer: string; silent?: boolean }) => Promise<void>
      }
      await print(tmp, { printer: printerName, silent: true })
      return
    }
    if (process.platform === 'darwin' || process.platform === 'linux') {
      await execFileAsync('lp', ['-d', printerName, '-o', 'fit-to-page', tmp])
      return
    }
    throw new Error(`Друк не підтримано на ${process.platform}`)
  } finally {
    void fs.unlink(tmp).catch(() => undefined)
  }
}
