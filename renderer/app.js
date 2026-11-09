const api = window.printAgent

const sseDot = document.getElementById('sseDot')
const sseLabel = document.getElementById('sseLabel')
const agentMeta = document.getElementById('agentMeta')
const registerErr = document.getElementById('registerErr')
const logsEl = document.getElementById('logs')
const printerCarrier = document.getElementById('printerCarrier')
const printerPlant = document.getElementById('printerPlant')
const openAtLogin = document.getElementById('openAtLogin')
const apiUrl = document.getElementById('apiUrl')
const code = document.getElementById('code')
const codeLabel = document.getElementById('codeLabel')
const nameInput = document.getElementById('name')
const registerBtn = document.getElementById('registerBtn')
const reregisterBtn = document.getElementById('reregisterBtn')
const registeredHint = document.getElementById('registeredHint')
const registerTitle = document.getElementById('registerTitle')

function fillPrinterSelect(select, printers, selected) {
  select.innerHTML = ''
  const empty = document.createElement('option')
  empty.value = ''
  empty.textContent = '— не обрано —'
  select.appendChild(empty)
  for (const p of printers) {
    const opt = document.createElement('option')
    opt.value = p
    opt.textContent = p
    if (p === selected) opt.selected = true
    select.appendChild(opt)
  }
}

function setRegisteredUi(registered) {
  registerBtn.disabled = registered
  registerBtn.hidden = registered
  reregisterBtn.hidden = !registered
  registeredHint.hidden = !registered
  codeLabel.style.opacity = registered ? '0.55' : '1'
  code.disabled = registered
  apiUrl.disabled = registered
  registerTitle.textContent = registered ? 'Реєстрація (активна)' : 'Реєстрація'
}

function renderState(state) {
  const cfg = state.config || {}
  const sse = state.sse || 'disconnected'
  const detail = state.sseDetail ? ` — ${state.sseDetail}` : ''
  sseLabel.textContent = sse + detail
  sseDot.className =
    'dot ' + (sse === 'connected' ? 'ok' : sse === 'error' ? 'err' : 'warn')
  agentMeta.textContent = state.registered
    ? `${cfg.name || 'Agent'} · ${cfg.agentId || ''} · ${cfg.apiUrl}`
    : 'Не зареєстровано'
  if (cfg.apiUrl && !apiUrl.value) apiUrl.value = cfg.apiUrl
  if (cfg.name && !nameInput.value) nameInput.value = cfg.name
  openAtLogin.checked = Boolean(cfg.openAtLogin)
  setRegisteredUi(Boolean(state.registered))
  logsEl.innerHTML = ''
  for (const log of state.logs || []) {
    const div = document.createElement('div')
    div.className = 'log ' + (log.ok ? 'ok' : 'bad')
    div.textContent = `${log.at} · ${log.role} · ${log.message}`
    logsEl.appendChild(div)
  }
}

async function refreshPrinters(state) {
  const printers = await api.listPrinters()
  const roles = state?.config?.rolePrinters || {}
  fillPrinterSelect(printerCarrier, printers, roles['carrier-label'] || '')
  fillPrinterSelect(printerPlant, printers, roles['plant-label'] || '')
}

async function boot() {
  const state = await api.getState()
  renderState(state)
  await refreshPrinters(state)
}

async function doRegister() {
  registerErr.textContent = ''
  try {
    await api.register({
      apiUrl: apiUrl.value.trim(),
      code: code.value.trim(),
      name: nameInput.value.trim() || 'Warehouse PC',
    })
    code.value = ''
    await boot()
  } catch (e) {
    registerErr.textContent = e?.message || String(e)
  }
}

registerBtn.onclick = () => void doRegister()

reregisterBtn.onclick = () => {
  setRegisteredUi(false)
  code.disabled = false
  apiUrl.disabled = false
  code.focus()
  registerErr.textContent =
    'Введіть новий код привʼязки з бекофісу і натисніть «Зареєструвати».'
  registerBtn.hidden = false
  registerBtn.disabled = false
  reregisterBtn.hidden = true
}

document.getElementById('saveBtn').onclick = async () => {
  await api.saveSettings({
    openAtLogin: openAtLogin.checked,
    name: nameInput.value.trim(),
    rolePrinters: {
      'carrier-label': printerCarrier.value || undefined,
      'plant-label': printerPlant.value || undefined,
    },
  })
  await boot()
}

document.getElementById('disconnectBtn').onclick = async () => {
  await api.disconnect()
  await boot()
}

document.getElementById('testCarrier').onclick = async () => {
  try {
    await api.saveSettings({
      rolePrinters: { 'carrier-label': printerCarrier.value || undefined },
    })
    await api.testPrint({ role: 'carrier-label' })
  } catch (e) {
    alert(e?.message || String(e))
  }
}

document.getElementById('testPlant').onclick = async () => {
  try {
    await api.saveSettings({
      rolePrinters: { 'plant-label': printerPlant.value || undefined },
    })
    await api.testPrint({ role: 'plant-label' })
  } catch (e) {
    alert(e?.message || String(e))
  }
}

document.getElementById('drainBtn').onclick = async () => {
  try {
    await api.drainPending()
    await boot()
  } catch (e) {
    alert(e?.message || String(e))
  }
}

api.onState((state) => {
  renderState(state)
})

boot()
