import { CASE_TASK_KEYS } from "./schema";

export interface CaseProgress {
  workflowCompleted: number;
  workflowTotal: number;
  accountsCompleted: number;
  accountsTotal: number;
  completed: number;
  total: number;
  percent: number;
}

function completionPercent(completed: number, total: number) {
  if (!total) return 0;
  if (completed === total) return 100;
  return Math.min(99, Math.round(completed / total * 100));
}

export function accountActionIsComplete(account: { status?: string | null; taskCompletionStatus?: string | null }) {
  // A successful transfer/continuation can leave the account active.
  // An explicit pending/failed result must not be overridden by an old closed status.
  if (["not_completed", "unsuccessful"].includes(account.taskCompletionStatus || "")) return false;
  return account.taskCompletionStatus === "successful" || account.status === "closed" || account.status === "suspended";
}

export function aggregateCaseProgress(items: CaseProgress[]): CaseProgress {
  const sums = items.reduce((sum, item) => ({
    workflowCompleted: sum.workflowCompleted + item.workflowCompleted,
    workflowTotal: sum.workflowTotal + item.workflowTotal,
    accountsCompleted: sum.accountsCompleted + item.accountsCompleted,
    accountsTotal: sum.accountsTotal + item.accountsTotal,
  }), { workflowCompleted: 0, workflowTotal: 0, accountsCompleted: 0, accountsTotal: 0 });
  const completed = sums.workflowCompleted + sums.accountsCompleted;
  const total = sums.workflowTotal + sums.accountsTotal;
  return { ...sums, completed, total, percent: completionPercent(completed, total) };
}

export function calculateCaseProgress(
  tasks: { taskKey: string; completed: boolean }[],
  accounts: { status?: string | null; taskCompletionStatus?: string | null }[],
): CaseProgress {
  const completedKeys = new Set(tasks.filter(task => task.completed).map(task => task.taskKey));
  const workflowCompleted = CASE_TASK_KEYS.filter(key => completedKeys.has(key)).length;
  const accountsCompleted = accounts.filter(accountActionIsComplete).length;
  const total = CASE_TASK_KEYS.length + accounts.length;
  const completed = workflowCompleted + accountsCompleted;
  return {
    workflowCompleted, workflowTotal: CASE_TASK_KEYS.length, accountsCompleted, accountsTotal: accounts.length,
    completed, total, percent: completionPercent(completed, total),
  };
}
