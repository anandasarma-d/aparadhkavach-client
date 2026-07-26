# AparadhKavach Client

React + TypeScript UI for **AparadhKavach** — Crime Intelligence Platform for Karnataka Police (KSP Datathon 2026 MVP-1).

**Live demo:** [https://aparadhkavach.onslate.in/](https://aparadhkavach.onslate.in/)  
**Judge checkout:** default branch `main`, or tag `mvp1-submission-2026-07-26`

```text
Browser (Slate)
      │  HTTPS / CORS
      ▼
API Gateway (AppSail) ──► Analytics · Investigation · Orchestration
```

This repo is **browser → Gateway only**. It never talks to DataStore, Neo4j, or PgVector directly.

---

## What MVP-1 ships

| Surface | Description |
| --- | --- |
| **Sign-In** | Persona picker: Investigator · Analyst · Supervisor · Policymaker (demo capability gate; not Catalyst Auth JWT yet) |
| **Risk lookup** | Accused search → case **RECORD** + QuickML **MODEL ESTIMATE** + **MODEL INPUT** case drivers |
| **Hotspots** | District × crime-type forecast table (sortable; not a map) |
| **Network** | 1–2 hop criminal-neighborhood graph (vis-network) + entity/link tables |
| **Similar cases** | Semantic FIR neighbors (cosine similarity over stored embeddings) |

Role → visible tabs is hard-coded in [`src/rbac/demoRoleMatrix.ts`](src/rbac/demoRoleMatrix.ts).

---

## Stack

- Vite 8 · React 19 · TypeScript · Tailwind CSS 4  
- `vis-network` (lazy-loaded) for K2 graph canvas  

---

## Quick start (local)

```bash
cp .env.example .env
# Set VITE_API_GATEWAY_URL to your AppSail Gateway base URL (no trailing slash)

npm install
npm run dev      # http://localhost:5173 — Vite proxies /v1 → Gateway
npm run build    # tsc --noEmit && vite build
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local UI with `/v1` proxy |
| `npm run build` | Production bundle (Slate) |
| `npm run typecheck` | `tsc --noEmit` |

---

## Related repos

| Repo | Role |
| --- | --- |
| [aparadhkavach-services](https://github.com/anandasarma-d/aparadhkavach-services) | Java AppSail services + Gateway |
| [aparadhkavach-data-generator](https://github.com/anandasarma-d/aparadhkavach-data-generator) | Synthetic corpus, QuickML CSVs, Neo4j/PgVector loaders |

---

## More detail

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — UI surfaces, API paths, RBAC matrix  
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — env, proxy, demo IDs  

---

## Notion MCP (contributors)

Copy `.cursor.mcp.json.example` → `.cursor/mcp.json` with a read-only Notion token. Never commit `.cursor/mcp.json`.
