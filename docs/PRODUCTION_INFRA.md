# UDC production infrastructure plan

The low-cost production foundation is provisioned and the app is running at
`https://udc-prd-eus2-web01.azurewebsites.net`. Public app access is enabled;
SCM access remains denied. The app is **not ready for real data or production
operations**: administrator MFA, provider delivery, monitoring and a
coordinated recovery procedure remain unverified. The separate `UDC-Staging`
resource group remains empty. Both groups are in East US 2 in the active Azure
Primary Subscription.

UDC must use **its own Azure resources, identities, configuration and
credentials**. The sibling NER application is a migration example, not a
service, registry, credential source or infrastructure dependency. Inherited
external integrations are optional and require separate approval.

## Provisioned production foundation

The following UDC-only resources were deployed on November 25, 2026 in
`UDC-Production` (East US 2), using
[`infra/production.bicep`](../infra/production.bicep):

| Resource | Current baseline |
|---|---|
| App Service plan `udc-prd-eus2-plan01` | Linux Basic B1, one instance. This tier has no deployment slots or automatic scaling. |
| Web app `udc-prd-eus2-web01` | Running; HTTPS required, public app access allowed, SCM denied, FTP disabled. The scanned candidate image is configured by registry digest. VNet integration, a system-assigned identity, basic runtime settings and Key Vault session and database references are configured and the references resolved. |
| PostgreSQL `udc-prd-eus2-pg01` | PostgreSQL 16, Burstable B2s, 32 GiB storage, private delegated subnet and private DNS; public network disabled and TLS required. The `udc_production` database has the fresh baseline schema and application login; no historical data was imported. Seven-day backup retention, no geo-redundancy or high availability. Storage auto-growth is disabled. |
| Storage `udcprdeus2app01` | Standard LRS; HTTPS/TLS 1.2, shared keys and anonymous access disabled. Both `private` and `public` containers are private; versioning and seven-day blob/container soft-delete are enabled. The authenticated Blob endpoint is publicly reachable. Upload CORS allows `PUT` from the default UDC App Service hostname only. |
| Registry `udcprdeus2acr01` | Basic, registry admin account disabled; the scanned candidate is published by digest. |
| Key Vault `udc-prd-eus2-kv01` | RBAC, 90-day soft delete and purge protection. Generated database administrator, application connection and session secrets are stored here; the current operator has secret-management access. |
| Network `udc-prd-eus2-vnet01` | Separate UDC address space with delegated PostgreSQL and App Service subnets and a linked private DNS zone. |

Azure rejected the less expensive B1ms PostgreSQL SKU twice with
`SkuNotAvailable`; B2s was the next-smallest advertised SKU and deployed
successfully. As a rough East US 2 baseline, B2s compute is about $49.64/month
and 32 GiB storage about $3.68/month; Basic registry is about $5/month and
Linux B1 hosting is approximately $12–$14/month. Expect roughly **$71–$73
per month plus** DNS, Blob usage, backup overage, network, Key Vault,
monitoring, taxes and other usage. These are estimates, not a spending cap;
the App Service plan is billed even while the app is disabled. Confirm actual
rates and configure a budget and alerts in Azure Cost Management.

The identity has registry pull and Blob data/delegation roles scoped to the
UDC resources, and secret-read access scoped to the session and database URL
secrets. The `udc_app` database login has connect access and usage/create
privileges on the public schema, without database-administrator privileges.
On November 25, 2026 a temporary UDC-only private-network operator verified
the application login, schema privilege and TLS. A guarded migration created
the empty baseline with `udc_app` as owner and revoked its temporary database
schema-creation privilege. The running App Service resolved both Key Vault
references and successfully performed a database-backed lookup. The temporary
infrastructure and elevated identity were removed. Importing tables with
different ownership requires a reviewed ownership and permissions plan.

Before reusing the Bicep
template, retrieve and supply the **existing** secrets securely: regenerating
the session secret can make encrypted identities unreadable. The template
also deliberately disables the app, restores its placeholder image and denies
inbound traffic on redeployment. The later database secret, role assignment and
image configuration are not represented in the template; review and reconcile
this drift before making a later deployment.

