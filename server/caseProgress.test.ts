import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { certificates, caseTasks, connectedAccounts, users, CASE_TASK_KEYS } from "@shared/schema";
import { accountActionIsComplete, aggregateCaseProgress, calculateCaseProgress } from "@shared/caseProgress";
import { caseProgressByCertificate } from "./caseProgress";

test("case progress includes workflow work even when no account action is finished", () => {
  const tasks = CASE_TASK_KEYS.map((taskKey, index) => ({ taskKey, completed: index < 4 }));
  const accounts = Array.from({ length: 7 }, () => ({ status: "active", taskCompletionStatus: "pending" }));
  assert.deepEqual(calculateCaseProgress(tasks, accounts), {
    workflowCompleted: 4, workflowTotal: 9, accountsCompleted: 0, accountsTotal: 7,
    completed: 4, total: 16, percent: 25,
  });
  accounts[0].taskCompletionStatus = "successful";
  assert.equal(calculateCaseProgress(tasks, accounts).percent, 31);
  accounts[0].taskCompletionStatus = "pending";
  tasks[0].completed = false;
  assert.equal(calculateCaseProgress(tasks, accounts).percent, 19);
});

test("success covers transfers and continuation, but failures or pending work never count as success", () => {
  assert(accountActionIsComplete({ status: "active", taskCompletionStatus: "successful" }));
  assert(accountActionIsComplete({ status: "closed" }));
  assert(accountActionIsComplete({ status: "suspended" }));
  for (const taskCompletionStatus of ["pending", "not_completed", "unsuccessful", null]) {
    assert(!accountActionIsComplete({ status: "active", taskCompletionStatus }));
  }
  assert(!accountActionIsComplete({ status: "closed", taskCompletionStatus: "not_completed" }));
  assert(!accountActionIsComplete({ status: "suspended", taskCompletionStatus: "unsuccessful" }));
});

test("progress is bounded, counts each known workflow step once, and aggregates actual work rather than averaging percentages", () => {
  const complete = calculateCaseProgress(CASE_TASK_KEYS.map(taskKey => ({ taskKey, completed: true })), []);
  assert.equal(complete.percent, 100);
  assert.equal(calculateCaseProgress([], []).percent, 0);
  assert.equal(calculateCaseProgress([{ taskKey: "case_created", completed: true },
    { taskKey: "case_created", completed: true }, { taskKey: "unknown", completed: true }], []).completed, 1);
  const pending = calculateCaseProgress([], Array.from({ length: 100 }, () => ({ status: "active" })));
  assert.equal(aggregateCaseProgress([complete, pending]).percent, 8);
  assert.equal(calculateCaseProgress(CASE_TASK_KEYS.map(taskKey => ({ taskKey, completed: true })),
    [...Array.from({ length: 199 }, () => ({ status: "closed" })), { status: "active" }]).percent, 99);
  assert.deepEqual(aggregateCaseProgress([]), {
    workflowCompleted: 0, workflowTotal: 0, accountsCompleted: 0, accountsTotal: 0, completed: 0, total: 0, percent: 0,
  });
});

test("dashboard progress reads persisted task changes without writing or leaking work across cases", async () => {
  const owner = randomUUID(), caseA = randomUUID(), caseB = randomUUID();
  try {
    await db.insert(users).values({ id: owner, role: "user", email: `${owner}@example.invalid` });
    await db.insert(certificates).values([caseA, caseB].map(id => ({
      id, userId: owner, deceasedName: "Synthetic Progress Case", dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01",
      certificateNumber: `SYN-PROGRESS-${id}`, issuingAuthority: "Synthetic",
    })));
    await db.insert(caseTasks).values([
      { certificateId: caseA, taskKey: "case_created", completed: true },
      { certificateId: caseA, taskKey: "certificate_uploaded", completed: true },
      { certificateId: caseB, taskKey: "case_created", completed: false },
    ]);
    await db.insert(connectedAccounts).values([
      { certificateId: caseA, accountName: "Synthetic A", accountType: "Savings", category: "financial", status: "active", taskCompletionStatus: "successful" },
      { certificateId: caseB, accountName: "Synthetic B", accountType: "Savings", category: "financial", status: "closed", taskCompletionStatus: "successful" },
    ]);
    const accounts = await db.select().from(connectedAccounts).where(inArray(connectedAccounts.certificateId, [caseA, caseB]));
    const one = await caseProgressByCertificate([caseA], accounts);
    assert.deepEqual(Object.keys(one), [caseA]);
    assert.equal(one[caseA].completed, 3);
    assert.equal(one[caseA].total, 10);
    assert.equal(one[caseA].percent, 30);
    assert(!JSON.stringify(one).includes("Synthetic"));
    const rows = await db.select().from(caseTasks).where(eq(caseTasks.certificateId, caseA));
    assert.equal(rows.length, 2); // Read does not auto-complete or seed staff's checklist.
    await db.update(caseTasks).set({ completed: false }).where(eq(caseTasks.id, rows[0].id));
    const fresh = await caseProgressByCertificate([caseA, caseB], accounts);
    assert.equal(fresh[caseA].percent, 20);
    assert.equal(fresh[caseB].percent, 10);
    assert.deepEqual(await caseProgressByCertificate([], accounts), {});
  } finally {
    await db.delete(connectedAccounts).where(inArray(connectedAccounts.certificateId, [caseA, caseB]));
    await db.delete(certificates).where(inArray(certificates.id, [caseA, caseB]));
    await db.delete(users).where(eq(users.id, owner));
    await pool.end();
  }
});
