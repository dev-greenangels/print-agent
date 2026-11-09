# Green Angels Print Agent

Desktop utility (Windows / macOS / Linux) that registers with Nest, listens for print jobs over **SSE**, and silently prints PDFs to role-mapped OS printers.

## Roles

| Role | Use |
|------|-----|
| `carrier-label` | Packeta TTN PDF (format/offset from Nest Packeta settings) |
| `plant-label` | Plant stickers (PDF/image from plant-stock) |

## Setup

1. Backoffice → **Print Agent** → create pairing code.
2. Install this app on the warehouse PC.
3. Enter Nest API URL + pairing code → Register.
4. Map OS printers to roles → Save.
5. In plant-stock → menu **Print Agent** → select this agent.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run pack:win
# npm run pack:mac
# npm run pack:linux
```

Code signing is optional for internal warehouse installs (Windows SmartScreen may warn).

## Protocol

- `POST /print-agent/register` — pairing
- `POST /print-agent/heartbeat` — printers + online
- `GET /print-agent/events` — SSE (headers `X-Print-Agent-Id` / `X-Print-Agent-Secret`)
- `POST /print-agent/jobs/:id/claim|ack`

See `DEC-PRINT-AGENT-001.md` in the monorepo.