No custom domain, provider credentials, deployment identity/workflow or
monitoring alerts have been configured. Production capacity, networking, DNS, recovery
objectives and privacy/security requirements remain unapproved. Basic hosting
and single-region storage/database provide no high availability; assess and
scale them before real traffic. PostgreSQL reported an earliest restore point
after provisioning. A pre-migration point-in-time restore was verified in an
isolated temporary server; synthetic Blob version/metadata and Key Vault
secret-version recovery were also rehearsed. These are not a coordinated
recovery of real data or a measured recovery-time test. Keep real data out
until coordinated recovery, monitoring, authorization and provider isolation
have been validated. Synthetic recovery versions may remain in Blob and
soft-deleted Key Vault retention until their configured retention periods expire.

A local production candidate image
(`sha256:bdebcbf902a3ee93f9c5b695873f1f5714aa8bacedfbaa0815a95ca19b41ce6a`)
was built with the default UDC hostname using the cached Wolfi base and upgraded
packages. A Trivy vulnerability scan found no high or critical findings. The
image is deployed by registry manifest digest
`sha256:042691997e27d2a00895d131a356e25775a6d02afe2c54b92cb5966bdae5af0d`.
Public checks verified the home page, an unauthenticated admin denial and a
database-backed invitation lookup. SCM returned 403 from an external client.

The generated [baseline migration](../migrations/0000_baseline.sql) and
[consent trigger migration](../migrations/0001_consent_ledger.sql) were
applied twice to disposable PostgreSQL 16, then applied to the empty Azure
database. The Azure migration verified 96 tables, two migration records and
the consent deletion guard; the migrated local schema passed the application
suite and consent update/delete protection tests.
The baseline is for a **new empty database only**. Do not apply it to an
existing Replit database or restore a complete dump over it without first
reviewing the source schema, migration history, restore method and rollback.
The source and scope of the real data and Blob objects are not yet established.

The default App Service hostname is provisionally configured as
`PUBLIC_APP_URL`; replacing it with a custom domain also requires updating
Blob CORS and rebuilding the image's `PRODUCTION_SITE_URL`. Add provider keys
directly to Key Vault, not to chat. For the first administrator, the next
critical provider configuration is a UDC-owned SendGrid API key and verified
`FROM_EMAIL`, because admin sign-in requires MFA delivery. Obtain and test
them with controlled recipients before live use. Public family and HeartPlan
registration return 503 in production until both a SendGrid key and an
explicit `FROM_EMAIL` are configured; this prevents account creation without
the ability to send verification emails. A configured key is not proof of
delivery. Do not use the database administrator as the permanent app identity.

### Data to inventory before import

- If preserving an existing application, obtain a consistent PostgreSQL backup,
  schema and migration history. Relevant records can include users and roles,
  cases, family memberships, consents, plans, payments, outreach and audit
  history. Confirm which records are actually needed; do not assume all tables
  should be copied, and avoid carrying over active sessions or live campaign
  state without review.
- Inventory uploaded documents, photos, audio and other objects separately.
  Preserve their object paths, contents, content types and access metadata.
- Determine whether existing encrypted identities require the original
  `SESSION_SECRET`. Never replace the production secret or import encrypted
  records until the matching-key and recovery procedure has been reviewed.
- Review saved nearest-relative results for invented contact information before
  migration or use, and reconcile payment and messaging records with their
  providers. Never copy provider credentials from another project.
- If starting genuinely empty, no historical data import is required; initialize
  the reviewed empty-database baseline and explicitly bootstrap an administrator
  only after recovery, connectivity and MFA delivery are ready.

## Proposed topology

```text
Users and provider webhooks
  -> UDC domain / TLS -> UDC Azure App Service (Linux custom container)
                          -> UDC PostgreSQL Flexible Server
                          -> UDC Blob Storage (private containers)
                          -> approved external providers
  -> browser uploads directly to Blob using short-lived scoped SAS

UDC Container Registry -> App Service image pull
UDC managed identities -> UDC Key Vault / Blob / Container Registry
UDC monitoring -> logs, metrics and alerts
```

