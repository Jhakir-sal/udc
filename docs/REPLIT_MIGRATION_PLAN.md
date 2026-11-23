# Replit De-coupling & Azure Migration Plan (udc)

> Objective: remove all Replit-specific code, dependencies, env vars, and folder names from the `udc` codebase, while preserving every user-facing feature (auth, Stripe, SendGrid email, RingCentral/Twilio SMS, object storage, OCR/NER/voice AI, ORSA outreach), then deploy to Azure. Modeled on the sibling [ner](https://github.com/Jhakir-sal/ner) migration ([ner/docs/REPLIT_MIGRATION_PLAN.md](https://github.com/Jhakir-sal/ner/blob/main/docs/REPLIT_MIGRATION_PLAN.md)), adapted for UDC's larger surface area and the extra integrations it has that NER didn't (object storage, ffmpeg, SendGrid, RingCentral, a cross-app dependency on NER itself).

Status legend: ✅ done · ⏳ planned (this doc) · ⚠️ requires a product/ops decision · 🔴 blocker

For provider setup and local testing precautions before Phase 4, see
[LOCAL_INTEGRATIONS.md](./LOCAL_INTEGRATIONS.md).

---

## 0. Already complete (Phase 0–1)

- **Phase 0 — Pre-flight scrub:**
  - Removed ~45 unused Replit-agent session artifacts from `attached_assets/` (screenshots, pasted text dumps, duplicate logos, and a CSV containing real member PII — `SALCustomers312_...csv`) that were never referenced by app code or the build. Verified by cross-referencing every file against `client/server/shared/script/docs/tests` across **all** file types, not just `.ts`/`.tsx` — this caught one CSS `url()` reference (`end-of-life-concierge-hands.jpg` in [concierge.css](../client/src/pages/concierge.css)) that a naive TS-only grep would have missed and broken. Archived (not permanently deleted) to `~/Developer/udc-archived-assets/` outside the repo for manual review/deletion.
  - Archived non-source business collateral (`marketing/`, `deliverables/`, `screenshots/`, `vendor_estimate_package/`, unused `previews/*`) outside the repo — these were never application source.
  - Removed unused Replit Python scaffolding (`main.py`, `pyproject.toml`, `uv.lock` — the default `uv init` template, zero references anywhere in `server`/`client`/`shared`/`script`).
  - Fixed a **critical security issue** in [server/seed.ts](../server/seed.ts): `ensureAdminUsers()` seeded a hardcoded admin password on every boot via raw-SQL string interpolation. Replaced with parameterized `sql` tagged-template queries and an opt-in `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` env-var gate — no password is hardcoded in source anymore.
  - Regenerated `package-lock.json` — the committed lockfile resolved **210 packages** through `http://package-firewall.replit.internal`, Replit's internal npm proxy, which made `npm install` fail outside Replit entirely (`ENOTFOUND package-firewall.replit.internal`). This wasn't on the original coupling inventory and would have blocked Phase 1 for anyone who didn't already have it cached.
- **Phase 1 — Git & baseline:** `git init`, `.gitignore`, `npm install`, baseline captured:
  - `npm run check` (tsc): pre-existing errors cataloged in §1 below — **not** fixed yet (out of scope for a Replit-decoupling pass except where the error is *in* code getting deleted/moved).
  - `npm run build`: passes (needs `PRODUCTION_SITE_URL` set at build time — see §1.5).
  - `npm test`: **76 pass / 11 fail**, baseline log in `/tmp/udc-test-baseline.log` (ephemeral). All 11 failures are `Error: DATABASE_URL environment variable is not set` thrown at import time by [server/db.ts](../server/db.ts) — expected with no Postgres yet, not a code regression. Re-run once Phase 13 wires a CI Postgres service.
  - Separately, got the app running locally end-to-end: a dedicated `udc-postgres` Docker container, Node 22 LTS (several deps require ≥20.16/22 — Node 20.12 crashed on boot with `DOMMatrix is not defined` in `pdfjs-dist`), and a small platform-compatibility fix in [server/index.ts](../server/index.ts) (`httpServer.listen({ reusePort: true })` reports `ENOTSUP` on some macOS/Node combinations — now falls back to a plain `listen()`, a no-op on platforms like production Linux where `reusePort` works). Verified live: register/login/auth-gating/DB writes all work against a real Postgres instance.
- **Phase 2 — Delete unused scaffolding:** done, see §Phase 2 below for exactly what was (and, importantly, was **not**) deleted, and the pre-existing test failures it surfaced (not caused by it).
- **Phase 3 — Remove Replit Vite plugins:** done, see §Phase 3 below.

---

## 1. Inventory of Replit coupling

### 1.1 Auth (OIDC)

| File | What it does | Replit dependency |
|---|---|---|
| [server/auth/session.ts](../server/auth/session.ts) | Session + Passport setup, preserves `GET /api/login`, `GET /api/callback`, `GET /api/logout`, and exports `isAuthenticated`/`establishPasswordSession` | Entra OIDC is opt-in via `AUTH_ENABLE_ENTRA_ID` and `OIDC_*` settings |
| [server/auth/index.ts](../server/auth/index.ts) | Re-exports session, password login, storage, and auth routes | none |
| [server/auth/passwordLogin.ts](../server/auth/passwordLogin.ts) | Email/password login with MFA and rate limiting | none |
| [server/auth/storage.ts](../server/auth/storage.ts) | Drizzle CRUD for `users` | none |
| [server/auth/routes.ts](../server/auth/routes.ts) | `/api/auth/user` and `/api/auth/providers` | none |
| [server/auth/strategies/oidc.ts](../server/auth/strategies/oidc.ts) | Tenant-pinned Microsoft Entra OIDC; existing verified accounts only | `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL` |
| [server/routes.ts](../server/routes.ts) | Imports the shared auth module | none |

**⚠️ Frontend URL contract — more rigid than NER's.** Unlike NER (which exposes `/api/auth/*`), UDC's frontend is hardwired to three bare paths in multiple components:

| Path | Linked from |
|---|---|
| `GET /api/login` | [client/src/pages/login.tsx:258](../client/src/pages/login.tsx) — "Continue with SSO" button |
| `GET /api/logout` | [client/src/components/app-sidebar.tsx](../client/src/components/app-sidebar.tsx) (×2), [client/src/hooks/use-auth.ts:31](../client/src/hooks/use-auth.ts), [client/src/pages/heartplan/advisor.tsx:101](../client/src/pages/heartplan/advisor.tsx) |
| `GET /api/callback` | OIDC redirect target only (not linked from client code) |

→ **These three exact paths must keep working** after the auth swap — do not rename them the way NER moved SSO to `/api/auth/entra/*`. Easiest path: keep `/api/login` → redirects into the Entra OIDC flow (or, if SSO isn't needed, straight to `/auth`), keep `/api/logout` doing what it already does (destroy session, and if it was an SSO session, hit the IdP's end-session endpoint), keep `/api/callback` as the OIDC callback.

`POST /api/auth/login` (password login, mounted at [server/routes.ts:1636](../server/routes.ts)) and `POST /api/auth/register` are separate, already vendor-neutral, and unaffected.

### 1.2 Stripe secrets

| File | What it does | Replit dependency |
|---|---|---|
| [server/stripeClient.ts](../server/stripeClient.ts) | `getStripeClient()` and `getStripeIdentityClient()` use `STRIPE_SECRET_KEY` | Removed in Phase 4 |

This is **less work than NER** — the direct `STRIPE_SECRET_KEY` fallback already existed. Phase 4 removed the Replit Connector lookup so both Stripe clients now use only the environment key.

### 1.3 Object storage — **UDC-specific, NER didn't have this**

| File | What it does | Replit dependency |
|---|---|---|
| [server/integrations/object-storage/objectStorage.ts](../server/integrations/object-storage/objectStorage.ts) | `ObjectStorageService` now uses Azure Blob Storage; the original Replit sidecar and GCS dependency were replaced in Phase 6. | Removed in Phase 6 |
| [server/integrations/object-storage/objectAcl.ts](../server/integrations/object-storage/objectAcl.ts) | ACL policy model using Azure Blob metadata. | Removed in Phase 6 |
| [server/integrations/object-storage/routes.ts](../server/integrations/object-storage/routes.ts) | `registerObjectStorageRoutes()` provides the upload-URL endpoint and fallback object-serving route after the inline authorization middleware in `routes.ts`. | Preserved and moved in Phase 9 |

**Real consumers** (23 call sites in [server/routes.ts](../server/routes.ts)) use `ObjectStorageService` directly for: death-certificate uploads, family documents, HeartPlan document vault, HeartPlan sealed legacy messages (audio/video), company upload packages. This is load-bearing across most of the app's file-upload surface.

### 1.4 AI Gateway — initial inventory (migrated in Phase 7)

Originally these read `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` instead of calling OpenAI directly:

| File | Line(s) | Feature |
|---|---|---|
| [server/routes.ts](../server/routes.ts) | 475, 4245-46, 4690-91, 5890-91, 8600-01, 9302-03 | Death-certificate OCR/verification, NER entity extraction, misc AI endpoints |
| [server/accountEmailIntake.ts](../server/accountEmailIntake.ts) | 29, 32-33 | Parses inbound company-reply emails |
| [server/hardAssetValuation.ts](../server/hardAssetValuation.ts) | 133-134, 137 | Appraises hard assets from photos |
| [server/integrations/audio/client.ts](../server/integrations/audio/client.ts) | — | Voice chat / TTS / STT (only `speechToText`/`inspectMedia` are used by the app) |
| Former Replit chat and image integrations | — | **Dead scaffolding**, deleted in Phase 2, not migrated |

### 1.5 Env vars used as production/deployment gates in *business logic* — 🔴 the sharpest edge in this migration

This is the one category NER's migration never had to deal with. `REPLIT_DEPLOYMENT === "1"` isn't just auth/stripe scaffolding here — it's used as a **safety interlock that prevents real campaign emails/SMS from going out to real credit-union members and family contacts from a non-published environment**:

| File | Line | What breaks if `REPLIT_DEPLOYMENT` is simply absent (Azure default) |
|---|---|---|
| [server/routes.ts:792,826](../server/routes.ts) | campaign-delivery gate | `isProductionCampaignEnvironment` / this check permanently evaluates `false` → **ORSA email campaigns silently never send in production** |
| [server/orsaBulkSmsWorker.ts:9](../server/orsaBulkSmsWorker.ts) | `liveDelivery()` | Bulk SMS to credit-union members silently never sends |
| [server/orsaEmailCampaign.ts:160](../server/orsaEmailCampaign.ts) | `isProductionCampaignEnvironment()` | Same |
| [server/outreachRoutes.ts:85](../server/outreachRoutes.ts) | `isPublished` | Outreach "publish" gating breaks |
| [server/test-fixtures/orsa-warmup-reserve.ts:6](../server/test-fixtures/orsa-warmup-reserve.ts) | same pattern | Test fixture guard, lower risk |
| [server/email.ts:18-25](../server/email.ts) | `getAppUrl()` | Builds email link URLs from `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN` → **every transactional/campaign email link points at `http://localhost:5000` in production** if left unfixed |

**Phase 10 replacement:** all campaign gates use a shared, fail-closed check:

```ts
// server/deploymentEnv.ts
export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === "production" &&
    process.env.WEBSITE_SLOT_NAME?.toLowerCase() === "production";
}
```

Unlike the original proposal, an unset slot is **not** treated as production:
`npm start` and containers outside Azure also run in production mode. Confirm
the actual value exposed to each App Service slot before enabling campaigns;
if needed, configure `WEBSITE_SLOT_NAME` explicitly per slot and verify it
cannot identify staging as production. Slot swaps can apply target settings
during source warm-up, so pause all campaigns before swapping and verify both
slots and worker behavior throughout the swap before resuming. Do not rely on
the slot name as the sole isolation boundary: keep production databases and
provider credentials inaccessible to staging where possible.

### 1.6 Vite dev plugins

Same three packages as NER: `@replit/vite-plugin-runtime-error-modal` (always on), `@replit/vite-plugin-cartographer` + `@replit/vite-plugin-dev-banner` (conditional on `REPL_ID`) in [vite.config.ts](../vite.config.ts).

### 1.7 Unused scaffolding (verified zero imports from app code) — ✅ deleted in Phase 2

| Path | Imported by app? | Action |
|---|---|---|
| [server/replit_integrations/batch/](../server/replit_integrations/batch/) | No (docstring reference only) | Deleted |
| [server/replit_integrations/chat/](../server/replit_integrations/chat/) | No | Deleted |
| [server/replit_integrations/image/](../server/replit_integrations/image/) | No | Deleted |
| `server/replit_integrations/audio/routes.ts`, `server/replit_integrations/audio/index.ts` | No — only `./replit_integrations/audio/client` is ever imported ([server/routes.ts:33](../server/routes.ts)) | Deleted; `client.ts` kept |
| ~~`server/replit_integrations/object_storage/routes.ts`~~ | **Correction: actually called** at `routes.ts:1129` (`registerObjectStorageRoutes(app)`) | **Not deleted** — see §1.3 |

Verification command (confirmed zero hits after the Phase 2 deletion):
```bash
grep -R "replit_integrations/\(audio\|batch\|chat\|image\)" server client | grep -v "^server/replit_integrations/"
```

### 1.8 Cross-app coupling — talks to NER's Replit deployment today

| File | Default | Needs to become |
|---|---|---|
| [server/nerAdapter.ts](../server/nerAdapter.ts) | throws if `NER_API_URL` unset (no hardcoded fallback) | NER's Azure production URL |
| [server/nerSearchRoutes.ts:100](../server/nerSearchRoutes.ts) | `process.env.NER_API_URL \|\| "https://NATIONALESTATEREGISTRY.replit.app"` | same |
| [server/routes.ts:8734](../server/routes.ts) | same fallback | same |
| [server/routes.ts:5628](../server/routes.ts) | `process.env.SAL_API_URL` (no fallback) | n/a — only needs the prod value set |

### 1.9 Docs & branding

| File | Action |
|---|---|
| [replit.md](../replit.md) | Rename to `README.md`; rewrite auth/storage/env sections |
| `.env.example` | Create (doesn't exist yet) — no `REPL_*`, adds all vars from §1.4 of the infra doc |

---

## 2. Architectural decisions (recommended defaults — flag if you want something different)

1. **Auth replacement:** Path 1.A, same as NER — keep the existing email/password + MFA stack (already fully implemented), delete Replit OIDC, scaffold Entra ID OIDC behind `AUTH_ENABLE_ENTRA_ID`, reusing [ner/server/auth/strategies/oidc.ts](https://github.com/Jhakir-sal/ner/blob/main/server/auth/strategies/oidc.ts) as the template. **Difference from NER:** preserve the bare `/api/login`/`/api/logout`/`/api/callback` paths (§1.1) instead of moving to `/api/auth/entra/*`.
2. **Stripe:** drop the Connectors branch, env-var-only (§1.2) — low effort, same as NER Phase 3.
3. **Object storage:** Azure Blob Storage, replacing `@google-cloud/storage` + the Replit sidecar. Preserve the `/objects/...` path and `ObjectStorageService`/`ObjectAclPolicy` contracts where practical; adapt callers that depended on GCS-specific metadata and download methods.
4. **ffmpeg/audio hosting:** App Service for Containers (custom Linux image with `ffmpeg` baked in) — see the dedicated explanation below.
5. **`REPLIT_DEPLOYMENT` business-logic gates:** replace with fail-closed `WEBSITE_SLOT_NAME`-based `isProductionDeployment()` (§1.5).
6. **Drop vs. keep "chat"/"image"/"batch" scaffolding:** drop — zero current usage, and Phase 1.4's real AI features don't need the generic chat/image scaffolding.

---

## 3. Target state (after migration)

```
udc/
  client/                                 # unchanged feature code; same /api/login etc. contract
  server/
    auth/                                 # was server/replit_integrations/auth
      index.ts
      session.ts                          # was setupAuth()/getSession() from replitAuth.ts
      passwordLogin.ts
      strategies/oidc.ts                  # new — Entra ID, ner-style
      storage.ts
      routes.ts
    integrations/
      object-storage/                     # was server/replit_integrations/object_storage
        objectStorage.ts                  # @azure/storage-blob instead of @google-cloud/storage
        objectAcl.ts                      # unchanged (portable logic)
      audio/
        client.ts                         # was server/replit_integrations/audio/client.ts; only the used exports
    deploymentEnv.ts                       # new — isProductionDeployment(), replaces REPLIT_DEPLOYMENT checks
    stripeClient.ts                        # env-var only
    email.ts                               # getAppUrl() reads PUBLIC_APP_URL
    routes.ts                              # import paths + REPLIT_DEPLOYMENT call sites updated
    index.ts                               # hardened (helmet/cors/rate-limit/healthz/SIGTERM)
  vite.config.ts                           # no @replit/* plugins
  package.json                             # no @replit/*, lockfile resolves from registry.npmjs.org
  Dockerfile                               # new — ffmpeg baked in (see §ffmpeg below)
  .env.example                             # new
  README.md                                # was replit.md
  docs/
    PRODUCTION_INFRA.md                    # new — Azure topology (next deliverable)
    REPLIT_MIGRATION_PLAN.md               # this file
```

No `replit_integrations/` folder anywhere. No `@replit/*`, no `@google-cloud/storage`, no `REPL*`/`REPLIT_*` env reads in code.

---

## 4. Phased plan (Phase 2 onward — Phase 0/1 already done, §0)

### Phase 2 — Delete unused scaffolding ✅ **done**
```bash
rm -rf server/replit_integrations/batch
rm -rf server/replit_integrations/chat
rm -rf server/replit_integrations/image
rm server/replit_integrations/audio/routes.ts server/replit_integrations/audio/index.ts
```
`server/replit_integrations/object_storage/routes.ts` was **not** deleted — see the §1.3/§1.7 correction above, it's load-bearing.

**Validated:**
- `npm run check`: the 13 tsc errors that lived in the deleted files are gone; the remaining 19 errors are byte-for-byte the same pre-existing, unrelated errors cataloged in §0 (`server/routes.ts` ×12, `shared/schema.ts` ×3, `server/storage.ts` ×2, `server/nerSearchRoutes.ts` ×2).
- Live dev server (Postgres-backed, Node 22): booted clean, homepage 200, the two-stage `/objects/*` pipeline still 401s correctly for unauthenticated requests (proves `routes.ts`'s inline ACL middleware still runs), `POST /api/uploads/request-url` still reaches `registerObjectStorageRoutes`'s real handler and fails with the *expected* `PRIVATE_OBJECT_DIR not set` error (not a 404 — confirms the route is intact, object storage just isn't configured locally yet, which is Phase 6 work).
- Full test suite re-run against the local Postgres instance for the first time ever in this environment surfaced **4 pre-existing, unrelated test failures** that were previously invisible (either the whole test *file* crashed at import for lack of `DATABASE_URL`, masking every individual assertion in it, or one specific test had a self-skip guard for "no DB available"). None of these are caused by Phase 2 — confirmed two of them (`heartPlanHousingVehicle.test.ts`: *"housing and vehicle profile fields remain outside limited advisor summary"*, *"new profile answers are redacted from concierge plan projections"*) have byte-for-byte identical failures already present in the Phase 1 baseline log, before Phase 2 touched anything. Logged here rather than fixed (out of scope — unrelated pre-existing bugs):
  - `heartPlanAdminCompletion.test.ts` — a timezone bug: asserts `2026-01-04T00:00:00.000Z`, gets `...T05:00:00.000Z` (exactly the EST/UTC-5 offset) once the assertion actually executes against a real DB instead of self-skipping.
  - `heartPlanIntakeReminders.test.ts` — "database reminder selection and claims exclude finished and demo plans" expects one specific reminder ID back, gets `[]`.
  - `heartPlanHousingVehicle.test.ts` — two "golden source text" assertions (`readFileSync` + regex/`indexOf` against `routes.ts`'s raw text) that no longer match current `routes.ts` content — stale tests, not stale code; harmless to the app itself, but drifted and silently never re-validated because the whole file used to fail at import.

### Phase 3 — Remove Replit Vite plugins ✅ **done**
Stripped `runtimeErrorOverlay()` + the conditional `cartographer`/`dev-banner` imports from [vite.config.ts](../vite.config.ts); `npm uninstall @replit/vite-plugin-runtime-error-modal @replit/vite-plugin-cartographer @replit/vite-plugin-dev-banner`.

**Validated:** `npm run check` unchanged (19 errors, same as Phase 2 — this phase doesn't touch server code); `npm run build` passes, `dist/public/index.html` has zero `replit` references (previously the dev-banner's `<script src="/@replit/vite-plugin-dev-banner/banner-script.js">` was live-injected in dev mode — confirmed gone from the served HTML after this change); `package.json` has zero `@replit/*` entries left.

### Phase 4 — Decouple Stripe from Replit Connectors ✅ low risk
Removed `getConnectorSecretKey()` from [server/stripeClient.ts](../server/stripeClient.ts). Both client factories use only `STRIPE_SECRET_KEY`; Replit Connector environment variables are no longer read in application code. Added an offline test verifying valid keys construct both clients, invalid keys return `null`, and no connector network request is made.

**Validated:** `server/stripeClient.test.ts` passes without live Stripe credentials. Checkout session creation still requires a valid Stripe test-mode key and a controlled end-to-end test; credentials are not present in the local environment, so that external operation was not exercised. Webhook signature verification remains independent of Connectors ([server/stripeWebhookVerification.ts](../server/stripeWebhookVerification.ts)).

### Phase 5 — Replace Replit Auth with email/password + Entra ID scaffold ✅ medium
Moved shared auth code to `server/auth/`, removed the Replit OIDC implementation, and preserved the `/api/login`, `/api/logout`, and `/api/callback` contracts. Password login, MFA, session renewal, and user profile behavior remain in the shared auth stack. Entra ID is disabled by default; enabling it requires a single-tenant issuer, client credentials, callback URL, and an existing account with a verified email. SSO does not auto-provision users or alter roles. Entra tenant IDs are validated against the token, and logout uses the discovered end-session endpoint with the configured callback origin.

The login page displays the SSO option only when `/api/auth/providers` reports Entra enabled. See [LOCAL_INTEGRATIONS.md](./LOCAL_INTEGRATIONS.md) for the Entra settings and test-tenant precautions.

**Validated:** focused session/MFA tests, Entra issuer validation, auth-route contract tests, build, and the existing password-login/session persistence test pass. No Entra credentials are configured, so live discovery, callback, token refresh, and MFA delivery through Entra were not tested.

### Phase 6 — Object storage: Replit/GCS sidecar → Azure Blob Storage ✅ implementation; production migration still pending
1. Replaced `@google-cloud/storage` and the Replit sidecar with `@azure/storage-blob` and `@azure/identity`.
2. Rewrote `objectStorage.ts`:
   - Two containers: `private` (documents, legacy messages, death certs) and `public` (nothing currently needs true public access, but keep the split for parity with the existing `ObjectAclPolicy.visibility` model).
   - `getObjectEntityUploadURL()` → generate a user-delegation or account-key **SAS token** scoped to `write`, short TTL (same 900s as today), instead of a GCS signed URL from the sidecar.
   - `downloadObject()` → stream from `BlobClient.download()`, preserving HTTP range requests for HeartPlan audio/video playback.
   - `getObjectEntityFile()`/`deleteObjectEntity()`/`writeObjectEntity()` → direct blob equivalents, with `/objects/<blob-name>` retained as the database path contract.
   - ACL policies are stored as Azure-safe `aclpolicy` metadata; copying old GCS objects must map `custom:aclPolicy` to this key.
   - Browser upload clients send `x-ms-blob-type: BlockBlob` with direct PUTs.
3. Configure `AZURE_STORAGE_CONNECTION_STRING` for local use, or `AZURE_STORAGE_ACCOUNT_URL` with managed identity, plus private/public container names. Keep containers private and configure Blob CORS for local/production origins, `PUT`, and required headers. See [LOCAL_INTEGRATIONS.md](./LOCAL_INTEGRATIONS.md).
4. Production data migration remains an operational prerequisite: determine whether live Replit objects exist, then copy content and metadata before cutover and verify paths, ACLs, and media.

Validated locally: Azure/Azurite URL normalization and byte-range parsing tests, build, and the repository type-check where baseline errors permit. Live Azure upload/download, managed-identity SAS, Blob CORS, OCR, and full media finalization still require configured storage infrastructure and credentials.

### Phase 7 — Replace AI Gateway env vars ✅ implementation
All AI features now create clients through `server/openaiClient.ts` using
`OPENAI_API_KEY` and the direct OpenAI API endpoint, including OCR, assistant
chat, account intake, valuation, and transcription. The endpoint is explicit so
the SDK's `OPENAI_BASE_URL` environment variable cannot redirect sensitive
requests. Account intake retains its 30-second timeout and no-retry policy.
Audio initializes its client on use, so missing credentials do not prevent
application startup; AI requests still fail explicitly when unconfigured.

Configure a direct OpenAI key as described in [LOCAL_INTEGRATIONS.md](./LOCAL_INTEGRATIONS.md).
The old Replit variables are no longer read. Live model access and transcription
must be tested separately with a valid key and synthetic data; requests may
incur charges.

### Phase 8 — ffmpeg hosting (image verified; Azure deployment pending)
The multi-stage `Dockerfile` uses Node 22 on Debian Bookworm, installs `ffmpeg`
and `ffprobe`, builds the application, and runs it as the non-root `node` user.
It runs `npm run test:media` during the image build: synthetic video is inspected
and converted to WAV using the same functions as the application. The runtime
image contains production dependencies and the complete `dist` output, including
the server, client, and required attachments.

Build with the actual public site origin (this is public metadata, not a secret):

```sh
docker build --build-arg PRODUCTION_SITE_URL=https://your-domain.example -t udc:local .
```

Set `WEBSITES_PORT=5000` in App Service, or set both `PORT` and `WEBSITES_PORT`
to the same port. Supply database, session, storage, and provider credentials
as runtime settings, never build arguments or image files. The app writes
temporary media under the OS temp directory, so the container requires writable
temporary storage. Test with disposable storage, synthetic media, and a
non-production database before deploying; startup can seed and modify database
records. The Docker image built successfully, including both media smoke tests.
The final non-root image ran ffmpeg and ffprobe, started against a disposable
PostgreSQL database, and returned 200 for the homepage and auth-provider
endpoint and 401 for an unauthenticated object request. Azure deployment,
storage integration, and live provider flows remain unverified.

### Phase 9 — Folder rename & import sweep ✅
Auth moved to `server/auth/` in Phase 5. The remaining object-storage and audio
integrations now live in `server/integrations/`, and application and test
imports use the new paths. The old `server/replit_integrations/` directory has
been removed. Other Replit-specific deployment gates and environment settings
remain intentionally unchanged until their respective later phases.

### Phase 10 — Deployment gates and public URLs (implemented; Azure verification pending)
- Campaign SMS, ORSA email and partner outreach use
  [isProductionDeployment](../server/deploymentEnv.ts). Both production mode
  and an explicit production slot are required; missing, blank and staging
  slots fail closed. Existing test fixtures retain their legacy Replit guard and
  additionally reject any Azure slot, including staging.
- `PUBLIC_APP_URL` controls transactional links, campaign links, SMS landing
  links and public unsubscribe links. It must be an absolute origin without
  credentials, path, query or fragment; production requires HTTPS and rejects
  a missing value. Development defaults to `http://localhost:<PORT>` (5000 if
  unset). `PRODUCTION_SITE_URL` remains a separate required build-time value
  for social metadata; the Replit domain fallback was removed. Configure both
  deliberately and keep the production domains consistent.
- Dedicated tests cover slot and URL handling and the real outreach route gate.
  Before cutover, pause campaigns and verify slot identity, settings and worker
  behavior with synthetic recipients in both slots and across swaps. Confirm
  the configured domain's unsubscribe endpoint reaches the intended deployment.
  Saved bulk SMS runs whose text differs from the current template and landing
  URL cannot start and are paused automatically if already running. Recreate
  and review such drafts. Preserve old unsubscribe links for previously sent
  messages; these links have no specified expiry.
  Do not resume a pending run until its recipients and content are reviewed.

### Phase 11 — Cross-app integration cutover
Point `NER_API_URL` (and confirm `NER_REGISTRATION_PATH`) at NER's live Azure/custom domain once it's deployed; update `SAL_API_URL` similarly if that's a separate live endpoint. Remove the `https://NATIONALESTATEREGISTRY.replit.app` fallback strings in [server/nerSearchRoutes.ts](../server/nerSearchRoutes.ts) and [server/routes.ts](../server/routes.ts) once the env var is always set in every environment (dev included, via `.env`).

### Phase 12 — Env, docs, branding
1. Write `.env.example` covering every var in §1 plus the non-Replit ones already in use: `DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `FROM_EMAIL`, `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_JWT_TOKEN`, `RINGCENTRAL_PHONE_NUMBER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_PHONE_NUMBER`, `UDC_WEBHOOK_KEY`, `NER_API_URL`, `NER_REGISTRATION_PATH`, `SAL_API_URL`, `AZURE_STORAGE_CONNECTION_STRING` (Phase 6), `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` (Phase 0, optional/dev-only), `AUTH_ENABLE_ENTRA_ID`/`OIDC_*` (Phase 5).
2. Rename `replit.md` → `README.md`; rewrite the auth/storage/deployment sections; drop the external-dependency line for "Replit Auth" and "Object Storage" (Replit's).
3. Write `docs/PRODUCTION_INFRA.md` (Azure topology, secret inventory, CI/CD) — next deliverable, mirroring [ner/docs/PRODUCTION_INFRA.md](https://github.com/Jhakir-sal/ner/blob/main/docs/PRODUCTION_INFRA.md) with the Blob Storage + container deltas already captured in this doc.

### Phase 13 — CI/CD
GitHub Actions `test` job needs more than NER's did:
- A Postgres **service container** (`postgres:16`), since 11+ of the 89 `node:test` files throw at import without `DATABASE_URL` (§0), plus the explicitly DB-gated suite (`ORSA_WARMUP_DB_TEST=1 tsx --test server/orsaWarmup.db.test.ts`, `orsaAccountInvitations.db.test.ts`, `orsaEmailCampaignRetry.db.test.ts`, `orsaOutreach.db.test.ts`).
- Decide full vs. subset test matrix for PR CI (89 server test files + 12 Playwright specs + the separate `tests/assistant` Playwright suite is a lot to run on every push) — recommend: full `npm test` (node:test, fast, ~5s once DB is up per the baseline) + Playwright smoke subset on PR, full Playwright suite nightly or pre-deploy only.
- `deploy` job: same slot-swap shape as NER, but packaging a **container image** (Phase 8) instead of a plain `dist/` folder — push to Azure Container Registry, `az webapp config container set` instead of `azure/webapps-deploy@v3`.

### Phase 14 — Final verification sweep
```bash
grep -RIn -i --exclude-dir=node_modules --exclude-dir=.git \
  "replit\|@replit\|REPL_ID\|REPLIT_\|package-firewall" .
```
Must return nothing in source files (docs mentioning the migration itself, like this file, are expected hits — exclude `docs/`). Then: `npm run check`, `npm run build`, full `npm test` + `npm run test:e2e` against a real Postgres, `npm audit`, commit, open PR.

---

## 5. Risk register (additions specific to UDC, beyond NER's list)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deployment gates disable production campaigns or permit staging sends | **High if Phase 10 is rushed** | Dedicated tests (§Phase 10), verify both slots and swap behavior with synthetic recipients and isolated provider credentials before go-live |
| Object storage data loss during GCS → Blob cutover | Medium (if there's live data) | Confirm whether any production files already exist; if so, write a one-time copy script and verify checksums before deleting the GCS bucket |
| ffmpeg missing in whatever hosting approach is chosen | High if the container approach is abandoned for a plain App Service | Keep the Dockerfile in CI (`docker build` in the test job) so a missing ffmpeg install fails CI, not a live legacy-message upload |
| Frontend hardcodes `/api/login`/`/api/logout` paths in 5 files | Low (just need to remember) | Phase 5 explicitly preserves these paths — see §1.1 |
| NER cross-app dependency breaks silently (wrong URL) | Medium | `nerAdapter.ts` already throws loudly if `NER_API_URL` is unset — keep that fail-closed behavior, don't add a `.replit.app` fallback back in |
| Hidden second Replit env consumer not yet found | Low | Final Phase 14 sweep |

---

## 6. Out of scope (same as NER)

- Migrating already-persisted Replit OIDC user IDs.
- Rewriting SendGrid/RingCentral/Twilio integrations — already vendor-neutral.
- Fixing the pre-existing `tsc` errors cataloged in §0 that aren't in deleted/moved files (e.g. `shared/schema.ts`, `server/storage.ts`, several `server/routes.ts` type errors) — track separately.
