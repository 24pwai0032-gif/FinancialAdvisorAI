# MoneyWealth AI — Frontend

The web product: marketing site, the authenticated app, and the admin console.
**Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4.** Deployed on
Vercel; it talks to the FastAPI backend through a same-origin **BFF**.

> ⚠️ This is Next.js **16** — APIs differ from older versions (`proxy.ts` replaces
> `middleware.ts`, `cookies()`/route `params` are async). See `AGENTS.md`.

## Stack

- **Framework:** Next.js 16 (App Router, React Server Components, Turbopack), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4 — CSS-first design tokens in `src/app/globals.css` (`@theme`), full **light + dark** themes ("Emerald Calm") that flip from one place via `.dark` on `<html>`
- **Data:** TanStack Query (server state) · **zod** (validation)
- **UI:** Radix (dialogs), lucide-react (icons), sonner (toasts), **motion** (animation), react-markdown + remark-gfm (advisor), react-plaid-link
- **Analytics:** posthog-js (consent-gated)
- **Testing:** Vitest + Testing Library (unit) · Playwright + axe-core (e2e + a11y)

## Architecture — BFF (Backend-for-Frontend)

The browser **only** talks to Next. Route handlers proxy to the backend server-side:

- `src/app/api/auth/*` — login/logout/refresh/verify (sets the first-party httpOnly refresh cookie)
- `src/app/api/backend/[...path]` — authenticated proxy to the FastAPI API
- Access token lives **in memory**; the refresh token is an httpOnly, `SameSite=Lax`
  cookie scoped to `/api/auth`. `API_BASE_URL` is **server-only** (never `NEXT_PUBLIC_`).
- Strict **nonce-based CSP** (`src/proxy.ts`) + security headers (`next.config.ts`).

## Getting started

```bash
npm install
echo "API_BASE_URL=http://localhost:8000" > .env.local   # the backend origin
echo "NEXT_PUBLIC_APP_URL=http://localhost:3100" >> .env.local
npm run dev                                               # http://localhost:3100
```

The backend must be running (see [../backend/README.md](../backend/README.md)).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit/component tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright e2e + axe a11y |

## Project structure

```
src/
  app/
    (marketing)/        landing, pricing, security, about, legal — dark cinematic hero
    (auth)/             login, signup, reset, verify
    app/                authenticated product: dashboard, accounts, transactions,
                        budgets, goals, debt, portfolio, advisor, notifications, settings
    admin/              admin console (separate identity): users, AI ops, Plaid, flags, outbox, audit
    api/                BFF route handlers (auth + backend proxy)
    globals.css         design tokens (@theme) + light/dark themes + keyframes
    layout.tsx          fonts, metadata, no-flash theme script, ambient backdrop
  components/
    ui/                 design-system primitives (button, panel, money, money-input, dialog, theme-toggle, …)
    advisor/ billing/ marketing/ shell/ visual/   feature + chrome components
  lib/
    api/                typed hooks per domain (budgets, goals, plaid, advisor, …)
    auth/  theme/  validation.ts  utils.ts
  proxy.ts              CSP nonce middleware
e2e/                    Playwright specs (app, admin, marketing, a11y)
```

## Design system & theming

All color/spacing/radius are **tokens** in `globals.css`. Light is the default; `.dark`
on `<html>` flips every token (set before first paint by an inline theme script → no
flash). Money renders via `<Money>`/`<MoneyInput>` with tabular figures and semantic
+/- coloring (emerald / burnt-orange, colorblind-safe). Motion respects
`prefers-reduced-motion`.

## Deploy

Production runs on **Vercel**. Merges to `main` auto-deploy via
`.github/workflows/deploy-frontend.yml` (token-based; needs the `VERCEL_TOKEN` repo
secret). `API_BASE_URL` (server-only) points at the backend; `NEXT_PUBLIC_APP_URL` is the
public site URL.
