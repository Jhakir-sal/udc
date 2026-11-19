# Case assistant regression checks

Run from the repository root:

```sh
npm run test:assistant
```

This type-checks the harness and its imported components, then runs the
existing intent unit tests and the connected React component
checks in desktop Chromium and mobile Chromium. In CI, install the matching
Playwright browser using the usual Playwright setup. In the Replit shell,
use the provided Chromium wrapper when the downloaded browser lacks native
libraries:

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/repl/tools/bin/chromium npm run test:assistant -- --workers=2
```

The command manages its own Vite-only server on port 5173, then stops it.
It does **not** start Express, the normal application workflow, schedulers,
provider SDKs, or a database. No secrets, sign-in, or real records are needed.
The harness is separate from both the production client entry point and
the general `tests/e2e` suite. Normal `npm test` and `npm run test:e2e` do
not start this server or discover these checks.

The harness mounts the real `ConciergeAssistant`, `AccountEmailIntake`
(through the assistant), `SallyChat`, Radix sheet/portal, query client,
toasts, and application CSS under React StrictMode. Synthetic case switches
change props on the **same** assistant instance; do not add a case-based key
or replace switches with full page reloads.

Each test explicitly stubs its expected API calls. Unlisted API requests
and external requests are blocked and fail the test. The application's webfont
hosts are intentionally blocked without failing; fonts are irrelevant to
the behavior being checked. Responses can be held and released to exercise
case-switch races without fixed network sleeps. The overlay check uses
browser `elementFromPoint`, normal pointer clicks, focus, and typing—not
forced clicks or programmatic focus.

Covered behaviors:

- Automatic and explicit pasted-account routing; one analysis per paste.
- No source text in advisory requests, visible chat, or later chat history.
- Confirmation starts unchecked, is revoked by edits, and gates saving.
- Exact case-scoped import URL and allowlisted reviewed payload.
- Ordinary summaries, questions, and drafts retain advisory conversation history.
- Late old-case chat and extraction replies, plus already-confirmed old-case reviews.
- Attachment-based advisory analysis and the warning/disabled account action
  until the attachment is removed.
- Case composer hit-testing with Sally already open, plus standalone Sally
  sending, close button, toggle close, reopen, focus, and retained history.

The existing database-backed `server/accountEmailIntake.test.ts` remains
separate: it verifies server authorization, redaction, duplicate handling,
and persistence. These checks add the connected client behavior rather than
replacing those backend tests.
