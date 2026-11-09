import Store from 'electron-store'

export type PrinterRole = 'carrier-label' | 'plant-label'

export type AgentConfig = {
  apiUrl: string
  agentId: string
  secret: string
  name: string
  /** role → OS printer name */
  rolePrinters: Partial<Record<PrinterRole, string>>
  openAtLogin: boolean
}

const defaults: AgentConfig = {
  apiUrl: '',
  agentId: '',
  secret: '',
  name: '',
  rolePrinters: {},
  openAtLogin: true,
}

export const store = new Store<AgentConfig>({
  name: 'print-agent-config',
  defaults,
})

export function getConfig(): AgentConfig {
  return {
    ...defaults,
    ...store.store,
    rolePrinters: { ...defaults.rolePrinters, ...(store.get('rolePrinters') || {}) },
  }
}

export function setConfig(patch: Partial<AgentConfig>) {
  const next = { ...getConfig(), ...patch }
  if (patch.rolePrinters) {
    next.rolePrinters = { ...getConfig().rolePrinters, ...patch.rolePrinters }
  }
  store.store = next
  return next
}

export function isRegistered(): boolean {
  const c = getConfig()
  return Boolean(c.apiUrl && c.agentId && c.secret)
}
