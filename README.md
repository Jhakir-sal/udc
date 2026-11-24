# Steps After Life - Universal Death Certificate Platform

UDC is a React/Vite and Express/TypeScript application backed by PostgreSQL
and Azure Blob Storage. It supports case management, family workflows and
HeartPlan. UDC's Azure deployment and credentials are independent of other
applications; external registry integration is optional and disabled by default.

## Local setup

Use Node.js 24, npm, and a disposable PostgreSQL database. The application and
tests can send real messages or mutate data: use synthetic data, test accounts
and credentials, and never point local tests at production.

1. Run `npm ci`.
2. If you do not already have a `.env`, copy `.env.example` to `.env`. Fill in
   the local `DATABASE_URL` and a unique `SESSION_SECRET` privately. Do not
   overwrite an existing `.env` or commit credentials.
3. Initialize the schema **only on a disposable development database**:
   `node --env-file=.env ./node_modules/drizzle-kit/bin.cjs push`, then install
   the consent-ledger protection with
   `node --env-file=.env ./node_modules/tsx/dist/cli.mjs script/ensure-consent-ledger.ts`.
   The production schema process must be reviewed separately.
4. Start the server with
   `NODE_ENV=development node --env-file=.env ./node_modules/tsx/dist/cli.mjs server/index.ts`.
   Open `http://localhost:5000` or the port configured in `.env`.

The app and npm scripts do not automatically load `.env`. Provider setup,
Azure storage, integration safety and local media testing are documented in
[docs/LOCAL_INTEGRATIONS.md](./docs/LOCAL_INTEGRATIONS.md).

## Build and verification

```sh
# Public metadata only; replace the example with the intended production origin.
PRODUCTION_SITE_URL=https://udc.example.invalid npm run build
npm run check
node --env-file=.env --run test
```

Some tests need PostgreSQL and can modify data; use an isolated disposable
database for CI and test runs. The Docker image includes ffmpeg/ffprobe;
its build requires `PRODUCTION_SITE_URL`:

```sh
docker build --build-arg PRODUCTION_SITE_URL=https://udc.example.invalid -t udc:local .
```

The image uses packaged Node 24 on Wolfi, runs as a non-root user and listens
on port 5000. The image build uses npm 12's strict install-script allowlist;
review and update `allowScripts` when approved dependency versions change.
Runtime credentials and `PUBLIC_APP_URL` are separate from build arguments.
See [docs/PRODUCTION_INFRA.md](./docs/PRODUCTION_INFRA.md) for the proposed
UDC-specific Azure architecture, cutover prerequisites and operational risks;
it is a plan, not evidence that resources have been deployed.