| Resource | Proposed purpose and decisions still needed |
|---|---|
| UDC resource group(s) | Own resources, tags, access controls and cost reporting. Separate production and non-production; decide subscription, region and isolation. |
| Linux App Service plan, app and staging slot | Host the Node 24 image on port 5000; configure `WEBSITES_PORT=5000`, HTTPS, custom domain and certificate. Select capacity and deployment strategy after testing. Provision non-production separately with its own data and provider credentials. |
| Azure Container Registry | Store UDC images with immutable version/digest references; grant only the needed image-pull permission. |
| Azure Database for PostgreSQL Flexible Server | UDC application data and PostgreSQL sessions; plan capacity, TLS, firewall/private networking, restore and backup retention. Test the actual Node/PostgreSQL TLS configuration, including certificate validation. |
| Azure Storage account | UDC Blob objects in `private` and `public` containers, **both private**. Choose redundancy, access/network rules, retention and restore strategy. Browser access must work with any private-network restrictions. |
| Azure Key Vault | Store UDC secrets; grant the UDC app identity only the required secret-read access. Configure App Service Key Vault references and verify resolution and rotation behavior. |
| Managed identities | Assign UDC app/slot identities as appropriate; authorize separately for Key Vault, registry pull and Blob. Identity and role scope must be validated per slot. |
| Monitoring | UDC-owned Application Insights / Azure Monitor or equivalent for availability, logs, metrics and alerts. Restrict access and retention; review sensitive data handling before enabling telemetry. |
| Entra app registration, optional | UDC-owned single-tenant registration only if SSO is approved. Password authentication remains available. |
| DNS, certificate and delivery providers | UDC-owned domain, verified SendGrid sender, Twilio/RingCentral numbers, Stripe account/webhooks and OpenAI account as required. These are configuration and contractual dependencies, not all Azure resources. |

Networking, private endpoints, outbound IP needs, WAF, scaling, high
availability, retention and recovery targets are design decisions, not
validated properties of this deployment. Do not promise compliance or
availability until the configuration and operations are assessed.

## Configuration and secrets

Start with [.env.example](../.env.example); use App Service settings and Key
Vault references for deployment, never committed files, Docker build args,
logs or chat for secrets. Use separate production and non-production values.

