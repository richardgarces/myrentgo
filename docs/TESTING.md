# Testing — MyRent Go

This document describes how to run unit and end-to-end tests for the backend (Go) and frontend (React/Vite).

## Quick reference

| Suite | Command | Location |
|-------|---------|----------|
| Backend unit tests | `cd backend && go test ./...` | Go packages under `backend/` |
| Frontend unit tests | `cd frontend && npm run test:unit` | Vitest + Testing Library |
| E2E (Playwright) | `cd frontend && npm run test:e2e` | Browser tests against `:4000` + `:7070` |
| All frontend tests | `cd frontend && npm test` | Alias for `test:unit` |

## Prerequisites

- **Go 1.23+** for backend tests
- **Node 22+** for frontend unit and E2E tests
- **MongoDB** running on `localhost:27017` for E2E and optional integration tests (same as `docker compose up mongodb`)
- **Playwright browsers** (first run only): `cd frontend && npx playwright install chromium`

## Backend unit tests

Backend tests use the standard library (`testing`) with table-driven cases and in-memory mocks. No testify dependency.

```bash
cd backend
go test ./... -v
```

With race detector and coverage (matches CI):

```bash
MONGODB_URI=mongodb://localhost:27017 MONGODB_DATABASE=myrent_test \
  go test ./... -race -coverprofile=coverage.out
go vet ./...
```

### Covered packages

| Package | Focus |
|---------|--------|
| `internal/application/auth` | Login, register, MFA challenge, admin alias |
| `internal/application/teamusers` | Create/update/remove, role guards |
| `internal/application/mfa` | TOTP setup, enable, verify login, disable |
| `internal/application/password` | Change/reset/forgot password, PIN tokens |
| `internal/application/emailverify` | Invite verification tokens |
| `internal/domain/passwordreset` | Token validity |
| `internal/domain/emailverification` | Token validity |
| `internal/infrastructure/storage` | Upload size limits, data URL parsing, save/read |
| `internal/interfaces/http/handlers` | Document error helpers |
| `internal/application/emailnotify` | Recipient deduplication |
| `internal/domain/property`, `mortgage` | Domain model basics |

Property completeness scoring lives in the frontend (`src/lib/property-completeness.ts`) and is tested with Vitest.

## Frontend unit tests

Vitest is configured in `frontend/vitest.config.ts` with jsdom and React Testing Library.

```bash
cd frontend
npm ci
npm run test:unit          # single run
npm run test:unit:watch    # watch mode
```

### Covered modules

- `src/lib/document-utils.test.ts` — file size limits, labels, MIME helpers
- `src/lib/payment-banks.test.ts` — bank option building and resolution
- `src/lib/property-completeness.test.ts` — completeness scoring
- `src/components/PasswordInput.test.tsx` — show/hide password toggle
- `src/hooks/useViewMode.test.tsx` — localStorage and URL sync

## E2E tests (Playwright)

E2E tests assume:

- Frontend dev server: **http://localhost:4000**
- API: **http://localhost:7070** (proxied via Vite as `/api`)

### Option A — reuse running stack (recommended locally)

Start MongoDB + API + frontend, then run Playwright without starting servers:

```bash
docker compose up -d mongodb
# Terminal 1: backend
cd backend && go run ./cmd/api
# Terminal 2: frontend
cd frontend && npm run dev
# Terminal 3: E2E
cd frontend && E2E_SKIP_WEBSERVER=1 npm run test:e2e
```

Or use the full stack:

```bash
docker compose up -d
cd frontend && E2E_SKIP_WEBSERVER=1 npm run test:e2e
```

### Option B — Playwright starts servers

If MongoDB is already running, Playwright can start the API and Vite dev server automatically:

```bash
cd frontend
npm run test:e2e
```

### E2E scenarios

| Spec | Scenarios |
|------|-----------|
| `e2e/auth.spec.ts` | Login (`admin` / `admin123`, **skipped** if API down), forgot-password dialog, MFA step UI (mocked) |
| `e2e/pages.spec.ts` | Properties, Documents, Settings team users (uses real API when available, otherwise mocked responses) |

When the API on `:7070` is not running, authenticated page tests still pass using Playwright route mocks. The full login integration test runs only when `GET /health` on the API succeeds.

Interactive debugging:

```bash
cd frontend && npm run test:e2e:ui
```

## CI

GitHub Actions runs `go test ./... -race` for the backend and `npm run build` for the frontend. Unit and E2E npm scripts are available locally; E2E is not yet wired into CI (requires MongoDB + running services).

See also [docs/ci-github/README.md](./ci-github/README.md).

## Skipped / out of scope

- MongoDB repository integration tests (mocked at service layer)
- Full MFA activation E2E (requires TOTP app; login MFA step is UI-tested with API mock)
- Email SMTP delivery (mailer mocked in unit tests)
- ESLint in test pipeline (`npm run lint` separately)
