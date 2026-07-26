# Client architecture (MVP-1)

## High-level

```text
┌─────────────────────────────────────────────────────────────┐
│  Slate / Vite — aparadhkavach-client                        │
│  LoginPage · Risk · Hotspots · Network · Similar            │
└───────────────────────────┬─────────────────────────────────┘
                            │  GET/POST /v1/**  (+ CORS)
┌───────────────────────────▼─────────────────────────────────┐
│  api-gateway-service (AppSail)                              │
└─┬──────────────────┬────────────────────┬───────────────────┘
  │                  │                    │
  ▼                  ▼                    ▼
Analytics      Investigation        Orchestration
hotspots       riskProfile          network · similarCases
```

## API calls (via `VITE_API_GATEWAY_URL`)

| UI | Gateway path (conceptual) |
| --- | --- |
| Risk lookup | `GET /v1/accusedPersons/{id}:riskProfile` |
| Hotspots | `GET /v1/analytics/hotspots` |
| Network | `GET /v1/entities/{id}/network?depth=1\|2` |
| Similar cases | `GET /v1/firs/{firId}/similarCases?limit=` |

Client code lives under `src/api/*`. Locally, Vite proxies same-origin `/v1` to the Gateway URL so both `localhost` and `127.0.0.1` work.

## RBAC (Approach A — demo)

Single source of truth: `src/rbac/demoRoleMatrix.ts`.

| Role | Tabs |
| --- | --- |
| Investigator | Risk · Network · Similar |
| Analyst | Hotspots · Risk |
| Supervisor | Risk · Hotspots · Network · Similar |
| Policymaker | Hotspots only |

`Show network →` / `Find similar →` are passed only when the role may open that surface. Logout returns to the Sign-In gate (no JWT session store).

## Provenance labelling

UI chips distinguish **RECORD** (DataStore case facts), **MODEL ESTIMATE** (QuickML scores), and **MODEL INPUT** (case drivers). Do not invent SHAP weights in the UI.
