import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  certificates, heartPlans, caseTasks, creditProtectionRequests,
  creditPullResults, creditPulls, nerAnalysis, mailServiceRequests,
  appointments, notifications, lifeInsurancePolicies, nearestRelatives,
  connectedAccounts, beneficiaries, governmentNotifications, caseMessages,
  familyInvitations, salNotifications, lpoaDocuments, familyDocuments,
  webhookLogs,
} from "@shared/schema";

export class CaseDeletionConflict extends Error {}

/** Delete a case's database records atomically. User accounts and HeartPlans are not deleted. */
export async function deleteCaseRecords(
  certId: string,
  database: Pick<typeof db, "transaction"> = db,
) {
  return database.transaction(async (tx) => {
    const [certificate] = await tx.select().from(certificates)
      .where(eq(certificates.id, certId)).for("update");
    if (!certificate) return null;

    const [linkedPlan] = await tx.select({ id: heartPlans.id }).from(heartPlans)
      .where(eq(heartPlans.certificateId, certId)).limit(1);
    if (linkedPlan) {
      throw new CaseDeletionConflict(
        "This case is linked to a converted HeartPlan. Deletion is blocked to preserve the plan and its history.",
      );
    }

    // Non-cascading relationships must be removed before the certificate.
    // Delete account-dependent notifications/beneficiaries before their accounts,
    // and credit results before credit pulls. Cascading case tables are removed
    // by PostgreSQL when the certificate is deleted.
    const children = [
      caseTasks, creditProtectionRequests, creditPullResults, creditPulls,
      nerAnalysis, mailServiceRequests, appointments, notifications,
      lifeInsurancePolicies, nearestRelatives, beneficiaries,
      governmentNotifications, caseMessages, familyInvitations,
      lpoaDocuments, familyDocuments, webhookLogs, connectedAccounts,
    ];
    for (const table of children) {
      await tx.delete(table).where(eq(table.certificateId, certId));
    }
    await tx.delete(salNotifications).where(eq(salNotifications.caseId, certId));
    await tx.delete(certificates).where(eq(certificates.id, certId));
    return certificate;
  });
}
