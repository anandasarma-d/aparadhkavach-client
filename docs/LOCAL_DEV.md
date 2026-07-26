# Local development — client

## Environment

```bash
cp .env.example .env
```

| Variable | Meaning |
| --- | --- |
| `VITE_API_GATEWAY_URL` | AppSail Gateway base URL, **no trailing slash**. Baked in at build time for Slate; used as proxy target in `npm run dev`. |

Never commit `.env`.

## Demo entities (rehearsed)

| Feature | Example IDs |
| --- | --- |
| Risk / Network | `ACC-00031`, `ACC-00037`, `ACC-00040`, `ACC-00044`, `ACC-00046` |
| Similar cases | `FIR-002683`, `FIR-003276`, `FIR-002729`, `FIR-001676`, `FIR-001018` |

Chips on Similar Cases and accused search helpers point at seeded corpus IDs.

## CORS

The Gateway must allow the Slate origin (`https://aparadhkavach.onslate.in`) and local Vite origins. That is configured on AppSail / Gateway env — not in this repo’s committed placeholders.
