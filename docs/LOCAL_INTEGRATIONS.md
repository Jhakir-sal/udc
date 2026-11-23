# Local provider setup

These integrations can communicate with real external services. Use a disposable
local database, synthetic data, test accounts and recipients you control. Never
put credentials in Git, chat, shell history, screenshots, or command output.
Edit the existing ignored `.env` directly; do not replace its database, session,
or authentication settings. Restart the server after changing it.

The app does not load `.env` by itself. With the existing Node 22 installation:

```sh
cd ~/Developer/udc
NODE_ENV=development ~/.nvm/versions/node/v22.23.5/bin/node --env-file=.env ./node_modules/tsx/dist/cli.mjs server/index.ts
```

The local database container must be running. Use the `PORT` already set in
`.env` (currently 5050). Email links fall back to that localhost port unless a
`PUBLIC_APP_URL` is configured. Set it to an absolute HTTP(S) origin (for
example, `http://localhost:5050`) when testing externally reachable links.
Never set `WEBSITE_SLOT_NAME=production` locally. Campaign delivery requires
both `NODE_ENV=production` and `WEBSITE_SLOT_NAME=production`; an unset or
staging slot disables it. Other transactional provider calls can still send.

## Microsoft Entra ID sign-in

Email/password remains enabled. Entra SSO is disabled unless
`AUTH_ENABLE_ENTRA_ID=true`. To enable it, register a single-tenant web
application in Microsoft Entra ID and set these values in the ignored `.env`:

```dotenv
AUTH_ENABLE_ENTRA_ID=true
OIDC_TENANT_ID=
# Optional; defaults to https://login.microsoftonline.com/<tenant-guid>/v2.0
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_CALLBACK_URL=http://localhost:5050/api/callback
# Optional; defaults to the callback origin + /login
OIDC_POST_LOGOUT_REDIRECT_URL=http://localhost:5050/login
```

Register the exact local callback URL with the Entra application, and use the
same redirect origin for post-logout. `OIDC_TENANT_ID` must be a tenant GUID;
the issuer must be that tenant's Microsoft v2.0 endpoint. SSO only signs in
existing application accounts whose email is already verified; it does not
create accounts or change roles. Staff and users requiring MFA still receive
the app's existing MFA challenge. Enabling this flow triggers live Entra
discovery at server startup and may send real MFA messages on successful sign-in.
Use a test tenant and test accounts.

## Credentials to add

Enter values directly in `.env`, replacing any existing placeholder rather than
adding duplicate keys. Leave an integration unconfigured until its test
credentials are available. An empty OpenAI key disables AI requests but does
not prevent startup.

```dotenv
# SendGrid: use a verified sender and an appropriately scoped API key.
SENDGRID_API_KEY=
FROM_EMAIL=
# Only for signed event webhook testing:
SENDGRID_WEBHOOK_PUBLIC_KEY=

# Twilio: test credentials and a compatible test sender where possible.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# RingCentral: credentials and SMS number from the same sandbox account.
RINGCENTRAL_ENVIRONMENT=sandbox
RINGCENTRAL_CLIENT_ID=
RINGCENTRAL_CLIENT_SECRET=
RINGCENTRAL_JWT_TOKEN=
RINGCENTRAL_PHONE_NUMBER=

# Stripe: use a test-mode secret or restricted key, never a live key.
STRIPE_SECRET_KEY=
# Only for signed webhook testing; use the local listener's signing secret.
STRIPE_WEBHOOK_SECRET=

# Direct OpenAI API. Use a valid OpenAI API key, not a Replit Gateway key.
OPENAI_API_KEY=
```

`FROM_EMAIL` must be a sender verified in the SendGrid account. The application
otherwise defaults to `hello@stepsafterlife.com`. Non-campaign transactional
email can really be sent in development if a working key is present. Use
only controlled test recipients.

Twilio handles non-admin authentication SMS when configured, with RingCentral
fallback for certain failures; staff authentication uses RingCentral. Other SMS
flows also use these providers. SMS can be sent in development, even though
ORSA campaign sends are gated. Twilio test credentials may not support all
flows or deliver messages to handsets. The code reads
`TWILIO_VERIFY_SERVICE_SID` for a startup message but does not use Twilio
Verify to send or check codes; the application generates its own codes.

RingCentral defaults to its **production** API when
`RINGCENTRAL_ENVIRONMENT` is absent or `production`; `sandbox` selects the
sandbox API. Other values fail initialization. Startup authenticates and
polls inbound SMS, potentially storing messages in the local database, so do
not connect a production account to a disposable environment. Sandbox SMS
availability and recipient restrictions depend on the account.