GitHub Actions runs tests, type-checking, browser smoke tests, a production
dependency audit, and a container build and vulnerability scan. The separate
staging workflow is manually gated and requires UDC-owned resources. CI must
pass before deployment. See the
[CI/CD setup](./docs/PRODUCTION_INFRA.md#github-actions-setup-and-limits) for
requirements and limitations. The [image triage](./docs/IMAGE_VULNERABILITY_TRIAGE.md)
records the scan history and remaining limitations.

## Overview
Steps After Life is a universal death certificate management platform for
organizing case records, documents, connected accounts and related workflows.
The feature inventory below describes the inherited application and should be
validated against current code and provider integrations before production use.

## User Preferences
- Default theme: Light mode (persisted in localStorage)
- Font: Inter for UI, Playfair Display for headings

## System Architecture

### UI/UX Decisions
- **Color Scheme**: Professional blues and grays.
- **Typography**: Inter for body, Playfair Display for headings.
- **Components**: Shadcn UI with custom theming.
- **Theme**: Supports dark and light modes, light mode as default.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite, TanStack Query, Wouter.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Styling**: Tailwind CSS.
- **State Management**: TanStack Query.
- **Authentication**: Email/password and application MFA with role-based access control. Single-tenant Microsoft Entra sign-in is optional and disabled by default; it only signs in existing verified accounts.
- **Death Certificate Verification**: OpenAI Vision (gpt-4o) for two-step document authentication (8 markers, OCR extraction) and confidence scoring. Rejected documents are blocked.
- **NER Analysis**: OpenAI (gpt-5.2) for Named Entity Recognition to extract entities from death certificates and match against an Estate Registry.
- **External NER Integration**: Optional registry search via `/api/ner-external/search` and `/api/ner-external/info`; disabled unless `NER_API_URL` is configured.
- **Blockchain Integration**: Generates unique blockchain IDs (20-30 alphanumeric characters) for certificates. Public Blockchain Certificate Portal at `/blockchain` requires document upload and AI verification. Next of Kin notification via email is sent upon certificate creation, inviting them to create a family account.
- **Email Notifications**: SendGrid (`@sendgrid/mail`) for transactional emails, configurable via `SENDGRID_API_KEY` and `FROM_EMAIL`. Falls back to console logging if unconfigured. Post-send bounces are caught by the SendGrid Event Webhook endpoint (`POST /api/webhooks/sendgrid`, point SendGrid's Event Webhook at it with bounce + dropped events enabled): it verifies the ECDSA signature when `SENDGRID_WEBHOOK_PUBLIC_KEY` is set; without the key each event is only a hint and is re-confirmed against SendGrid's suppression API before acting, so forged payloads can't flag contacts. A bounced trusted-contact info email (traced via `customArgs` on the message) clears `info_email_sent_at`, exhausts the retry counter, stamps `info_email_failed_at` (once — duplicate webhook deliveries don't re-alert), and sends the same planner + admin undeliverable alerts as synchronous send failures.
- **Task-Based Case Workflow**: Each case has 9 predefined workflow tasks (Case Created → Certificate Uploaded → Verified & Blockchain ID → Accounts Added → Notifications Sent → Gov Agencies Notified → Credit Protection → Insurance & Benefits → Case Complete) stored in `case_tasks` table. SAL team manually verifies and toggles each step — nothing auto-completes. Contextual data hints show system state alongside each task. Tasks are auto-seeded on first case view. Admin endpoints: `GET /api/admin/case/:certId/tasks`, `PATCH /api/admin/case/:certId/tasks/:taskId`.
- **API Design**: RESTful endpoints for certificates, connected accounts, notifications, beneficiaries, appointments, government notifications, estate registry, NER analysis, and credit protection.
- **Account Management Logic**: "Family protection" rules prevent closure of joint accounts and essential utilities; allows suspension or transfer to verified surviving family.
- **Three-System Architecture**:
    - **Admin/Concierge Dashboard (UDC)**: Internal platform for case management.
    - **Blockchain Certificate Portal**: Public-facing `/blockchain` for external parties to create blockchain-verified records, returning only a Blockchain ID.
    - **Funeral Home Portal**: Authenticated portal for partners.
- **PII Masking**: Public endpoints mask personal information, returning only Blockchain ID, status, and issuing authority. Admin-only search (`/api/blockchain/search/:blockchainId`) returns full data.
- **Session Management**: PostgreSQL-backed sessions using `connect-pg-simple` with a 7-day TTL.
- **MFA / Two-Factor Authentication**: The application provides verification and MFA flows using configured email and SMS providers. See [local integration setup](./docs/LOCAL_INTEGRATIONS.md) before testing.
- **Family Invitation System**: Admins can invite family members via email and SMS from the case detail page. Two-step secure flow: (1) Registration creates account + sends 6-digit email verification code, (2) User enters code to verify email ownership, (3) Only after verification, Certificate ID is sent securely. Verification endpoints bound to invitation token with brute-force protection (5 attempts / 15 min lockout). Endpoints: `POST /api/family-invite/:token/register`, `POST /api/family-invite/:token/verify-email`, `POST /api/family-invite/:token/resend-code`.
- **Family Onboarding (Required)**: Family users (role `user`) must complete a 3-step onboarding before dashboard access, enforced by a fail-closed gate in `client/src/App.tsx` (`GET /api/onboarding/status` must return `complete: true`). Steps: (1) Stripe Identity ID verification (mobile-first; dev fallback auto-verifies when no Stripe key), (2) e-sign the Limited Power of Attorney — auto-filled principal name/address, agent Diana Milian / Steps After Life Inc., valid 1 year from signing, drawn (canvas) or typed signature, stored in `lpoa_documents` table, re-signing blocked, (3) estate question ("Did the deceased have an estate?") — only asked if not already captured (`certificates.estateStatus`: yes/no/unsure); No/Unsure answers drive users to the Estate Registry search. Admins can pre-set estate status via a card on the case detail page and view signed LPOAs via `GET /api/admin/case/:certId/lpoa`. Endpoints: `GET /api/onboarding/status`, `POST /api/onboarding/lpoa/sign`, `GET /api/onboarding/lpoa`, `POST /api/onboarding/estate-answer`.
- **Click-to-Dial & Text**: All phone numbers in the case detail page (Next of Kin, Informant, Primary Contact, beneficiaries, nearest relatives, insurance contacts, invitation recipients, linked family accounts) render as clickable `tel:` links with a companion SMS button. The SMS popover allows admins to compose and send text messages via RingCentral (`POST /api/admin/send-sms`, admin-only). Implemented via reusable `PhoneActions` component (`client/src/components/phone-actions.tsx`).
- **Service Plans & Stripe Payment**: Concierge assigns a service tier (Bronze $500 / Silver $1,500 / Platinum $3,000, defined in `SERVICE_PLANS` in `shared/schema.ts`) via the "Service Plan & Payment" card on the case detail page. Families see a payment banner on their dashboard and pay via Stripe Checkout (`POST /api/payment/checkout` → hosted checkout → `/payment-success` page → `GET /api/payment/verify`, idempotent + session-bound). Admin can record offline payments via `POST /api/admin/case/:certId/mark-paid`. ORSA / CFCU referrals (`referralSource: "orsa"`, relabeled "ORSA / CFCU") are payment-exempt via `isPaymentExempt()`. `referralSource` is REQUIRED at case intake (`POST /api/admin/add-deceased` returns 400 without it). Payment fields on `certificates`: `servicePlan`, `paymentStatus` (default `unpaid`), `paymentAmount` (cents), `paidAt`, `stripeCheckoutSessionId`. A `payment_received` notification is created when payment is confirmed.
- **Concierge ID Verification Tools**: Admins can view the Stripe Identity document (extracted details + short-lived image links via `GET /api/admin/family-accounts/:userId/id-document`; requires "Store images" enabled in Stripe Identity settings) and manually approve a family member's ID with an audited note (`POST /api/admin/family-accounts/:userId/override-id`; audit columns `idOverrideBy/Name/At/Note` on `users`, "Manually Approved" badge in UI).
- **Family Documents**: Family users upload supporting documents from Settings → "My Documents"; concierge can upload/view/delete per-account documents on the case detail page (`family_documents` table, scoped by certificate). Object serving is protected: `GET /objects/*` requires a logged-in session, and family documents are restricted to their owner or admins; registering an already-used object path is rejected.
- **Family Multi-Case Switcher**: Family users linked to multiple deceased get a "loved one" selector on the dashboard (persisted in localStorage key `sal-selected-case`) that filters certificates, accounts, notifications, and stats. Benefits page uses the selected certificate instead of always the first.
- **Family-Added Account Alerts**: When a family user adds a connected account (`POST /api/accounts`), a `family_added` notification is created so the concierge team sees it in Recent Activity / Notification Center.
- **SMS Conversation Log**: Live text messaging interface at `/sms` (admin sidebar "Text Messages"). Chat-like UI with conversation list (left panel) and message thread (right panel). All outbound SMS are logged in `sms_messages` table. Inbound SMS received via RingCentral webhook (`POST /api/ringcentral/webhook`, secured by `UDC_WEBHOOK_KEY`). Supports new conversations, unread count badges in sidebar, per-admin attribution, and E.164 phone normalization. API endpoints: `GET /api/admin/sms/conversations`, `GET /api/admin/sms/thread/:phone`, `GET /api/admin/sms/unread-count`.

### Feature Specifications
- **Concierge Dashboard**: Admin view with family selector, progress indicators, and aggregated stats.
- **Case Detail Page**: Comprehensive case view per death certificate including deceased info, next of kin, informant, primary contact, connected accounts, nearest relatives, beneficiaries, life insurance, government notifications, credit protection, and secure messaging.
- **Nearest Relatives Search**: Public data search using deceased's information to find relatives, storing results in `nearest_relatives` table.
- **Dashboard**: Statistics and recent activity.
- **Add Deceased (Manual Entry)**: Admin wizard for manual case creation.
- **Certificate Upload Wizard**: Three-step process with drag-and-drop and AI OCR.
- **Admin Certificate Upload**: Concierge can upload certificate documents to existing cases from the case detail page, with automatic AI verification and object storage.
- **Connected Accounts Management**: Manage linked service accounts with close, suspend, or continue options, categorizing accounts into Financial, Memberships, Subscriptions, Real Estate, Protected Information, and Miscellaneous. Supports manual account entry by admin.
- **Manual Entry Forms**: Admin can manually add connected accounts (by category), nearest relatives, and life insurance policies from the case detail tabs.
- **Search Information**: Search records by SSN (last 4 digits), deceased name, or certificate number.
- **Notification Center**: Activity logs and alerts.
- **Benefits & Government**: Manage notifications to government agencies and beneficiary appointments.
- **Credit Pull API**: The current credit-pull endpoint generates simulated bureau results; it is not a live bureau integration.
- **Credit Protection**: Facilitates credit protection requests with major bureaus.
- **Estate Registry**: The inherited external search and registration features are optional and require a separately approved, verified integration.
- **Webhook/Push Notifications**: Integration with service providers for automated death notifications and task status callbacks.
- **HeartPlan (pre-death planning)**: Separate product inside the same app/database for "planner" role users. Public signup at `/heartplan-register` (reuses the shared email-verification endpoints, skips family onboarding). Planners get their own workspace (PlannerRouter in `App.tsx`): dashboard with section-based progress, end-of-life wishes, document vault (object storage), asset/account inventory (last-4-digits-only account hints, enforced server-side), trusted contacts, and sealed letters. Tables: `heart_plans`, `plan_wishes`, `plan_documents`, `plan_assets`, `plan_contacts`, `plan_letters`, `plan_events`. Pricing: free tier (full workspace) + one-time $149 "Legacy" paid tier (`HEARTPLAN_PAID_TIERS` in `server/routes.ts`) via Stripe Checkout — `POST /api/heartplan/upgrade/checkout` → hosted checkout → return to `/?upgrade=success` → `GET /api/heartplan/upgrade/verify` (idempotent, session-bound), with `POST /api/webhooks/stripe` as backstop. Stripe webhooks have two authenticated modes: preferred signed verification when `STRIPE_WEBHOOK_SECRET` is configured, and secure Stripe API re-fetch verification when it is unavailable. Fallback treats the JSON body only as a type/object-ID hint and processes authoritative Stripe objects; payment payloads are never logged. `heart_plans` upgrade fields: `tier`, `stripe_checkout_session_id`, `upgraded_at`. Admin sees all plans at `/heartplans`; death activation (`POST /api/admin/heartplans/:id/activate`) atomically claims the plan (compare-and-set, reverted on failure) and converts it into a Steps After Life case: certificate (no owner; family linked later via normal invitation), connected accounts from assets, nearest relatives from contacts, family documents from vault docs (readable by the certificate's future family owner), letters released and emailed after all DB writes succeed. Activated plans are read-only (server-enforced).
- **SAL Inbound Webhooks**: Five webhook endpoints (`/api/webhook/sal/new-user`, `/api/webhook/sal/user-verified`, `/api/webhook/sal/new-task`, `/api/webhook/sal/task-update`, `/api/webhook/sal/task-delete`) secured by `UDC_WEBHOOK_KEY` header. Stores notifications in `sal_notifications` table. Admin notification bell in sidebar shows unread count and notification panel with type-specific labels and colors.

## External Dependencies
- **PostgreSQL**: Primary database.
- **OpenAI (GPT-4o, GPT-5.2)**: AI for OCR, certificate verification, and NER.
- **Microsoft Entra ID**: Optional sign-in for existing verified accounts.
- **RingCentral**: Primary SMS provider for family invitations.
- **Twilio**: Fallback SMS provider.
- **Stripe Identity**: ID verification.
- **Credit bureaus, government agencies and service providers**: Inherited workflows mention these parties; live connectivity and delivery are not verified. Credit-pull data is simulated.
- **Azure Blob Storage**: Private object storage for uploaded documents.
