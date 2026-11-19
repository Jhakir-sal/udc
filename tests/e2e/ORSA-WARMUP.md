# ORSA expanded warmup regression checks

These checks are separate from monthly sequence scheduling and opt-out tests.

- `npm run test:orsa-warmup`: evaluator and real Express PUT validation with
  stubbed persistence. No email provider, actual warmup settings, or database
  writes are used by the route test.
- `npm run test:orsa-warmup:db`: explicit opt-in development database checks.
  Each scenario uses a unique `test-*` settings/attempt scope and deletes only
  that scope in `finally`. A separate Node process proves that pacing and budgets
  are shared across instances, not merely protected by a local in-memory lock.
  The suite and worker refuse production/deployment mode. Use development
  database configuration only; never point this command at a production database.
- `npm run test:e2e:orsa-warmup`: requires the development app running on port
  5000 (or `PLAYWRIGHT_BASE_URL`). Every API request is intercepted; only a fake
  warmup PUT is accepted, all other writes and send/preview/confirm requests are
  blocked and asserted absent. No credentials, live roster, or email are used.
  In Replit's Nix shell, set `PLAYWRIGHT_EXECUTABLE_PATH` to the installed
  Nix-wrapped Chromium executable if the downloaded browser lacks native libraries.

The DB fixtures seed reservations and advance their timestamps/spacing deadlines
instead of sleeping through an hour or a day. Existing failed and unused claims
continue to count. Daily review must survive rolling-window expiry; only an
explicit reviewed settings save can release it.
