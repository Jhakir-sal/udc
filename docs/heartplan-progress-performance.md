# HeartPlan staff progress performance check

## Run

```sh
npm run test:heartplan-admin
npm run test:heartplan-progress-performance
```

The first command runs fast mapping/privacy/route/negative-guard tests. The second
requires the development/test `DATABASE_URL` and fails explicitly if it is absent.
Do not run against production (the command also rejects `NODE_ENV=production`).
It uses the existing `pg` and Drizzle dependencies; no additional database service
or package is needed. Allow approximately 20 seconds on the baseline environment.

Full synthetic JSON plans and all latency samples are written to
`generated-artifacts/heartplan-progress/latest.json`. The most recent EXPLAIN is
also saved as `last-explain.json`, including when a plan assertion fails. These
generated files are excluded from Git and deployment. They contain synthetic
plans, not database credentials or real planner information.

## Isolation and fixture

One dedicated PostgreSQL connection runs inside a transaction with
`search_path=pg_temp,pg_catalog`. Nine **temporary** tables are created from the
application's Drizzle column definitions, without reading public schema metadata,
copying production tables, or fetching real records. All writes and ANALYZE
statements explicitly target `pg_temp`. Tables disappear on rollback/connection
close, including failure cleanup. No production schema, index, or stored data is
modified. No application startup, schedulers, email senders, or auth-provider
connections are imported.

The fixture has 10,000 owners, 10,000 plans, 10,000 wishes, and:

| Item table | Per plan | Rows |
|---|---:|---:|
| Documents | 8 | 80,000 |
| Assets | 6 | 60,000 |
| Letters | 4 | 40,000 |
| Contacts | 3 | 30,000 |
| Events | 5 | 50,000 |
| Activation requests | 2 | 20,000 |
| **Total items (excluding wishes)** | **28** | **280,000** |

10% of plans are converted; half have paid Legacy metadata. Profile/wishes
completion varies deterministically, as do missing contact emails and failed
deliveries. Private fields carry wide `PRIVATE_FIXTURE` sentinels (roughly
600–800 bytes per seeded private text value), rather than unrealistically empty
item records. Tests verify every plan's counts/completion/delivery status and
latest event, as well as the exact list/filter/summary results.

Existing column primary/unique constraints are reproduced, including the unique
wishes `plan_id`; no new grouped-item `plan_id` index is invented. Foreign keys,
NOT NULL/default constraints, and public enum types are unnecessary for this
SELECT benchmark and are not copied; enums use text. This is a deterministic
performance fixture, not a production schema migration or a full data model test.

Session settings: `work_mem=64MB`, `jit=off`, parallel workers per gather `0`,
statement timeout `15s`, lock timeout `1s`. Serial execution makes scan-loop
counts comparable. Planner choices can vary across PostgreSQL versions.

## Recorded baseline

Measured 2026-10-11 on development PostgreSQL **16.10**, x86_64 Linux. SQL numbers
are medians of five `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` samples after
an initial query. HTTP numbers are medians of five complete responses after one
warm-up, including the real SQL, Drizzle mapping, filtering/summary computation,
Express JSON serialization, and full response-body transfer on loopback.

| Query/endpoint | Median | Response |
|---|---:|---:|
| SQL, all plans | 270.0 ms | 10,000 rows |
| SQL, explicit 10,000-ID scope | 297.8 ms | 10,000 rows |
| SQL, single plan scope | 110.3 ms | 1 row |
| `GET /api/admin/heartplans/progress-summary` | 391.9 ms | 84 bytes |
| `GET /api/admin/heartplans` | 526.6 ms | 8,004,206 bytes |
| `GET /api/admin/heartplans?stage=complete&payment=paid` | 367.5 ms | 1,082,917 bytes |

Full/scoped plans use hash joins and six grouped aggregates; contacts use an
ordered aggregate with a sort. Each of the six grouped-item tables has one
sequential scan with **Actual Loops = 1**. The full-query scan row counts match
the table above. Users are scanned once; HeartPlans use an index scan for all
plans and a sequential scan for the large explicit scope in this baseline.
Wishes use a **hashed existence subplan**, scanned once and retaining 3,333
completed wishes, not 10,000 correlated item-table scans.

Single-plan execution uses primary-key index scans for the plan/owner and a
unique-index existence check for wishes (one loop). The other item tables still
each scan their entire heap once and filter to the requested plan: returned scan
rows are 8/6/4/3/5/2. This explains the 110 ms baseline despite only one result.
No index changes are included; any future index migration needs separate approval.

The full and large-scope root projected width is 272 bytes; baseline scratch
spill reads/writes are zero. Full-query root local-buffer counters were 1,697
hits / 50,694 reads (temporary fixture buffers, not public table reads).
Timings include local-buffer churn, not guaranteed entirely memory-resident data.

## Regression gates

- Every successful list/summary HTTP request executes exactly **one** database
  query, including filtered lists. These are the same handlers and record mapper
  wired by `server/routes.ts`; only database and auth middleware are injected.
  Synthetic unauthenticated/non-admin HTTP requests return 401/403 without queries.
  Production middleware wiring remains covered by the fast admin route tests.
- All, large-scope, and single-plan JSON EXPLAIN plans must have exactly one scan
  node per fixture table and **Actual Loops = 1**. Aggregates cannot repeat per
  plan. A repeated scan fails even when latency remains under budget.
- SQL rejects broad `SELECT *`, named private fields, and future/non-allowlisted
  qualified table fields. Returned database rows have an exact field allowlist;
  list responses likewise have an exact operational-field allowlist. Neither
  may contain private sentinels. Negative tests prove bad scan loops, duplicate
  scan nodes, broad projections, future private fields, and leaks fail the guards.
- SQL execution median must be below **2,000 ms** per shape; complete endpoint
  response median must be below **5,000 ms**. These fixed, generous limits catch
  substantial slowdowns without treating shared development-host noise as an SLA.
  Individual database statements are additionally bounded by the 15-second timeout.

**EXPLAIN privacy caveat:** PostgreSQL may list every physical column in a heap
scan's `Output` even for a narrow SQL query, or omit `Output` for an existence
index scan. That alone is not a client-side private projection. Privacy guards
check the compiled SQL, projected expressions above scans, and actual returned
keys/sentinels instead; scan nodes are used to verify execution counts.

This benchmark does not measure browser rendering, public-network latency,
concurrent production load, or real production distribution. In particular, the
unpaginated list's ~8 MB response is a separate scaling concern even though this
fixture passes. Do not raise the limits automatically when a check fails: inspect
the saved plan and samples first.
