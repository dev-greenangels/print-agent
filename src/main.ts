import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
} from 'electron'
import * as path from 'path'
import {
  getConfig,
  isRegistered,
  setConfig,
  type PrinterRole,
} from './config'
import { registerAgent } from './nest-api'
import {
  drainPending,
  getRecentLogs,
  onJobLogs,
  sendHeartbeat,
} from './job-runner'
import { listSystemPrinters, printPdfBase64 } from './print-pdf'
import {
  getSseDetail,
  getSseStatus,
  onSseStatus,
  startSse,
  stopSse,
} from './sse'

/** Online presence + printer snapshot; SSE delivers jobs. */
const HEARTBEAT_MS = 3 * 60_000

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

function rendererPath() {
  return path.join(__dirname, '..', 'renderer', 'index.html')
}

function appIcon() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
  const img = nativeImage.createFromPath(iconPath)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

function createWindow() {
  const icon = appIcon()
  mainWindow = new BrowserWindow({
    width: 720,
    height: 780,
    show: true,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void mainWindow.loadFile(rendererPath())
  mainWindow.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createTray() {
  tray = new Tray(appIcon())
  tray.setToolTip('Green Angels Print Agent')
  tray.on('click', () => {
    mainWindow?.show()
  })
  updateTrayMenu()
}

function updateTrayMenu() {
  const status = getSseStatus()
  const menu = Menu.buildFromTemplate([
    { label: `Status: ${status}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Open',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Quit',
      click: () => {
        ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
        app.quit()
      },
    },
  ])
  tray?.setContextMenu(menu)
}

function applyOpenAtLogin(enabled: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
    })
  } catch {
    /* unsupported in some envs */
  }
}

function startBackground() {
  stopSse()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (!isRegistered()) return
  void startSse()
  void sendHeartbeat().catch(() => undefined)
  // One-shot catch-up if jobs were queued while agent was offline.
  void drainPending()
    .catch((err) => {
      console.error('drainPending', err)
    })
    .finally(() => pushUiState())
  heartbeatTimer = setInterval(() => {
    void sendHeartbeat().catch(() => undefined)
  }, HEARTBEAT_MS)
}

function pushUiState() {
  mainWindow?.webContents.send('agent:state', {
    config: sanitizeConfig(),
    sse: getSseStatus(),
    sseDetail: getSseDetail(),
    logs: getRecentLogs(),
    registered: isRegistered(),
  })
}

function sanitizeConfig() {
  const c = getConfig()
  return {
    apiUrl: c.apiUrl,
    agentId: c.agentId,
    name: c.name,
    rolePrinters: c.rolePrinters,
    openAtLogin: c.openAtLogin,
    hasSecret: Boolean(c.secret),
  }
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  applyOpenAtLogin(getConfig().openAtLogin)
  startBackground()
  onSseStatus(() => {
    updateTrayMenu()
    pushUiState()
  })
  onJobLogs(() => pushUiState())

  ipcMain.handle('agent:getState', async () => ({
    config: sanitizeConfig(),
    sse: getSseStatus(),
    sseDetail: getSseDetail(),
    logs: getRecentLogs(),
    registered: isRegistered(),
  }))

  ipcMain.handle('agent:drainPending', async () => {
    await drainPending()
    pushUiState()
    return { ok: true, logs: getRecentLogs() }
  })

  ipcMain.handle('agent:listPrinters', async () => listSystemPrinters())

  ipcMain.handle(
    'agent:register',
    async (_e, payload: { apiUrl: string; code: string; name: string }) => {
      const result = await registerAgent(payload)
      setConfig({
        apiUrl: payload.apiUrl.replace(/\/$/, ''),
        agentId: result.agentId,
        secret: result.secret,
        name: payload.name.trim() || 'Warehouse PC',
      })
      startBackground()
      pushUiState()
      return { ok: true, agentId: result.agentId }
    },
  )

  ipcMain.handle(
    'agent:saveSettings',
    async (
      _e,
      payload: {
        rolePrinters?: Partial<Record<PrinterRole, string>>
        openAtLogin?: boolean
        name?: string
      },
    ) => {
      const next = setConfig({
        rolePrinters: payload.rolePrinters,
        openAtLogin: payload.openAtLogin,
        name: payload.name,
      })
      if (payload.openAtLogin !== undefined) applyOpenAtLogin(payload.openAtLogin)
      void sendHeartbeat().catch(() => undefined)
      pushUiState()
      return next
    },
  )

  ipcMain.handle('agent:disconnect', async () => {
    stopSse()
    setConfig({ agentId: '', secret: '', apiUrl: getConfig().apiUrl })
    pushUiState()
    return { ok: true }
  })

  ipcMain.handle(
    'agent:testPrint',
    async (_e, payload: { role: PrinterRole }) => {
      const printer = getConfig().rolePrinters[payload.role]
      if (!printer) throw new Error('Принтер для ролі не обрано')
      // Minimal blank PDF
      const minimalPdf =
        'JVBERi0xLjAKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDIwMCAxMDBdL1BhcmVudCAyIDAgUj4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA0L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMjA0CiUlRU9GCg=='
      await printPdfBase64(minimalPdf, printer)
      return { ok: true }
    },
  )

  ipcMain.handle('agent:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })
})

app.on('window-all-closed', () => {
  /* keep tray alive */
})

app.on('before-quit', () => {
  ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
  stopSse()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
})
