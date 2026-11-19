# Replit De-coupling & Azure Migration Plan (udc)

> Objective: remove all Replit-specific code, dependencies, env vars, and folder names from the `udc` codebase, while preserving every user-facing feature (auth, Stripe, SendGrid email, RingCentral/Twilio SMS, object storage, OCR/NER/voice AI, ORSA outreach), then deploy to Azure. Modeled on the sibling [ner](https://github.com/Jhakir-sal/ner) migration ([ner/docs/REPLIT_MIGRATION_PLAN.md](https://github.com/Jhakir-sal/ner/blob/main/docs/REPLIT_MIGRATION_PLAN.md)), adapted for UDC's larger surface area and the extra integrations it has that NER didn't (object storage, ffmpeg, SendGrid, RingCentral, a cross-app dependency on NER itself).

Status legend: ✅ done · ⏳ planned (this doc) · ⚠️ requires a product/ops decision · 🔴 blocker

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

---

## 1. Inventory of Replit coupling

### 1.1 Auth (OIDC)

| File | What it does | Replit dependency |
|---|---|---|
| [server/replit_integrations/auth/replitAuth.ts](../server/replit_integrations/auth/replitAuth.ts) | `setupAuth()`: session + passport init, registers `GET /api/login`, `GET /api/callback`, `GET /api/logout`; also exports `isAuthenticated`, `establishPasswordSession` (used by the already-vendor-neutral password login) | Replit OIDC issuer `https://replit.com/oidc` (default), `REPL_ID`, `ISSUER_URL` |
| [server/replit_integrations/auth/index.ts](../server/replit_integrations/auth/index.ts) | Re-exports `setupAuth`, `isAuthenticated`, `establishPasswordSession`, `createPasswordLoginHandler`, `authStorage`, `registerAuthRoutes` | folder name only |
| [server/replit_integrations/auth/passwordLogin.ts](../server/replit_integrations/auth/passwordLogin.ts) | `createPasswordLoginHandler()` — email/password login w/ MFA + rate limiting. **Already vendor-neutral**, just needs to move. | none |
| [server/replit_integrations/auth/storage.ts](../server/replit_integrations/auth/storage.ts) | Drizzle CRUD for `users` | none beyond folder location |
| [server/replit_integrations/auth/routes.ts](../server/replit_integrations/auth/routes.ts) | misc `/api/auth/*` routes | none beyond folder location |
| [server/routes.ts:9](../server/routes.ts) | `import { setupAuth, registerAuthRoutes, isAuthenticated, createPasswordLoginHandler } from "./replit_integrations/auth"` | folder path |

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
| [server/stripeClient.ts](../server/stripeClient.ts) | `getStripeClient()` tries Replit Connectors REST API first, **falls back to `STRIPE_SECRET_KEY` env var already** | `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL` |

This is **less work than NER** — the env-var fallback already exists and is exercised today (`.env` has no Replit connector vars locally). Just delete the connector branch; `getStripeIdentityClient()` already only reads the env var.

### 1.3 Object storage — **UDC-specific, NER didn't have this**

| File | What it does | Replit dependency |
|---|---|---|
| [server/replit_integrations/object_storage/objectStorage.ts](../server/replit_integrations/object_storage/objectStorage.ts) | `ObjectStorageService` wraps `@google-cloud/storage`, authenticated via **Replit's local sidecar** at `http://127.0.0.1:1106` (`REPLIT_SIDECAR_ENDPOINT`) using Workload Identity Federation (`type: "external_account"`) | The sidecar only exists inside a Replit workspace/deployment — **this cannot run anywhere else, full stop**. Also reads `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` |
| [server/replit_integrations/object_storage/objectAcl.ts](../server/replit_integrations/object_storage/objectAcl.ts) | ACL policy model (`ObjectAclPolicy`, `canAccessObject`, `getObjectAclPolicy`/`setObjectAclPolicy` via GCS custom metadata) | None directly — pure logic, portable |
| [server/replit_integrations/object_storage/routes.ts](../server/replit_integrations/object_storage/routes.ts) | `registerObjectStorageRoutes()` — generic example routes (`POST /api/uploads/request-url`, `GET /objects/*`). **Not actually mounted anywhere** (never imported outside the folder) — dead example code | none |

**Real consumers** (23 call sites in [server/routes.ts](../server/routes.ts)) use `ObjectStorageService` directly for: death-certificate uploads, family documents, HeartPlan document vault, HeartPlan sealed legacy messages (audio/video), company upload packages. This is load-bearing across most of the app's file-upload surface.

### 1.4 AI Gateway — 11 call sites across 5 files + the audio integration

All of these read `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit's AI Gateway proxy — instead of calling OpenAI directly:

| File | Line(s) | Feature |
|---|---|---|
| [server/routes.ts](../server/routes.ts) | 475, 4245-46, 4690-91, 5890-91, 8600-01, 9302-03 | Death-certificate OCR/verification, NER entity extraction, misc AI endpoints |
| [server/accountEmailIntake.ts](../server/accountEmailIntake.ts) | 29, 32-33 | Parses inbound company-reply emails |
| [server/hardAssetValuation.ts](../server/hardAssetValuation.ts) | 133-134, 137 | Appraises hard assets from photos |
| [server/replit_integrations/audio/client.ts](../server/replit_integrations/audio/client.ts) | 10-11 | Voice chat / TTS / STT (see §2 below — only `speechToText`/`inspectMedia` are actually used) |
| [server/replit_integrations/chat/routes.ts](../server/replit_integrations/chat/routes.ts), [server/replit_integrations/image/client.ts](../server/replit_integrations/image/client.ts) | — | **Dead scaffolding**, deleted in Phase 2, not migrated |

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

**Recommended replacement** (Phase 10): Azure App Service automatically injects `WEBSITE_SLOT_NAME` for deployment slots (e.g. `production`, `staging`) — this is a free, Azure-native equivalent of "is this the actually-published instance." Introduce:

```ts
// server/deploymentEnv.ts
export function isProductionDeployment(): boolean {
  const slot = (process.env.WEBSITE_SLOT_NAME ?? "production").toLowerCase();
  return process.env.NODE_ENV === "production" && slot === "production";
}
```

and swap every `process.env.NODE_ENV === "production" && process.env.REPLIT_DEPLOYMENT === "1"` (and the two bare `REPLIT_DEPLOYMENT` checks) for `isProductionDeployment()`. This preserves the *exact original intent* — "only the live swapped-in slot, not staging" — without inventing a new env var to manage in Key Vault. `getAppUrl()` becomes a straight read of `PUBLIC_APP_URL` (same variable NER uses).

### 1.6 Vite dev plugins

Same three packages as NER: `@replit/vite-plugin-runtime-error-modal` (always on), `@replit/vite-plugin-cartographer` + `@replit/vite-plugin-dev-banner` (conditional on `REPL_ID`) in [vite.config.ts](../vite.config.ts).

### 1.7 Unused scaffolding (verified zero imports from app code)

| Path | Imported by app? | Action |
|---|---|---|
| [server/replit_integrations/batch/](../server/replit_integrations/batch/) | No (docstring reference only) | Delete |
| [server/replit_integrations/chat/](../server/replit_integrations/chat/) | No | Delete |
| [server/replit_integrations/image/](../server/replit_integrations/image/) | No | Delete |
| [server/replit_integrations/audio/routes.ts](../server/replit_integrations/audio/routes.ts), [server/replit_integrations/audio/index.ts](../server/replit_integrations/audio/index.ts) | No — only `./replit_integrations/audio/client` is ever imported ([server/routes.ts:33](../server/routes.ts)) | Delete `routes.ts`/`index.ts`; keep `client.ts` only |
| [server/replit_integrations/object_storage/routes.ts](../server/replit_integrations/object_storage/routes.ts) | No — `registerObjectStorageRoutes` is exported but never called | Delete (the real upload routes live inline in `routes.ts`) |

Verification command (should match the table above exactly):
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
3. **Object storage:** Azure Blob Storage, replacing `@google-cloud/storage` + the Replit sidecar. Preserve the existing `ObjectStorageService`/`ObjectAclPolicy` *interface* so all 23 call sites in `routes.ts` don't need to change — only the implementation underneath.
4. **ffmpeg/audio hosting:** App Service for Containers (custom Linux image with `ffmpeg` baked in) — see the dedicated explanation below.
5. **`REPLIT_DEPLOYMENT` business-logic gates:** replace with `WEBSITE_SLOT_NAME`-based `isProductionDeployment()` (§1.5) rather than inventing a new env var.
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

### Phase 2 — Delete unused scaffolding ✅ low risk
```bash
rm -rf server/replit_integrations/batch
rm -rf server/replit_integrations/chat
rm -rf server/replit_integrations/image
rm server/replit_integrations/audio/routes.ts server/replit_integrations/audio/index.ts
rm server/replit_integrations/object_storage/routes.ts
```
Validate: `npm run check` (error count should drop — see §1 of this doc for exactly which pre-existing tsc errors live in these files and disappear here vs. which are unrelated pre-existing bugs to leave alone).

### Phase 3 — Remove Replit Vite plugins ✅ low risk
Same as NER Phase 2: strip `runtimeErrorOverlay()` + the conditional `cartographer`/`dev-banner` imports from [vite.config.ts](../vite.config.ts); `npm uninstall @replit/vite-plugin-runtime-error-modal @replit/vite-plugin-cartographer @replit/vite-plugin-dev-banner`.

### Phase 4 — Decouple Stripe from Replit Connectors ✅ low risk
1. Rewrite [server/stripeClient.ts](../server/stripeClient.ts): delete `getConnectorSecretKey()`, `getStripeClient()`/`getStripeIdentityClient()` read `STRIPE_SECRET_KEY` directly.
2. Grep for any other `REPLIT_CONNECTORS_HOSTNAME`/`REPL_IDENTITY`/`WEB_REPL_RENEWAL` reads — none found outside `stripeClient.ts` today.

Validate: Stripe Checkout (service plans, HeartPlan upgrade) still creates sessions in test mode; webhook signature verification already works independent of Connectors ([server/stripeWebhookVerification.ts](../server/stripeWebhookVerification.ts)).

### Phase 5 — Replace Replit Auth with email/password + Entra ID scaffold ✅ medium
1. Move session/passport setup out of `replitAuth.ts` into `server/auth/session.ts`, keeping `establishPasswordSession` and `isAuthenticated`.
2. **Preserve `/api/login`, `/api/logout`, `/api/callback`** (§1.1) — do not rename.
   - `GET /api/login`: if `AUTH_ENABLE_ENTRA_ID=true`, kick off the Entra OIDC flow; otherwise redirect to `/login` (the password-login page already exists).
   - `GET /api/logout`: keep the existing dual-path logic (destroy plain session vs. hit the IdP end-session URL for an SSO session) — just swap the Replit OIDC `buildEndSessionUrl`/`client_id` for Entra's equivalent.
   - `GET /api/callback`: Entra OIDC callback (or delete if SSO isn't launched yet — then `/api/login` just redirects straight to `/login`).
3. Add `server/auth/strategies/oidc.ts` modeled on [ner's version](https://github.com/Jhakir-sal/ner/blob/main/server/auth/strategies/oidc.ts), gated by `AUTH_ENABLE_ENTRA_ID`.
4. Delete `replitAuth.ts`.

Validate: register → login → `/api/auth/user`-equivalent → logout, with MFA still triggering correctly (`requiresMfa`); session survives refresh.

### Phase 6 — Object storage: Replit/GCS sidecar → Azure Blob Storage ⏳ **the biggest single piece of work**
1. `npm uninstall @google-cloud/storage`, `npm install @azure/storage-blob`.
2. Rewrite `objectStorage.ts`:
   - Two containers: `private` (documents, legacy messages, death certs) and `public` (nothing currently needs true public access, but keep the split for parity with the existing `ObjectAclPolicy.visibility` model).
   - `getObjectEntityUploadURL()` → generate a user-delegation or account-key **SAS token** scoped to `write`, short TTL (same 900s as today), instead of a GCS signed URL from the sidecar.
   - `downloadObject()` → stream from `BlockBlobClient.download()`, preserving the existing HTTP range-request support (used today for audio/video playback — don't regress this, it's exercised by the HeartPlan legacy-message `<audio controls>`/`<video>` players).
   - `getObjectEntityFile()`/`deleteObjectEntity()`/`writeObjectEntity()` → direct blob equivalents.
   - Keep `objectAcl.ts` almost as-is (it operates on custom metadata, which Blob Storage also supports via `BlobHTTPHeaders`/metadata) — this is the one file that's already portable.
3. Env vars: replace `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS` with `AZURE_STORAGE_CONNECTION_STRING` (or managed-identity + account URL) + container names.
4. Data migration: existing uploaded files (if any exist in a live Replit object-storage bucket) need a one-time copy job GCS → Azure Blob before cutover — confirm whether there's production data to migrate or if this is launching fresh.

Validate: death-certificate upload → OCR pipeline still reads the uploaded file; HeartPlan document vault upload/download round-trips; HeartPlan sealed legacy-message audio/video upload → finalize (`inspectMedia`/`speechToText`, Phase 8) still works end-to-end; range requests (`Range: bytes=...`) still return `206 Partial Content`.

### Phase 7 — Replace AI Gateway env vars ✅ low-medium (mechanical, many sites)
Swap `AI_INTEGRATIONS_OPENAI_API_KEY`/`_BASE_URL` → `OPENAI_API_KEY` (no base URL override — call OpenAI directly) at all 11 sites in §1.4. A single shared `server/openaiClient.ts` exporting one configured client, imported everywhere instead of each file constructing its own `new OpenAI({...})`, would also fix the duplication while we're in there (optional cleanup, not required for de-coupling).

### Phase 8 — ffmpeg hosting (see detailed explanation below) ⏳
Decision: custom Docker image for App Service with `ffmpeg`/`ffprobe` installed, Node 22-lts base. Build the existing Dockerfile pattern from scratch (UDC doesn't have one yet) — see Phase 2 of the infra doc (next deliverable) for the exact image spec.

### Phase 9 — Folder rename & import sweep ✅
```bash
git mv server/replit_integrations/auth server/auth
mkdir -p server/integrations
git mv server/replit_integrations/object_storage server/integrations/object-storage
git mv server/replit_integrations/audio server/integrations/audio
rmdir server/replit_integrations
grep -RIl "replit_integrations" server client shared | \
  xargs sed -i '' \
    -e 's#replit_integrations/auth#auth#g' \
    -e 's#replit_integrations/object_storage#integrations/object-storage#g' \
    -e 's#replit_integrations/audio#integrations/audio#g'
grep -RIn -i "replit\|REPL_\|REPLIT_" server client shared   # must return zero lines
```

### Phase 10 — Fix `REPLIT_DEPLOYMENT` business-logic gates (§1.5) 🔴 do not skip
1. Add `server/deploymentEnv.ts` (`isProductionDeployment()` per §1.5).
2. Replace all 6 call sites (`routes.ts` ×2, `orsaBulkSmsWorker.ts`, `orsaEmailCampaign.ts`, `outreachRoutes.ts`, `test-fixtures/orsa-warmup-reserve.ts`).
3. Replace `getAppUrl()` in [server/email.ts](../server/email.ts) with a direct `process.env.PUBLIC_APP_URL` read (falling back to `http://localhost:5000` in dev only).

Validate with a **dedicated test**: stub `WEBSITE_SLOT_NAME=staging` + `NODE_ENV=production` → `isProductionDeployment()` is `false`; `WEBSITE_SLOT_NAME=production` (or unset) + `NODE_ENV=production` → `true`. This is the single highest-risk silent-failure point in the whole migration (campaigns either never send, or send from the wrong slot) — it deserves its own `server/deploymentEnv.test.ts`, not just manual smoke-testing.

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
| `REPLIT_DEPLOYMENT` gates silently disable ORSA campaign/SMS sending in production | **High if Phase 10 is skipped or rushed** | Dedicated unit test (§Phase 10), explicit manual smoke test of one real campaign send against a staging slot before go-live |
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
