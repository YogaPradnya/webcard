# Turso Cloud — post-incident report: episodic batch()/transaction() stalls on `botlog-restore`

**Reported by:** YogaPradnya (github.com/YogaPradnya) — app: https://kartu.yogaa.web.id
**Incident date:** 2026-10-17, observed **06:00–06:35 UTC** (14:00–14:35 UTC+8), recovered by **~06:50 UTC**
**Database:** `botlog-restore` — `libsql://botlog-restore-yogp.aws-ap-northeast-1.turso.io`
(org suffix `yogp`, group `default`, primary region `aws-ap-northeast-1`, size ~10 MB)
**Client:** `@libsql/client` **0.15.15**, Node.js **v26.8.1** (x86_64 Linux), default HTTP client (Hrana over fetch)
**Networks:** probe machine in UTC+8; production server (Singapore VPS) showed matching timeouts simultaneously

## Summary

During the window above, `db.batch(...)` and the **first** `db.transaction('write')` per process
became catastrophically slow (tens of seconds) on this database, while single-statement
`db.execute(...)` remained in the 0.15–1.3 s range. This took down our production web app
(server timeouts → 503s, p95 ~8 s, ~16% error rate).

After ~06:50 UTC the same scripts, same database, same client and same network were **fully fast
again**. The slowdown was extreme but transient (~30+ minutes of degradation observed).

## Measurements during the incident (06:18–06:35 UTC)

Plain Node.js scripts, no application code involved:

| Operation | Latency |
|---|---|
| `db.execute` single statement (read or write) | 0.5–1.3 s |
| `db.batch([1 stmt])` | **23–46 s** |
| `db.batch([2 stmts])` | **~68 s** |
| `db.batch([2 SELECTs])` — read-only | **~31 s** |
| first `db.transaction('write')` per new process | **12–35 s** |
| subsequent write transaction (same process) | < 1 s |
| rollback | fast (< 1 s) |

## Re-tests after recovery (06:57–07:05 UTC)

Same database, client, network and scripts:

| Operation | Latency |
|---|---|
| `db.execute` single statement | 0.15–0.56 s |
| `db.batch` 2 SELECTs (read-only) | 0.20–0.33 s |
| `db.batch` 2 INSERTs | 0.16 s |
| first write tx (new process) | 0.61 s |
| second write tx | 0.28 s |

## Isolation checks (after recovery, scratch DBs since destroyed)

| Database | Group | Result |
|---|---|---|
| fresh DB in a brand-new group, same region | new group | all ops < 1.05 s |
| fresh DB in same `default` group | `default` | all ops < 0.4 s |

(Both scratch databases were destroyed right after. Since these ran *after* recovery, they do not
discriminate instance-vs-database; they only show there is no persistent database-level problem.)

## Platform status during the window (status.turso.tech)

- At the time of the incident the status page aggregate state was **degraded**, last updated
  **2026-10-17 06:18:42 UTC** — exactly when our degradation began.
- Ongoing incident: **"Degraded for Fly regions"** (created 2026-10-16 18:24 UTC, still open as of
  07:15 UTC Oct 17): *"Fly is rolling out host reboots platform wide and databases will become
  unavailable during the reboot."* — Fly "Global" recorded ~25,983 s of degradation on Oct 17 alone
  (nearly the whole day so far).
- However, our database instance is on **AWS ap-northeast-1** (instance location
  `aws-ap-northeast-1`; architecture reported by your CLI: `turso-server:diskless:multi-tenant`),
  and the status page shows **AWS ap-northeast-1 operational with 0 s downtime** on Oct 16–17.
- So the monitored AWS-region status did not catch this. The degradation we saw was partial
  (single `execute` fine, batch/streams stalled), which may have stayed below the status probes'
  thresholds.

## Notes

- The **read-only** batch being slow suggests it was not merely write-lock contention.
- Our app was up during the window (it used batch/transactions on hot request paths; we have since
  removed those). Load was modest (~1.25k requests/day on the busiest endpoint, plus 5–30 s polling).
- We cannot reproduce the stall afterwards, so no deterministic repro. Minimal repro used:

```js
const { createClient } = require('@libsql/client');
const db = createClient({ url, authToken });
console.time('batch');
await db.batch([{ sql: 'SELECT 1', args: [] }, { sql: 'SELECT 2', args: [] }]);
console.timeEnd('batch');
console.time('tx');
const tx = await db.transaction('write');
await tx.execute({ sql: 'CREATE TABLE IF NOT EXISTS t (x)', args: [] });
await tx.commit(); tx.close();
console.timeEnd('tx');
```

## Questions

1. Can you check infra/telemetry for the instance(s) serving `botlog-restore-yogp` (AWS
   ap-northeast-1, multi-tenant) between **06:00–06:35 UTC on 2026-10-17**? (storage degradation,
   Hrana stream stalls, instance migration/failover, noisy neighbors on the shared instance)
2. Could the platform-wide **Fly host reboots** affect AWS-hosted multi-tenant databases in any
   way (shared control plane, S3/diskless layer, routing), or is that ruled out?
3. Is this a known failure mode where **batch/streams stall while single-statement execute stays
   fine**? Should we expect recurrence, and what client-side mitigations (timeouts/retries/backoff)
   do you recommend for Hrana batch/stream calls?

Happy to provide more data (full logs, exact per-measurement timestamps) if useful.