Stripe payment and Identity clients use `STRIPE_SECRET_KEY`; Replit Connector
credentials are no longer read. Some routes create Checkout or Identity
sessions, so only use test-mode credentials and synthetic identities.

Direct OpenAI calls may incur charges and transmit input data to OpenAI. The app
uses `gpt-4o`, `gpt-5.2`, and `gpt-4o-mini-transcribe` in active features;
access depends on the OpenAI account. All AI features, including hard-asset
valuation and audio transcription, require `OPENAI_API_KEY`. The application
uses the direct `https://api.openai.com/v1` endpoint; the old
`AI_INTEGRATIONS_OPENAI_*` settings are no longer read. If your old key is a
valid direct OpenAI API key, enter it as `OPENAI_API_KEY` privately; a Replit
Gateway key is not a substitute. Use synthetic data for testing.

## Azure Blob Storage

The application stores private files in a private Azure container. For local
development, use an Azurite Blob endpoint or a development storage account; do
not use production storage with local or synthetic data. Configure one of:

```dotenv
# Local Azurite example; create the configured containers before starting the app.
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
# Alternatively, use an account URL with DefaultAzureCredential (for example,
# Azure CLI credentials locally or managed identity when hosted in Azure):
# AZURE_STORAGE_ACCOUNT_URL=https://<account>.blob.core.windows.net
AZURE_STORAGE_PRIVATE_CONTAINER=private
AZURE_STORAGE_PUBLIC_CONTAINER=public
# Optional comma-separated blob-name prefixes searched in the public container.
AZURE_STORAGE_PUBLIC_SEARCH_PATHS=
```

Create the `private` and `public` containers in the selected storage account
before using uploads. Keep both containers private; application authorization
and short-lived, per-blob upload SAS URLs control access. The SAS grants create
and write access to one blob and expires after 15 minutes. With managed
identity, grant the app identity **Storage Blob Data Contributor** and
**Storage Blob Delegator** permissions; do not enable account-wide anonymous
blob access.

Configure the storage account's Blob service CORS to allow the exact local and
production app origins, `PUT`, and the `Content-Type` and `x-ms-blob-type`
request headers (plus any response headers the browser needs). Every direct
browser upload sends `x-ms-blob-type: BlockBlob`. CORS does not grant storage
authorization; keep the upload SAS scoped and short-lived.

Stored database paths remain `/objects/<blob-name>`. Before production cutover,
determine whether Replit contains production objects that must be copied to
Azure. The migration must preserve content type and map the old
`custom:aclPolicy` metadata to Azure's `aclpolicy` metadata key; do not cut over
until object paths, ACLs, and representative media have been verified.

## Webhooks and validation

1. Start the server and check that `http://localhost:5050/` responds. Startup
   logs showing a client initialized or configured do **not** prove that its
   credentials work. Check RingCentral login results separately; startup
   automatically attempts authentication if all four credentials are present.
2. Verify each other account and credential through its provider dashboard using
   read-only operations. Then, only when ready, test individual transactional
   flows with controlled recipients, sandbox/test credentials and synthetic
   records. Do not run campaign sends. Stripe Checkout and Identity tests
   create test objects; OpenAI requests may be billable.
3. For Stripe webhook testing, run an authenticated Stripe CLI test-mode
   listener forwarding to `http://localhost:5050/api/webhooks/stripe`; put its
   signing secret in `STRIPE_WEBHOOK_SECRET` privately and restart the app.
   The listener must stay running. The CLI is not required for ordinary local
   startup and is not currently installed by this project.
4. SendGrid event webhooks require an externally reachable HTTPS endpoint and
   the corresponding verification public key for signed testing. Do not expose
   the local app publicly without reviewing the tunnel and local data first.
   RingCentral currently polls inbound SMS after login; its webhook endpoint
   also requires the `UDC_WEBHOOK_KEY` header for event delivery, so standard
   provider delivery compatibility needs separate verification.

Successful credential checks are distinct from end-to-end testing and from
delivery confirmation. Local uploads require the Azure Blob or Azurite setup
above. Legacy media uses `ffprobe` to inspect tracks and duration before
transcription; `speechToText` sends the media buffer to OpenAI. The separate
ffmpeg conversion helper is not called by that transcription path. Both tools
are included in the Docker image; install them locally to test media without
Docker, then run `npm run test:media`.