| Setting | Production use |
|---|---|
| `DATABASE_URL` | UDC database connection string, including appropriate verified TLS settings; secret. |
| `SESSION_SECRET` | High-entropy secret shared consistently by the production instances. It also derives the key for encrypted next-of-kin identity data. Changing or losing it can make existing records unreadable. Securely back it up and rehearse a data-aware re-encryption/rotation and restore procedure before any rotation. |
| `NODE_ENV`, `PORT`, `PUBLIC_APP_URL`, `WEBSITE_SLOT_NAME` | Production mode, listening port, public HTTPS origin, and Azure-provided slot identity. Do not blindly override `WEBSITE_SLOT_NAME`; test the actual values and swap behavior. |
| `PRODUCTION_SITE_URL` | Public HTTPS origin injected into client metadata **at image build time**, not a secret. Build separately when the public origin differs; `PUBLIC_APP_URL` is a runtime setting. |
| `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_*_CONTAINER`, `AZURE_STORAGE_PUBLIC_SEARCH_PATHS` | Blob account URL, container names and optional comma-separated lookup prefixes. Prefer managed identity. |
| `AZURE_STORAGE_CONNECTION_STRING` | Optional secret alternative to managed identity. If set, it takes precedence over the account URL and identity. |
| `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `FROM_EMAIL` | Sending key, signed-event public key and verified sender. Configure signed SendGrid events and test delivery and verification. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe credentials and webhook signing secret; configure signed events and verify checkout, webhook handling and retries in test mode first. |
| `TWILIO_*`, `RINGCENTRAL_*` | Separate approved credentials and numbers. Explicitly set RingCentral environment; the SDK defaults to production when it is omitted. `TWILIO_VERIFY_SERVICE_SID` is currently only used for startup status, not Verify calls. |
| `OPENAI_API_KEY` | Direct OpenAI API credential for enabled AI features; review data handling and spend controls. |
| `UDC_WEBHOOK_KEY` | Shared secret for configured inbound/outbound webhook integrations; approve, restrict and test each receiver. |
| `AUTH_ENABLE_ENTRA_ID`, `OIDC_*` | Optional single-tenant SSO. Tenant GUID, client ID/secret and callback ending in `/api/callback` are required when enabled; register exact HTTPS redirects. It only signs in existing verified accounts and does not change roles. |
| `NER_API_URL`, `NER_REGISTRATION_PATH`, `SAL_API_URL` | Leave unset unless independently approved. Registry contracts are unverified, and registration failures can exhaust retries. The optional case-deletion notification is best-effort, with an unverified receiver and no status check or retry. |
| `ADMIN_SEED_*` | Used only by the explicit one-time `npm run db:bootstrap-admin` command, never by startup. Supply securely only while running it; omit from app settings. |

Secrets also include provider credentials, database backup access and any
connection strings. Establish owners, least privilege, expiry alerts,
backup/restore and a rotation procedure for each.

## Storage and media

- Provision both containers as private. Application ACLs and `aclpolicy` blob
  metadata control access; the container named `public` must not be made
  anonymously public.
- With managed identity, grant the needed Blob data access and user-delegation
  SAS permission: the current implementation requires **Storage Blob Data
  Contributor** and **Storage Blob Delegator**. Verify role scopes and
  propagation. Only set `AZURE_STORAGE_ACCOUNT_URL` when using this method.
- Browser uploads use short-lived SAS and direct Blob requests. Restrict Blob
  CORS to approved UDC origins; allow `PUT` and required headers including
  `Content-Type` and `x-ms-blob-type`. Test uploads from each approved origin.
- Inventory Replit objects before cutover. If present, plan a secure copy that
  preserves object names, `/objects/...` references, content types and
  `aclpolicy` metadata. Verify counts, checksums, authorization and media
  playback before switching; retain a recoverable source until acceptance.
- Legacy audio/video uploads use ffprobe to inspect tracks and duration, and
  transcription sends the media to OpenAI. An ffmpeg conversion helper exists
  separately; the current transcription path does not call it. Both tools are
  in the image. Exercise upload, transcription, range playback and resource
  limits using synthetic media in the actual hosting environment.

## Database and startup

1. Inventory source data, schema, extensions and downtime requirements.
   Establish encrypted backups and test restore into an isolated database.
2. Design and rehearse a reviewed, versioned schema/data migration on a
   production-like copy. `drizzle-kit push` is intended for disposable local
   development, not an unattended production migration. The `sessions`
   table must exist: the session store does not create it automatically.
3. Include the HeartPlan append-only consent trigger installed by
   [`script/ensure-consent-ledger.ts`](../script/ensure-consent-ledger.ts) in
   the reviewed migration. Verify its protection after deployment. Existing
   databases also need
   [`script/add-webhook-failed-permanent.sql`](../script/add-webhook-failed-permanent.sql)
   applied before deploying this version: the webhook retry worker stores the
   `failed_permanent` enum value when retries are exhausted. Back up, review,
   and rehearse this change on an isolated copy; the deployment workflow does
   not apply migrations. Automatic webhook retries are disabled because the
   former worker marked failures sent without dispatching them. Review failed
   logs and contact providers manually until a real dispatcher is implemented.
   Public-records relatives search is disabled until a verified provider is
   connected. Older saved relative results may be synthetic; review provenance
   before use or migration. Do not assume their contact details are genuine.
4. Startup no longer promotes or creates admins or deletes hard-coded cases.
   Existing promoted accounts are not automatically demoted; independently
   audit and review existing roles. Startup is **not read-only**: it still
   performs legacy category/schema changes and synchronizes demo flags.
   Review and move these into controlled migrations before production use.
5. Test the restore of database, matching Blob objects and the corresponding
   `SESSION_SECRET` together. Define a rollback point and handling for writes
   that occur after cutover.

For a genuinely empty users table, an operator can deliberately run
`npm run db:bootstrap-admin` with `DATABASE_URL`, `ADMIN_SEED_EMAIL` and
`ADMIN_SEED_PASSWORD` supplied through a secure temporary environment.
Optional `ADMIN_SEED_FIRST_NAME` and `ADMIN_SEED_LAST_NAME` identify the
account. The command creates only the first user, marks its email verified
based on the operator's prior verification, and refuses to change or promote
any existing user. The password must have at least 12 characters, at most
72 UTF-8 bytes and a special character. Do not place it in shell arguments or
permanent app settings. Admin login requires MFA; provision and test its
isolated delivery channel before relying on the account. Existing databases
need a separately reviewed, authorized account-management procedure.

### Local recovery rehearsal

A disposable PostgreSQL 16 database was initialized from the current schema
and its append-only consent trigger installed. A synthetic case, encrypted
identity and consent record were backed up with `pg_dump` and restored with
`pg_restore` into a separate database. A synthetic secret backed up separately
decrypted the restored identity; a different secret failed. Both update and
delete of restored consent evidence were rejected. The webhook enum migration
was also tested twice against an older temporary enum.

Separately, Azurite Blob snapshots were restored into distinct containers.
Checks verified names, contents, content types, `aclpolicy`, application ACLs
and rejection of anonymous Blob reads; the restored private object was read
through the application storage service. These are local synthetic rehearsals,
not Azure backup, Key Vault recovery, a production-like migration, or a
point-in-time coordinated restore. Azure-managed backups, Blob retention,
secret versions, network permissions, consistency, recovery times and
post-cutover reconciliation still need an Azure rehearsal.

## Deployment and cutover checklist

1. Approve architecture, ownership, access, budgets, data/privacy review and
   recovery targets; provision only UDC-owned resources. Establish UDC
   managed identities, role assignments, secrets and network access.
2. The Phase 13 workflows are present but have not run in GitHub or deployed to
   Azure. CI builds and scans the container and runs ffmpeg tests. Confirm all
   checks pass and complete the staging setup below before using deployment.
3. Restore/migrate database and Blob data according to rehearsed procedures.
   Configure production HTTPS origins, provider secrets and webhook endpoints
   (`/api/webhooks/stripe`, `/api/webhooks/sendgrid`, and, if used,
   `/api/ringcentral/webhook`). Verify provider signatures or shared-secret
   behavior and each provider's supported configuration; test with controlled
   accounts and recipients before live delivery.
4. Validate login, MFA, optional SSO, uploads/downloads and authorization,
   private identity decryption, media, billing, provider webhooks, background
   work, alerts and backup restore. Non-campaign transactional messages can
   send even in non-production; isolate test credentials and recipients.
5. **Before any slot swap:** pause campaigns, review pending recipients and
   content, and test actual `NODE_ENV` and `WEBSITE_SLOT_NAME` values during
   warm-up and after swap. Campaigns require `NODE_ENV=production` and
   `WEBSITE_SLOT_NAME=production`, but target slot settings may be applied to
   the source during warm-up. Do not rely on the slot gate alone or automate
   swaps until safe behavior has been demonstrated. Keep staging data and
   provider credentials isolated and verify no live messages are sent.
6. During the agreed cutover, stop source writes or use a reviewed final-sync
   procedure; validate database and object consistency, switch DNS and provider
   callbacks, monitor, and explicitly approve resuming campaigns.
7. Roll back using the tested image, DNS/provider configuration and coordinated
   database/Blob recovery plan. Do not overwrite or lose post-cutover writes;
   reconcile payment and message events before replay or resumption.

There is no documented dedicated health endpoint yet. Choose and test a
non-mutating probe before configuring production health checks. Review existing
request/response logging for sensitive data, then set alerts for availability,
errors, database/storage failures, webhook failures, campaign delivery and
provider spend without exposing user data.

## GitHub Actions setup and limits

[CI](../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and
manual dispatch. It uses a fresh PostgreSQL 16 service, synthetic credentials,
UTC and no external-provider credentials. It initializes its disposable database
with the versioned baseline and consent trigger. It runs the configured `npm test`,
the ORSA warmup unit/route and four database suites, a webhook enum migration
test, validation-route regressions, type-checking, public-route browser smoke
tests and certificate validation with a standalone Vite server and mocked APIs, and a Docker build whose
Dockerfile runs the media tests. Trivy scans the image and fails on high or
critical vulnerabilities; a separate production-dependency npm audit also fails
on high or critical findings. Manual dispatch can select the complete
`tests/e2e` Playwright suite. The separate `tests/assistant` suite is not
currently in CI.

These are real failure gates, not an accepted-error baseline. Local TypeScript
checking, application tests and the complete 50-test Playwright suite passed;
database tests used disposable PostgreSQL and browser tests used local Chrome.
The final Docker build passed, including three media tests. ORSA rolling budgets
now conservatively count future-dated traffic, with unit and PostgreSQL
regression tests. This does not replace testing the slot-swap and live campaign
controls described above. The original scan found 382 high/critical findings;
an intermediate Debian image had 291. The Zod advisory is addressed by the
Zod 4 migration; the Wolfi runtime uses packaged Node and patched media
dependencies. The replacement local image scan reported zero high/critical
findings, and the production npm audit passed that threshold while reporting
moderate findings. No exceptions have been approved. See
[IMAGE_VULNERABILITY_TRIAGE.md](./IMAGE_VULNERABILITY_TRIAGE.md) for the
complete inventories, limitations, and remediation requirements; counts may
change with the image and database.
CI must pass before deployment. GitHub-hosted CI, image publication and Azure
deployment have not been verified.

The currently authenticated GitHub account has write, but not admin, access
to `Jhakir-sal/udc`; `main` is unprotected and no environments were visible.
Actions settings returned HTTP 403. A repository administrator must configure
and verify the branch and environment protections before staging deployment.
The Container Registry resource provider is now registered in the subscription.
The local migration changes and workflows are uncommitted and therefore cannot
yet be dispatched from `main`. Provider sandbox credentials are not configured
or verified. Do not bypass these prerequisites.

[Deploy UDC staging](../.github/workflows/deploy-staging.yml) is manual and
reruns CI with the complete Playwright suite. After CI succeeds, the deployment
job requires `main`, explicit enablement, a protected `udc-staging` GitHub
environment, and a pre-existing UDC App Service `staging` slot. It verifies
that the UDC web app and registry both have the `application=udc` tag, builds
and scans the staging image before pushing a uniquely tagged image, resolves
its registry digest, and updates only that slot. Tags are an operator
safeguard, **not proof of ownership**. The workflow refuses to deploy if
staging auto-swap is configured; restrict who can change that setting during
deployment.
It does not promote or swap slots, configure infrastructure, migrate data, or
prove that App Service pulled the image and became healthy.

Before enabling it:

1. Provision and independently verify the UDC subscription, resource group,
   Linux web app with a `staging` slot, UDC registry, staging database and
   storage. Tag the web app and registry `application=udc`. Do not reuse
   resources, accounts or credentials from other projects.
2. Configure the GitHub environment `udc-staging` with required reviewers and
   a `main` deployment-branch restriction, and protect `main` and the workflow
   files. GitHub environment protections must be configured by an
   administrator; the workflow cannot enforce that reviewers exist. Do not
   enable deployment until they are configured.
3. Configure UDC's GitHub OIDC federated identity with a subject scoped to
   `repo:Jhakir-sal/udc:environment:udc-staging`. Grant the deployment
   principal only the required web-app configuration/read access and registry
   push/read access; separately grant the App Service slot identity permission
   to pull from UDC's registry. Confirm access in the intended subscription.
4. In the `udc-staging` environment, set secrets `AZURE_CLIENT_ID`,
   `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`; set variables
   `UDC_AZURE_RESOURCE_GROUP`, `UDC_AZURE_WEBAPP_NAME`, `UDC_ACR_NAME` and
   `UDC_PUBLIC_SITE_URL` (the staging HTTPS public origin baked into the
   image). Set `UDC_STAGING_DEPLOY_ENABLED=true` only after review. The
   resource group must contain both the app and registry. Configure runtime
   secrets and `PUBLIC_APP_URL` separately in App Service, not in image args.
5. Before each dispatch, confirm staging uses isolated data and provider
   credentials and campaigns are paused. After deployment, inspect the slot's
   container pull/startup, verify its digest and run safe synthetic checks.
   The workflow's successful configuration update is not a readiness check.
   Never perform a slot swap until the campaign warm-up behavior and rollback
   procedures in this document have been tested and approved.
