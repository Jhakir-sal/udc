import { inArray } from "drizzle-orm";
import { db } from "./db";
import { caseTasks } from "@shared/schema";
import { calculateCaseProgress, type CaseProgress } from "@shared/caseProgress";

export async function caseProgressByCertificate(
  certificateIds: string[],
  accounts: { certificateId: string; status?: string | null; taskCompletionStatus?: string | null }[],
): Promise<Record<string, CaseProgress>> {
  if (!certificateIds.length) return {};
  const tasks = await db.select({
    certificateId: caseTasks.certificateId, taskKey: caseTasks.taskKey, completed: caseTasks.completed,
  }).from(caseTasks).where(inArray(caseTasks.certificateId, certificateIds));
  const tasksByCase = new Map<string, typeof tasks>();
  const accountsByCase = new Map<string, typeof accounts>();
  for (const task of tasks) {
    const group = tasksByCase.get(task.certificateId) || [];
    group.push(task); tasksByCase.set(task.certificateId, group);
  }
  for (const account of accounts) {
    const group = accountsByCase.get(account.certificateId) || [];
    group.push(account); accountsByCase.set(account.certificateId, group);
  }
  return Object.fromEntries(certificateIds.map(id => [
    id, calculateCaseProgress(tasksByCase.get(id) || [], accountsByCase.get(id) || []),
  ]));
}
