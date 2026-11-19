# Staff HeartPlan completion regression suite

Run the application, then run:

```sh
npm run test:e2e:heartplan-completion
```

The suite uses the existing Playwright configuration. To use the development
preview rather than its default local port:

```sh
PLAYWRIGHT_BASE_URL="https://$REPLIT_DEV_DOMAIN" npm run test:e2e:heartplan-completion -- --workers=2
```

On Replit, if Playwright's downloaded browser cannot load native libraries, set
`PLAYWRIGHT_EXECUTABLE_PATH` to the installed Nix Chromium wrapper. Leave it
unset in CI environments with Playwright's normal browser installed.

## Safety and scope

- Each test starts in a fresh browser context. Authentication is intercepted,
  with a synthetic `admin` role and `/admin` destination; no real login is used.
- Every API request is intercepted before reaching the application server.
  Unknown admin reads and all mutations are blocked and fail the test.
  External requests are blocked, and service workers are disabled.
- Fixtures contain only `.invalid` identities. Private-content canaries are
  deliberately included as extra response fields to detect accidental rendering;
  no files, private planning endpoints, or real records are read.
- Desktop and 390-pixel mobile tests cover Users → filtered list → partial/zero
  completion details → Back, direct entry/reload, first-column links and totals,
  checklist ordering, reserved query characters, and error-page Back navigation.
- Non-admin roles must redirect without requesting staff HeartPlan data.
- This is separate from `admin-heartplans.spec.ts`; it does not test stage
  filtering, stage calculations, or analytics.

API interception verifies browser behavior, not server authorization or
redaction. Server-side privacy checks must remain covered separately.
