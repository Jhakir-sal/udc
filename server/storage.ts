import { db } from "./db";
import { readHeartPlanAdminData, readHeartPlanAdvisorSummary, type HeartPlanAdminData, type HeartPlanAdvisorSummary } from "./heartPlanProgressStorage";
import { isSyntheticNaicPolicy } from "./naicSafety";
import { orsaLegacyExtensionDates } from "./orsaLegacyExtension";
import { mfaCode, phoneEnrollmentCode } from "./verificationCodePurpose";
import { eq, sql, desc, inArray, and, isNull, lt, gt } from "drizzle-orm";
import { 
  certificates, 
  connectedAccounts, 
  notifications, 
  webhookLogs,
  serviceProviders,
  beneficiaries,
  appointments,
  governmentNotifications,
  estateRegistry,
  nerAnalysis,
  creditProtectionRequests,
  mailServiceRequests,
  type Certificate,
  type InsertCertificate,
  type ConnectedAccount,
  type InsertConnectedAccount,
  type Notification,
  type InsertNotification,
  type WebhookLog,
  type InsertWebhookLog,
  type ServiceProvider,
  type InsertServiceProvider,
  type Beneficiary,
  type InsertBeneficiary,
  type Appointment,
  type InsertAppointment,
  type GovernmentNotification,
  type InsertGovernmentNotification,
  type EstateRegistry,
  type InsertEstateRegistry,
  type NerAnalysis,
  type InsertNerAnalysis,
  type CreditProtectionRequest,
  type InsertCreditProtectionRequest,
  type MailServiceRequest,
  type InsertMailServiceRequest,
  creditPulls,
  creditPullResults,
  type CreditPull,
  type InsertCreditPull,
  type CreditPullResult,
  type InsertCreditPullResult,
  lifeInsurancePolicies,
  caseMessages,
  nearestRelatives,
  type LifeInsurancePolicy,
  type InsertLifeInsurancePolicy,
  type CaseMessage,
  type InsertCaseMessage,
  type NearestRelative,
  type InsertNearestRelative,
  salNotifications,
  type SalNotification,
  type InsertSalNotification,
  smsMessages,
  type SmsMessage,
  type InsertSmsMessage,
  lpoaDocuments,
  type LpoaDocument,
  type InsertLpoaDocument,
  caseIdentityReviews,
  type CaseIdentityReview,
  type InsertCaseIdentityReview,
  lpoaRequests,
  type LpoaRequest,
  type InsertLpoaRequest,
  caseTasks,
  CASE_TASK_KEYS,
  type CaseTask,
  type InsertCaseTask,
  familyDocuments,
  type FamilyDocument,
  type InsertFamilyDocument,
  caseEvents,
  type CaseEvent,
  type InsertCaseEvent,
  heartPlans,
  orsaLegacyEntitlements,
  orsaLegacyPurchases,
  heartPlanIntakes,
  heartPlanConsentRecords,
  heartPlanDeletionJobs,
  planWishes,
  planDocuments,
  planAssets,
  planDiscoverySessions,
  planDiscoveryItems,
  planContacts,
  MAX_INFO_EMAIL_ATTEMPTS,
  planLetters,
  planEvents,
  planActivationRequests,
  type PlanActivationRequest,
  type InsertPlanActivationRequest,
  type HeartPlan,
  type InsertHeartPlan,
  type HeartPlanIntake,
  type InsertHeartPlanIntake,
  type HeartPlanConsentRecord,
  type InsertHeartPlanConsentRecord,
  type HeartPlanDeletionJob,
  type PlanWishes,
  type InsertPlanWishes,
  type PlanDocument,
  type InsertPlanDocument,
  type PlanAsset,
  type InsertPlanAsset,
  type PlanDiscoverySession,
  type InsertPlanDiscoverySession,
  type PlanDiscoveryItem,
  type InsertPlanDiscoveryItem,
  type PlanContact,
  type InsertPlanContact,
  type PlanLetter,
  type InsertPlanLetter,
  type PlanEvent,
  type InsertPlanEvent,
  marketplaceCategories,
  marketplaceProviders,
  marketplaceEvents,
  orsaRosterMembers,
  orsaRosterAudits,
  householdMembers,
  householdBillingOperations,
  isMarketplaceProviderPubliclyEligible,
  type MarketplaceCategory,
  type InsertMarketplaceCategory,
  type MarketplaceProvider,
  type InsertMarketplaceProvider,
  type MarketplaceEvent,
  type InsertMarketplaceEvent
  ,referralCompanies,
  caseReferrals,
  referralMilestoneDeliveries,
  type ReferralCompany,
  type InsertReferralCompany,
  type CaseReferral,
  type ReferralMilestoneDelivery
} from "@shared/schema";
import { isDemoAccountEmail, normalizeAccountEmail } from "@shared/demoAccounts";
import { users, funeralHomes, type User, type UpsertUser, type FuneralHome, type InsertFuneralHome } from "@shared/models/auth";
import { ilike, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { legalNamesMatch } from "@shared/legalName";
import { normalizePartnerActivityRow, type PartnerActivityRow } from "./partnerActivity";

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: Partial<User> & { id: string }): Promise<User>;
  syncDemoAccountFlags(): Promise<void>;
  updateUserPhone(userId: string, phoneNumber: string, code: string, expiry: Date): Promise<boolean>;
  updateUserPhoneVerification(userId: string, code: string | null, expiry: Date | null): Promise<void>;
  consumeMfaCode(userId: string, code: string): Promise<boolean>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  verifyUserPhone(userId: string, code: string): Promise<boolean>;
  updateUserIdVerification(userId: string, sessionId: string, status: "not_started" | "pending" | "verified" | "failed", verifiedName?: string | null): Promise<void>;
  
  // Funeral Homes
  getFuneralHomes(): Promise<FuneralHome[]>;
  getFuneralHome(id: string): Promise<FuneralHome | undefined>;
  getFuneralHomeByApiKey(apiKey: string): Promise<FuneralHome | undefined>;
  createFuneralHome(data: InsertFuneralHome): Promise<FuneralHome>;
  updateFuneralHome(id: string, data: Partial<FuneralHome>): Promise<FuneralHome | undefined>;

  // Certificates
  getCertificates(): Promise<Certificate[]>;
  getCertificatesByUser(userId: string): Promise<Certificate[]>;
  getCertificate(id: string): Promise<Certificate | undefined>;
  getCertificateByNumber(certificateNumber: string): Promise<Certificate | undefined>;
  getCertificateByBlockchainHash(blockchainHash: string): Promise<Certificate | undefined>;
  getCertificateByDocumentUrl(documentUrl: string): Promise<Certificate | undefined>;
  createCertificate(certificate: InsertCertificate & { userId?: string }): Promise<Certificate>;
  updateCertificate(id: string, data: Partial<Certificate>): Promise<Certificate | undefined>;

  // Referral attribution and family-authorized progress sharing
  getReferralCompanies(activeOnly?: boolean): Promise<ReferralCompany[]>;
  getReferralCompany(id: string): Promise<ReferralCompany | undefined>;
  createReferralCompany(data: InsertReferralCompany): Promise<ReferralCompany>;
  updateReferralCompany(id: string, data: Partial<InsertReferralCompany>): Promise<ReferralCompany | undefined>;
  getCaseReferral(certificateId: string): Promise<CaseReferral | undefined>;
  getCaseReferralById(id: string): Promise<CaseReferral | undefined>;
  createCaseReferral(data: typeof caseReferrals.$inferInsert): Promise<CaseReferral>;
  updateCaseReferral(id: string, data: Partial<CaseReferral>): Promise<CaseReferral | undefined>;
  transitionCaseReferralDecision(
    id: string,
    decision: "confirmed" | "declined",
    familyDecisionBy: string,
  ): Promise<CaseReferral | undefined>;
  getReferralDeliveries(referralId: string): Promise<ReferralMilestoneDelivery[]>;
  claimReferralDelivery(referralId: string, milestoneKey: string): Promise<ReferralMilestoneDelivery | undefined>;
  updateReferralDelivery(id: string, data: Partial<ReferralMilestoneDelivery>): Promise<void>;
  clearReferralDeliveries(referralId: string): Promise<void>;

  // Connected Accounts
  getConnectedAccounts(): Promise<ConnectedAccount[]>;
  getConnectedAccountsByUser(userId: string): Promise<ConnectedAccount[]>;
  getConnectedAccountsByCertificate(certificateId: string): Promise<ConnectedAccount[]>;
  getConnectedAccount(id: string): Promise<ConnectedAccount | undefined>;
  createConnectedAccount(account: InsertConnectedAccount): Promise<ConnectedAccount>;
  updateConnectedAccount(id: string, data: Partial<ConnectedAccount>): Promise<ConnectedAccount | undefined>;

  // Notifications
  getNotifications(): Promise<Notification[]>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getNotificationsByCertificate(certificateId: string): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined>;
  markAllNotificationsRead(): Promise<void>;
  markAllNotificationsReadByUser(userId: string): Promise<void>;

  // Case Events (timeline / audit trail)
  getCaseEvents(certificateId: string): Promise<CaseEvent[]>;
  logCaseEvent(event: InsertCaseEvent): Promise<CaseEvent>;

  // Webhook Logs
  getWebhookLogs(): Promise<WebhookLog[]>;
  getWebhookLogsByAccount(accountId: string): Promise<WebhookLog[]>;
  getWebhookLog(id: string): Promise<WebhookLog | undefined>;
  createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog>;
  updateWebhookLog(id: string, data: Partial<WebhookLog>): Promise<WebhookLog | undefined>;

  // Service Providers
  getServiceProviders(): Promise<ServiceProvider[]>;
  getServiceProvider(id: string): Promise<ServiceProvider | undefined>;
  getServiceProviderByName(name: string): Promise<ServiceProvider | undefined>;
  createServiceProvider(provider: InsertServiceProvider): Promise<ServiceProvider>;
  updateServiceProvider(id: string, data: Partial<ServiceProvider>): Promise<ServiceProvider | undefined>;

  // Vetted marketplace (separate from operational service providers)
  getMarketplaceCategories(activeOnly?: boolean): Promise<MarketplaceCategory[]>;
  getMarketplaceCategory(id: string): Promise<MarketplaceCategory | undefined>;
  getMarketplaceCategoryBySlug(slug: string): Promise<MarketplaceCategory | undefined>;
  createMarketplaceCategory(category: InsertMarketplaceCategory): Promise<MarketplaceCategory>;
  updateMarketplaceCategory(id: string, data: Partial<InsertMarketplaceCategory>): Promise<MarketplaceCategory | undefined>;
  getMarketplaceProviders(filters?: { q?: string; category?: string; location?: string; publicOnly?: boolean }): Promise<MarketplaceProviderWithCategory[]>;
  getMarketplaceProvider(id: string, publicOnly?: boolean): Promise<MarketplaceProviderWithCategory | undefined>;
  createMarketplaceProvider(provider: InsertMarketplaceProvider & Partial<Pick<MarketplaceProvider, "vettedAt" | "approvedAt" | "approvedBy">>): Promise<MarketplaceProvider>;
  updateMarketplaceProvider(id: string, data: Partial<InsertMarketplaceProvider> & Partial<Pick<MarketplaceProvider, "vettedAt" | "approvedAt" | "approvedBy">>): Promise<MarketplaceProvider | undefined>;
  createMarketplaceEvent(event: InsertMarketplaceEvent): Promise<MarketplaceEvent>;
  getPartnerActivityRows(): Promise<PartnerActivityRow[]>;
  
  getGovernmentNotifications(): Promise<GovernmentNotification[]>;

  // Credit Protection
  getCreditProtectionRequests(): Promise<CreditProtectionRequest[]>;
  getCreditProtectionRequestsByCertificate(certificateId: string): Promise<CreditProtectionRequest[]>;
  getCreditProtectionRequest(id: string): Promise<CreditProtectionRequest | undefined>;
  createCreditProtectionRequest(request: InsertCreditProtectionRequest): Promise<CreditProtectionRequest>;
  updateCreditProtectionRequest(id: string, data: Partial<CreditProtectionRequest>): Promise<CreditProtectionRequest | undefined>;
  
  // Mail Service Requests (USPS Mail Stop, Marketing DNC)
  getMailServiceRequests(): Promise<MailServiceRequest[]>;
  getMailServiceRequestsByCertificate(certificateId: string): Promise<MailServiceRequest[]>;
  getMailServiceRequest(id: string): Promise<MailServiceRequest | undefined>;
  createMailServiceRequest(request: InsertMailServiceRequest): Promise<MailServiceRequest>;
  updateMailServiceRequest(id: string, data: Partial<MailServiceRequest>): Promise<MailServiceRequest | undefined>;

  // Credit Pulls
  getCreditPullsByCertificate(certificateId: string): Promise<CreditPull[]>;
  getCreditPull(id: string): Promise<CreditPull | undefined>;
  createCreditPull(pull: InsertCreditPull): Promise<CreditPull>;
  updateCreditPull(id: string, data: Partial<CreditPull>): Promise<CreditPull | undefined>;
  getCreditPullResults(creditPullId: string): Promise<CreditPullResult[]>;
  getCreditPullResultsByCertificate(certificateId: string): Promise<CreditPullResult[]>;
  createCreditPullResult(result: InsertCreditPullResult): Promise<CreditPullResult>;
  updateCreditPullResult(id: string, data: Partial<CreditPullResult>): Promise<CreditPullResult | undefined>;

  // Nearest Relatives
  getNearestRelativesByCertificate(certificateId: string): Promise<NearestRelative[]>;
  createNearestRelative(relative: InsertNearestRelative): Promise<NearestRelative>;
  deleteNearestRelativesByCertificate(certificateId: string): Promise<void>;

  // Life Insurance Policies
  getLifeInsurancePoliciesByCertificate(certificateId: string): Promise<LifeInsurancePolicy[]>;
  createLifeInsurancePolicy(policy: InsertLifeInsurancePolicy): Promise<LifeInsurancePolicy>;
  updateLifeInsurancePolicy(id: string, data: Partial<LifeInsurancePolicy>): Promise<LifeInsurancePolicy | undefined>;

  // Case Messages
  getCaseMessagesByCertificate(certificateId: string): Promise<CaseMessage[]>;
  getCaseMessagesByAccount(accountId: string): Promise<CaseMessage[]>;
  createCaseMessage(message: InsertCaseMessage): Promise<CaseMessage>;
  markCaseMessageRead(id: string): Promise<CaseMessage | undefined>;

  // Search
  searchCertificates(query: string, searchType: "ssn" | "name" | "certificate_number"): Promise<Certificate[]>;

  // SAL Notifications
  getSalNotifications(limit?: number): Promise<SalNotification[]>;
  getSalNotification(id: number): Promise<SalNotification | undefined>;
  createSalNotification(notification: InsertSalNotification): Promise<SalNotification>;
  markSalNotificationRead(id: number): Promise<void>;
  getSalUnreadCount(): Promise<number>;

  // SMS Messages
  getSmsConversations(): Promise<{ phoneNumber: string; contactName: string | null; lastMessage: string; lastAt: Date; unreadCount: number; certificateId: string | null; deceasedName: string | null }[]>;
  getSmsMessagesByPhone(phoneNumber: string): Promise<SmsMessage[]>;
  createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage>;

  // LPOA Documents
  getLpoaDocumentsByUser(userId: string): Promise<LpoaDocument[]>;
  getLpoaDocumentsByCertificate(certificateId: string): Promise<LpoaDocument[]>;
  createLpoaDocument(doc: InsertLpoaDocument): Promise<LpoaDocument>;
  updateLpoaDocument(id: string, data: Partial<LpoaDocument>): Promise<LpoaDocument | undefined>;
  signLpoaDocument(doc: InsertLpoaDocument, requestId?: string): Promise<LpoaDocument>;
  getCaseIdentityReview(certificateId: string, userId: string): Promise<CaseIdentityReview | undefined>;
  createCaseIdentityReview(review: InsertCaseIdentityReview): Promise<CaseIdentityReview>;
  getLatestLpoaRequest(certificateId: string, userId: string): Promise<LpoaRequest | undefined>;
  createLpoaRequest(request: InsertLpoaRequest): Promise<LpoaRequest>;
  updateLpoaRequest(id: string, data: Partial<LpoaRequest>): Promise<LpoaRequest | undefined>;
  claimLpoaRequestSend(
    request: InsertLpoaRequest,
    cooldownMs: number,
    replacementReason?: string,
    expectedActiveDocumentId?: string,
  ): Promise<{ request: LpoaRequest; retryAfterSeconds: number | null }>;
  getFamilyDocumentsByUser(userId: string): Promise<FamilyDocument[]>;
  getFamilyDocumentsByUsers(userIds: string[]): Promise<FamilyDocument[]>;
  getFamilyDocument(id: string): Promise<FamilyDocument | undefined>;
  getFamilyDocumentByPath(objectPath: string): Promise<FamilyDocument | undefined>;
  getFamilyDocumentsByCertificate(certificateId: string): Promise<FamilyDocument[]>;
  createFamilyDocument(doc: InsertFamilyDocument): Promise<FamilyDocument>;
  deleteFamilyDocument(id: string): Promise<void>;
  overrideUserIdVerification(userId: string, adminId: string, adminName: string, note: string | null): Promise<void>;
  getUnreadSmsCount(): Promise<number>;

  // Case Tasks
  getCaseTasksByCertificate(certificateId: string): Promise<CaseTask[]>;
  ensureCaseTasks(certificateId: string): Promise<CaseTask[]>;
  updateCaseTask(id: number, data: Partial<CaseTask>): Promise<CaseTask | undefined>;

  // HeartPlan (pre-death planning)
  getHeartPlans(): Promise<HeartPlan[]>;
  getHeartPlanAdminData(planIds?: string[]): Promise<HeartPlanAdminData[]>;
  getHeartPlan(id: string): Promise<HeartPlan | undefined>;
  getHeartPlanByUser(userId: string): Promise<HeartPlan | undefined>;
  getHeartPlanByCertificate(certificateId: string): Promise<HeartPlan | undefined>;
  createHeartPlan(plan: InsertHeartPlan): Promise<HeartPlan>;
  createHeartPlanRegistration(
    user: UpsertUser,
    plan: InsertHeartPlan,
    consents: Omit<InsertHeartPlanConsentRecord, "planId">[],
    intake: Pick<InsertHeartPlanIntake, "firstName" | "lastName" | "hasLifeInsurance">,
  ): Promise<{ user: User; plan: HeartPlan; consents: HeartPlanConsentRecord[]; intake: HeartPlanIntake }>;
  getHeartPlanConsents(planId: string): Promise<HeartPlanConsentRecord[]>;
  updateHeartPlan(id: string, data: Partial<HeartPlan>): Promise<HeartPlan | undefined>;
  deleteActiveHeartPlan(input: {
    id: string;
    deletedBy: string | null;
    deletedByName: string | null;
    reason: string;
  }): Promise<{ plan: HeartPlan; cleanupJob: HeartPlanDeletionJob } | undefined>;
  getPendingHeartPlanDeletionJobs(limit?: number): Promise<HeartPlanDeletionJob[]>;
  completeHeartPlanDeletionJob(id: string): Promise<void>;
  failHeartPlanDeletionJob(id: string, error: string): Promise<void>;
  getHeartPlanIntake(planId: string): Promise<HeartPlanIntake | undefined>;
  upsertHeartPlanIntake(planId: string, data: Partial<InsertHeartPlanIntake>): Promise<HeartPlanIntake>;
  upgradeHeartPlanTier(id: string, tier: string, stripeCheckoutSessionId: string): Promise<HeartPlan | undefined>;
  claimHeartPlanForActivation(id: string): Promise<HeartPlan | undefined>;
  releaseHeartPlanClaim(id: string): Promise<void>;
  convertHeartPlanToCase(input: {
    planId: string;
    certificate: Omit<typeof certificates.$inferInsert, "id" | "blockchainHash">;
    accounts: Omit<typeof connectedAccounts.$inferInsert, "id" | "certificateId">[];
    relatives: Omit<typeof nearestRelatives.$inferInsert, "id" | "certificateId">[];
    documents: Omit<typeof familyDocuments.$inferInsert, "id" | "certificateId">[];
    letterIds: string[];
    releasedAt: Date;
    activatedBy: string | null;
    activatedByName: string;
  }): Promise<{ certificate: Certificate; plan: HeartPlan }>;
  getPlanWishes(planId: string): Promise<PlanWishes | undefined>;
  upsertPlanWishes(planId: string, data: Partial<PlanWishes>): Promise<PlanWishes>;
  getPlanDocuments(planId: string): Promise<PlanDocument[]>;
  getPlanDocument(id: string): Promise<PlanDocument | undefined>;
  getPlanDocumentByPath(objectPath: string): Promise<PlanDocument | undefined>;
  createPlanDocument(doc: InsertPlanDocument): Promise<PlanDocument>;
  createPlanDocumentWithinLimit(doc: InsertPlanDocument, limitBytes: number): Promise<{ document: PlanDocument | null; usedBytes: number }>;
  deletePlanDocument(id: string): Promise<void>;
  getPlanAssets(planId: string): Promise<PlanAsset[]>;
  getPlanAsset(id: string): Promise<PlanAsset | undefined>;
  createPlanAsset(asset: InsertPlanAsset): Promise<PlanAsset>;
  updatePlanAsset(id: string, data: Partial<PlanAsset>): Promise<PlanAsset | undefined>;
  deletePlanAsset(id: string): Promise<void>;
  getPlanDiscoverySessions(planId: string): Promise<PlanDiscoverySession[]>;
  getPlanDiscoveryItems(planId: string): Promise<PlanDiscoveryItem[]>;
  getPlanDiscoveryItem(id: string): Promise<PlanDiscoveryItem | undefined>;
  createPlanDiscoverySession(session: InsertPlanDiscoverySession): Promise<PlanDiscoverySession>;
  createPlanDiscoveryItems(items: InsertPlanDiscoveryItem[]): Promise<PlanDiscoveryItem[]>;
  updatePlanDiscoverySession(id: string, data: Partial<PlanDiscoverySession>): Promise<PlanDiscoverySession | undefined>;
  updatePlanDiscoveryItem(id: string, data: Partial<PlanDiscoveryItem>): Promise<PlanDiscoveryItem | undefined>;
  mergePlanDiscoveryItems(planId: string, sourceId: string, targetId: string): Promise<{ source: PlanDiscoveryItem; target: PlanDiscoveryItem } | undefined>;
  saveSelectedDiscoveryItems(planId: string, itemIds?: string[]): Promise<PlanDiscoveryItem[]>;
  resetPlanDiscovery(planId: string): Promise<void>;
  getPlanContacts(planId: string): Promise<PlanContact[]>;
  getPlanAdvisorContacts(planId: string): Promise<Array<Pick<PlanContact, "isAdvisor" | "email" | "advisorAccessLevel" | "advisorPermission" | "fullName">>>;
  getHeartPlanAdvisorSummary(planId: string): Promise<HeartPlanAdvisorSummary>;
  getPlanContact(id: string): Promise<PlanContact | undefined>;
  createPlanContact(contact: InsertPlanContact): Promise<PlanContact>;
  updatePlanContact(id: string, data: Partial<PlanContact>): Promise<PlanContact | undefined>;
  getDueIncompleteHeartPlanReminderCandidates(now: Date): Promise<Array<{
    planId: string;
    email: string;
    plannerName: string;
    intakeCreatedAt: Date;
    planStatus: string;
    reminderSentCycle: number;
    reminderLeaseExpiresAt: Date | null;
    reminderRetryAt: Date | null;
  }>>;
  claimIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, now: Date, leaseExpiresAt: Date): Promise<boolean>;
  completeIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, sentAt: Date): Promise<boolean>;
  failIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, retryAt: Date): Promise<void>;
  getPlanContactsNeedingInfoEmail(): Promise<Array<{ contact: PlanContact; plannerUserId: string }>>;
  getPlanContactsNeedingAdvisorInvitation(): Promise<Array<{ contact: PlanContact; plannerUserId: string }>>;
  incrementPlanContactInfoEmailAttempts(id: string): Promise<PlanContact | undefined>;
  markPlanContactInfoEmailFailed(id: string): Promise<PlanContact | undefined>;
  markPlanContactInfoEmailBounced(id: string): Promise<PlanContact | undefined>;
  deletePlanContact(id: string): Promise<void>;
  getPlanLetters(planId: string): Promise<PlanLetter[]>;
  getPlanLetter(id: string): Promise<PlanLetter | undefined>;
  getPlanLetterByPath(objectPath: string): Promise<PlanLetter | undefined>;
  createPlanLetter(letter: InsertPlanLetter): Promise<PlanLetter>;
  updatePlanLetter(id: string, data: Partial<PlanLetter>): Promise<PlanLetter | undefined>;
  setPlanLetterGeneratedTranscript(id: string, objectPath: string, transcript: string): Promise<PlanLetter | undefined>;
  markPlanLetterTranscriptFailed(id: string, objectPath: string): Promise<PlanLetter | undefined>;
  deletePlanLetter(id: string): Promise<void>;
  getPlanEvents(planId: string): Promise<PlanEvent[]>;
  logPlanEvent(event: InsertPlanEvent): Promise<PlanEvent>;
  createPlanActivationRequest(request: InsertPlanActivationRequest): Promise<PlanActivationRequest>;
  getPlanActivationRequest(id: string): Promise<PlanActivationRequest | undefined>;
  getPlanActivationRequestByToken(token: string): Promise<PlanActivationRequest | undefined>;
  getPlanActivationRequests(planId: string): Promise<PlanActivationRequest[]>;
  getPendingActivationRequests(): Promise<PlanActivationRequest[]>;
  updatePlanActivationRequest(id: string, data: Partial<PlanActivationRequest>): Promise<PlanActivationRequest | undefined>;
  markPlanActivationRequestsApproved(planId: string, reviewedBy: string | null, reviewedByName: string): Promise<void>;
}

export type MarketplaceProviderWithCategory = MarketplaceProvider & {
  category: MarketplaceCategory;
};
export class DatabaseStorage implements IStorage {
  // Users
  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.createdAt);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    if (data.email !== undefined) {
      const normalizedEmail = normalizeAccountEmail(data.email);
      data = {
        ...data,
        email: normalizedEmail || null,
        isDemoAccount: isDemoAccountEmail(normalizedEmail),
      };
    }
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Detach any certificates owned by this user (keep the case records)
    await db.update(certificates)
      .set({ userId: null })
      .where(eq(certificates.userId, id));
    await db.delete(users).where(eq(users.id, id));
    // Revoke any active sessions for this user immediately
    await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ${id}`);
  }

  async upsertUser(user: Partial<User> & { id: string }): Promise<User> {
    // The normalized allowlist controls this flag centrally and never changes
    // a user's role.
    const normalizedEmail = normalizeAccountEmail(user.email);
    if (normalizedEmail) {
      user = {
        ...user,
        email: normalizedEmail,
        isDemoAccount: isDemoAccountEmail(normalizedEmail),
      };
    }
    const existingUser = await this.getUser(user.id);
    if (existingUser) {
      const [updated] = await db.update(users)
        .set({ ...user, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(users)
        .values({ ...user, createdAt: new Date(), updatedAt: new Date() } as any)
        .returning();
      return created;
    }
  }

  async syncDemoAccountFlags(): Promise<void> {
    await db.update(users).set({
      isDemoAccount: sql`lower(btrim(coalesce(${users.email}, ''))) IN ('georgemilian1@gmail.com', 'dashventuresllc1@gmail.com', 'hello@stepsafterlife.com')`,
      updatedAt: new Date(),
    });
  }

  async updateUserPhone(userId: string, phoneNumber: string, code: string, expiry: Date): Promise<boolean> {
    // Serialize enrollment attempts across app instances. Reissuing a code or
    // overwriting the shared code field must not reset the guessing budget.
    return db.transaction(async (tx) => {
      const [current] = await tx.select({
        code: users.phoneVerificationCode,
        expiry: users.phoneVerificationExpiry,
        attempts: users.phoneEnrollmentAttempts,
        windowStart: users.phoneEnrollmentWindowStartedAt,
      }).from(users).where(eq(users.id, userId)).for("update");
      if (!current) return false;
      const now = new Date();
      const activeWindow = !!current.windowStart && now.getTime() - current.windowStart.getTime() < 15 * 60_000;
      if (activeWindow && current.attempts >= 5) return false;
      if (current.code?.startsWith("phone_enroll_") && current.expiry && current.expiry > now) return false;
      await tx.update(users).set({
        phoneNumber,
        phoneVerified: false,
        phoneVerificationCode: phoneEnrollmentCode(code),
        phoneVerificationExpiry: expiry,
        phoneEnrollmentAttempts: activeWindow ? current.attempts : 0,
        phoneEnrollmentWindowStartedAt: activeWindow ? current.windowStart : now,
        updatedAt: now,
      }).where(eq(users.id, userId));
      return true;
    });
  }

  async updateUserPhoneVerification(userId: string, code: string | null, expiry: Date | null): Promise<void> {
    await db.update(users)
      .set({ 
        phoneVerificationCode: code, 
        phoneVerificationExpiry: expiry,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  async consumeMfaCode(userId: string, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    const consumed = await db.update(users)
      .set({ phoneVerificationCode: null, phoneVerificationExpiry: null, updatedAt: new Date() })
      .where(and(
        eq(users.id, userId),
        eq(users.phoneVerificationCode, mfaCode(code)),
        gt(users.phoneVerificationExpiry, new Date()),
      ))
      .returning({ id: users.id });
    return consumed.length === 1;
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ 
        passwordHash: hashedPassword,
        // A successful password reset proves control of the account email
        // because the reset code is delivered only to that address.
        emailVerified: true,
        phoneVerificationCode: null,
        phoneVerificationExpiry: null,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  async verifyUserPhone(userId: string, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    return db.transaction(async (tx) => {
      const [current] = await tx.select({
        storedCode: users.phoneVerificationCode,
        expiry: users.phoneVerificationExpiry,
        attempts: users.phoneEnrollmentAttempts,
        windowStart: users.phoneEnrollmentWindowStartedAt,
      }).from(users).where(eq(users.id, userId)).for("update");
      const now = new Date();
      if (!current?.storedCode?.startsWith("phone_enroll_") || !current.expiry || current.expiry <= now) return false;
      const activeWindow = !!current.windowStart && now.getTime() - current.windowStart.getTime() < 15 * 60_000;
      if (activeWindow && current.attempts >= 5) return false;
      if (current.storedCode !== phoneEnrollmentCode(code)) {
        const attempts = (activeWindow ? current.attempts : 0) + 1;
        await tx.update(users).set({
          phoneEnrollmentAttempts: attempts,
          phoneEnrollmentWindowStartedAt: activeWindow ? current.windowStart : now,
          ...(attempts >= 5 ? { phoneVerificationCode: null, phoneVerificationExpiry: null } : {}),
          updatedAt: now,
        }).where(eq(users.id, userId));
        return false;
      }
      await tx.update(users).set({
        phoneVerified: true,
        phoneVerificationCode: null,
        phoneVerificationExpiry: null,
        phoneEnrollmentAttempts: 0,
        phoneEnrollmentWindowStartedAt: null,
        updatedAt: now,
      }).where(eq(users.id, userId));
      return true;
    });
  }

  async updateUserIdVerification(userId: string, sessionId: string, status: "not_started" | "pending" | "verified" | "failed", verifiedName?: string | null): Promise<void> {
    await db.update(users)
      .set({ 
        stripeVerificationSessionId: sessionId, 
        idVerificationStatus: status,
        idVerifiedAt: status === "verified" ? new Date() : null,
        ...(verifiedName !== undefined ? { idVerifiedName: verifiedName } : {}),
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  // Funeral Homes
  async getFuneralHomes(): Promise<FuneralHome[]> {
    return db.select().from(funeralHomes).orderBy(funeralHomes.createdAt);
  }

  async getFuneralHome(id: string): Promise<FuneralHome | undefined> {
    const [home] = await db.select().from(funeralHomes).where(eq(funeralHomes.id, id));
    return home;
  }

  async getFuneralHomeByApiKey(apiKey: string): Promise<FuneralHome | undefined> {
    const [home] = await db.select().from(funeralHomes).where(eq(funeralHomes.apiKey, apiKey));
    return home;
  }

  async createFuneralHome(data: InsertFuneralHome): Promise<FuneralHome> {
    const [home] = await db.insert(funeralHomes).values(data).returning();
    return home;
  }

  async updateFuneralHome(id: string, data: Partial<FuneralHome>): Promise<FuneralHome | undefined> {
    const [home] = await db.update(funeralHomes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(funeralHomes.id, id))
      .returning();
    return home;
  }

  // Certificates
  async getCertificates(): Promise<Certificate[]> {
    return db.select().from(certificates).orderBy(certificates.submittedAt);
  }

  async getCertificatesByUser(userId: string): Promise<Certificate[]> {
    return db.select().from(certificates).where(eq(certificates.userId, userId)).orderBy(certificates.submittedAt);
  }

  async getCertificate(id: string): Promise<Certificate | undefined> {
    const [certificate] = await db.select().from(certificates).where(eq(certificates.id, id));
    return certificate;
  }

  async getCertificateByNumber(certificateNumber: string): Promise<Certificate | undefined> {
    const [certificate] = await db.select().from(certificates).where(eq(certificates.certificateNumber, certificateNumber));
    return certificate;
  }

  async getCertificateByBlockchainHash(blockchainHash: string): Promise<Certificate | undefined> {
    const [certificate] = await db.select().from(certificates).where(eq(certificates.blockchainHash, blockchainHash));
    return certificate;
  }

  async getCertificateByDocumentUrl(documentUrl: string): Promise<Certificate | undefined> {
    const [certificate] = await db.select().from(certificates).where(eq(certificates.documentUrl, documentUrl));
    return certificate;
  }

  async createCertificate(insertCertificate: InsertCertificate & { userId?: string }): Promise<Certificate> {
    const blockchainHash = `0x${randomUUID().replace(/-/g, '')}`;
    const [certificate] = await db.insert(certificates).values({
      ...insertCertificate,
      blockchainHash,
    }).returning();
    return certificate;
  }

  async updateCertificate(id: string, data: Partial<Certificate>): Promise<Certificate | undefined> {
    const [certificate] = await db.update(certificates)
      .set(data)
      .where(eq(certificates.id, id))
      .returning();
    return certificate;
  }

  async getReferralCompanies(activeOnly = false): Promise<ReferralCompany[]> {
    const query = db.select().from(referralCompanies);
    return activeOnly
      ? query.where(eq(referralCompanies.isActive, true)).orderBy(referralCompanies.name)
      : query.orderBy(referralCompanies.name);
  }

  async getReferralCompany(id: string): Promise<ReferralCompany | undefined> {
    const [company] = await db.select().from(referralCompanies).where(eq(referralCompanies.id, id));
    return company;
  }

  async createReferralCompany(data: InsertReferralCompany): Promise<ReferralCompany> {
    const [company] = await db.insert(referralCompanies).values(data).returning();
    return company;
  }

  async updateReferralCompany(id: string, data: Partial<InsertReferralCompany>): Promise<ReferralCompany | undefined> {
    const [company] = await db.update(referralCompanies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(referralCompanies.id, id)).returning();
    return company;
  }

  async getCaseReferral(certificateId: string): Promise<CaseReferral | undefined> {
    const [referral] = await db.select().from(caseReferrals).where(eq(caseReferrals.certificateId, certificateId));
    return referral;
  }

  async getCaseReferralById(id: string): Promise<CaseReferral | undefined> {
    const [referral] = await db.select().from(caseReferrals).where(eq(caseReferrals.id, id));
    return referral;
  }

  async createCaseReferral(data: typeof caseReferrals.$inferInsert): Promise<CaseReferral> {
    const [referral] = await db.insert(caseReferrals).values(data).returning();
    return referral;
  }

  async updateCaseReferral(id: string, data: Partial<CaseReferral>): Promise<CaseReferral | undefined> {
    const [referral] = await db.update(caseReferrals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(caseReferrals.id, id)).returning();
    return referral;
  }

  async transitionCaseReferralDecision(
    id: string,
    decision: "confirmed" | "declined",
    familyDecisionBy: string,
  ): Promise<CaseReferral | undefined> {
    const [referral] = await db.update(caseReferrals)
      .set({
        status: decision,
        familyDecisionBy,
        familyDecisionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(caseReferrals.id, id),
        eq(caseReferrals.status, "pending_family_confirmation"),
      ))
      .returning();
    return referral;
  }

  async getReferralDeliveries(referralId: string): Promise<ReferralMilestoneDelivery[]> {
    return db.select().from(referralMilestoneDeliveries)
      .where(eq(referralMilestoneDeliveries.caseReferralId, referralId));
  }

  async claimReferralDelivery(referralId: string, milestoneKey: string): Promise<ReferralMilestoneDelivery | undefined> {
    const [created] = await db.insert(referralMilestoneDeliveries)
      .values({ caseReferralId: referralId, milestoneKey })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    // A failed or interrupted sender may retry after a short lease. Concurrent
    // requests cannot both own the same referral+milestone delivery.
    const retryBefore = new Date(Date.now() - 5 * 60_000);
    const [existing] = await db.update(referralMilestoneDeliveries)
      .set({ claimedAt: new Date() })
      .where(and(
      eq(referralMilestoneDeliveries.caseReferralId, referralId),
      eq(referralMilestoneDeliveries.milestoneKey, milestoneKey),
      isNull(referralMilestoneDeliveries.sentAt),
      lt(referralMilestoneDeliveries.claimedAt, retryBefore),
    )).returning();
    return existing;
  }

  async updateReferralDelivery(id: string, data: Partial<ReferralMilestoneDelivery>): Promise<void> {
    await db.update(referralMilestoneDeliveries).set(data).where(eq(referralMilestoneDeliveries.id, id));
  }

  async clearReferralDeliveries(referralId: string): Promise<void> {
    await db.delete(referralMilestoneDeliveries)
      .where(eq(referralMilestoneDeliveries.caseReferralId, referralId));
  }

  // Connected Accounts
  async getConnectedAccounts(): Promise<ConnectedAccount[]> {
    return db.select().from(connectedAccounts);
  }

  async getConnectedAccountsByUser(userId: string): Promise<ConnectedAccount[]> {
    const userCertificates = await this.getCertificatesByUser(userId);
    const certificateIds = userCertificates.map(c => c.id);
    if (certificateIds.length === 0) return [];
    
    const allAccounts: ConnectedAccount[] = [];
    for (const certId of certificateIds) {
      const accounts = await db.select().from(connectedAccounts)
        .where(eq(connectedAccounts.certificateId, certId));
      allAccounts.push(...accounts);
    }
    return allAccounts;
  }

  async getConnectedAccountsByCertificate(certificateId: string): Promise<ConnectedAccount[]> {
    return db.select().from(connectedAccounts).where(eq(connectedAccounts.certificateId, certificateId));
  }

  async getConnectedAccount(id: string): Promise<ConnectedAccount | undefined> {
    const [account] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, id));
    return account;
  }

  async createConnectedAccount(insertAccount: InsertConnectedAccount): Promise<ConnectedAccount> {
    const [account] = await db.insert(connectedAccounts).values(insertAccount).returning();
    return account;
  }

  async updateConnectedAccount(id: string, data: Partial<ConnectedAccount>): Promise<ConnectedAccount | undefined> {
    const [account] = await db.update(connectedAccounts)
      .set(data)
      .where(eq(connectedAccounts.id, id))
      .returning();
    return account;
  }

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(notifications.sentAt);
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    const userCertificates = await this.getCertificatesByUser(userId);
    const certificateIds = userCertificates.map(c => c.id);
    if (certificateIds.length === 0) return [];
    
    const allNotifications: Notification[] = [];
    for (const certId of certificateIds) {
      const notifs = await db.select().from(notifications)
        .where(eq(notifications.certificateId, certId))
        .orderBy(notifications.sentAt);
      allNotifications.push(...notifs);
    }
    return allNotifications.sort((a, b) => 
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
  }

  async getNotificationsByCertificate(certificateId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.certificateId, certificateId));
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const [notification] = await db.update(notifications)
      .set(data)
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsRead(): Promise<void> {
    await db.update(notifications)
      .set({ readAt: new Date() });
  }

  async markAllNotificationsReadByUser(userId: string): Promise<void> {
    const userCertificates = await this.getCertificatesByUser(userId);
    for (const cert of userCertificates) {
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.certificateId, cert.id));
    }
  }

  // Case Events (timeline / audit trail)
  async getCaseEvents(certificateId: string): Promise<CaseEvent[]> {
    return db.select().from(caseEvents)
      .where(eq(caseEvents.certificateId, certificateId))
      .orderBy(desc(caseEvents.createdAt));
  }

  async logCaseEvent(event: InsertCaseEvent): Promise<CaseEvent> {
    const [row] = await db.insert(caseEvents).values(event).returning();
    return row;
  }

  // Webhook Logs
  async getWebhookLogs(): Promise<WebhookLog[]> {
    return db.select().from(webhookLogs).orderBy(webhookLogs.sentAt);
  }

  async getWebhookLogsByAccount(accountId: string): Promise<WebhookLog[]> {
    return db.select().from(webhookLogs).where(eq(webhookLogs.accountId, accountId));
  }

  async getWebhookLog(id: string): Promise<WebhookLog | undefined> {
    const [log] = await db.select().from(webhookLogs).where(eq(webhookLogs.id, id));
    return log;
  }

  async createWebhookLog(insertLog: InsertWebhookLog): Promise<WebhookLog> {
    const [log] = await db.insert(webhookLogs).values(insertLog).returning();
    return log;
  }

  async updateWebhookLog(id: string, data: Partial<WebhookLog>): Promise<WebhookLog | undefined> {
    const [log] = await db.update(webhookLogs)
      .set(data)
      .where(eq(webhookLogs.id, id))
      .returning();
    return log;
  }

  // Service Providers
  async getServiceProviders(): Promise<ServiceProvider[]> {
    return db.select().from(serviceProviders).orderBy(serviceProviders.name);
  }

  async getServiceProvider(id: string): Promise<ServiceProvider | undefined> {
    const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, id));
    return provider;
  }

  async getServiceProviderByName(name: string): Promise<ServiceProvider | undefined> {
    const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.name, name));
    return provider;
  }

  async createServiceProvider(insertProvider: InsertServiceProvider): Promise<ServiceProvider> {
    const [provider] = await db.insert(serviceProviders).values(insertProvider).returning();
    return provider;
  }

  async updateServiceProvider(id: string, data: Partial<ServiceProvider>): Promise<ServiceProvider | undefined> {
    const [provider] = await db.update(serviceProviders)
      .set(data)
      .where(eq(serviceProviders.id, id))
      .returning();
    return provider;
  }

  // Vetted marketplace
  async getMarketplaceCategories(activeOnly = false): Promise<MarketplaceCategory[]> {
    const query = db.select().from(marketplaceCategories);
    return activeOnly
      ? query.where(eq(marketplaceCategories.isActive, true)).orderBy(marketplaceCategories.sortOrder, marketplaceCategories.name)
      : query.orderBy(marketplaceCategories.sortOrder, marketplaceCategories.name);
  }

  async getMarketplaceCategory(id: string): Promise<MarketplaceCategory | undefined> {
    const [category] = await db.select().from(marketplaceCategories).where(eq(marketplaceCategories.id, id));
    return category;
  }

  async getMarketplaceCategoryBySlug(slug: string): Promise<MarketplaceCategory | undefined> {
    const [category] = await db.select().from(marketplaceCategories).where(eq(marketplaceCategories.slug, slug));
    return category;
  }

  async createMarketplaceCategory(category: InsertMarketplaceCategory): Promise<MarketplaceCategory> {
    const [created] = await db.insert(marketplaceCategories).values(category).returning();
    return created;
  }

  async updateMarketplaceCategory(id: string, data: Partial<InsertMarketplaceCategory>): Promise<MarketplaceCategory | undefined> {
    const [updated] = await db.update(marketplaceCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(marketplaceCategories.id, id))
      .returning();
    return updated;
  }

  async getMarketplaceProviders(
    filters: { q?: string; category?: string; location?: string; publicOnly?: boolean } = {},
  ): Promise<MarketplaceProviderWithCategory[]> {
    const rows = await db.select({ provider: marketplaceProviders, category: marketplaceCategories })
      .from(marketplaceProviders)
      .innerJoin(marketplaceCategories, eq(marketplaceProviders.categoryId, marketplaceCategories.id))
      .orderBy(marketplaceProviders.businessName);

    const q = filters.q?.trim().toLocaleLowerCase();
    const category = filters.category?.trim().toLocaleLowerCase();
    const location = filters.location?.trim().toLocaleLowerCase();
    return rows
      .filter(({ provider, category: providerCategory }) => !filters.publicOnly || isMarketplaceProviderPubliclyEligible({
        ...provider,
        categoryIsActive: providerCategory.isActive,
      }))
      .filter(({ provider, category: providerCategory }) => !category
        || providerCategory.id.toLocaleLowerCase() === category
        || providerCategory.slug.toLocaleLowerCase() === category)
      .filter(({ provider, category: providerCategory }) => !q || [
        provider.businessName,
        provider.description,
        providerCategory.name,
        ...provider.services,
      ].some((value) => value.toLocaleLowerCase().includes(q)))
      .filter(({ provider }) => !location
        || provider.serviceAreas.some((area) => area.toLocaleLowerCase().includes(location)))
      .map(({ provider, category: providerCategory }) => ({ ...provider, category: providerCategory }));
  }

  async getMarketplaceProvider(id: string, publicOnly = false): Promise<MarketplaceProviderWithCategory | undefined> {
    const [row] = await db.select({ provider: marketplaceProviders, category: marketplaceCategories })
      .from(marketplaceProviders)
      .innerJoin(marketplaceCategories, eq(marketplaceProviders.categoryId, marketplaceCategories.id))
      .where(eq(marketplaceProviders.id, id));
    if (!row) return undefined;
    if (publicOnly && !isMarketplaceProviderPubliclyEligible({
      ...row.provider,
      categoryIsActive: row.category.isActive,
    })) return undefined;
    return { ...row.provider, category: row.category };
  }

  async createMarketplaceProvider(
    provider: InsertMarketplaceProvider & Partial<Pick<MarketplaceProvider, "vettedAt" | "approvedAt" | "approvedBy">>,
  ): Promise<MarketplaceProvider> {
    const [created] = await db.insert(marketplaceProviders).values(provider).returning();
    return created;
  }

  async updateMarketplaceProvider(
    id: string,
    data: Partial<InsertMarketplaceProvider> & Partial<Pick<MarketplaceProvider, "vettedAt" | "approvedAt" | "approvedBy">>,
  ): Promise<MarketplaceProvider | undefined> {
    const [updated] = await db.update(marketplaceProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(marketplaceProviders.id, id))
      .returning();
    return updated;
  }

  async createMarketplaceEvent(event: InsertMarketplaceEvent): Promise<MarketplaceEvent> {
    const [created] = await db.insert(marketplaceEvents).values(event).returning();
    return created;
  }

  async getPartnerActivityRows(): Promise<PartnerActivityRow[]> {
    const [funeralHomeRows, marketplaceRows, rosterTotals, householdTotals, referralRows] = await Promise.all([
      db.select({
        id: funeralHomes.id,
        displayName: funeralHomes.name,
        status: funeralHomes.isActive,
        createdAt: funeralHomes.createdAt,
        linkedCount: sql<number>`count(distinct ${users.id})`,
        activityCount: sql<number>`count(distinct ${certificates.id})`,
        lastActivityAt: sql<Date | null>`max(${certificates.submittedAt})`,
      })
        .from(funeralHomes)
        .leftJoin(users, and(eq(users.funeralHomeId, funeralHomes.id), eq(users.role, "funeral_home")))
        .leftJoin(certificates, eq(certificates.userId, funeralHomes.id))
        .groupBy(funeralHomes.id),
      db.select({
        id: marketplaceProviders.id,
        displayName: marketplaceProviders.businessName,
        status: marketplaceProviders.status,
        createdAt: marketplaceProviders.createdAt,
        activityCount: sql<number>`count(${marketplaceEvents.id})`,
        lastActivityAt: sql<Date | null>`max(${marketplaceEvents.createdAt})`,
      })
        .from(marketplaceProviders)
        .leftJoin(marketplaceEvents, eq(marketplaceEvents.providerId, marketplaceProviders.id))
        .groupBy(marketplaceProviders.id),
      db.select({
        createdAt: sql<Date | null>`min(${orsaRosterMembers.createdAt})`,
        activeMembers: sql<number>`count(*) filter (where ${orsaRosterMembers.active} = true)`,
        auditCount: sql<number>`(select count(*) from ${orsaRosterAudits})`,
        lastAuditAt: sql<Date | null>`(select max(${orsaRosterAudits.createdAt}) from ${orsaRosterAudits})`,
      }).from(orsaRosterMembers),
      db.select({
        activeMembers: sql<number>`count(*) filter (where ${householdMembers.status} = 'active')`,
        operationCount: sql<number>`(select count(*) from ${householdBillingOperations})`,
        lastOperationAt: sql<Date | null>`(select max(${householdBillingOperations.createdAt}) from ${householdBillingOperations})`,
      }).from(householdMembers),
      db.select({
        id: referralCompanies.id,
        displayName: referralCompanies.name,
        status: referralCompanies.isActive,
        createdAt: referralCompanies.createdAt,
        activityCount: sql<number>`count(${caseReferrals.id})`,
        lastActivityAt: sql<Date | null>`max(${caseReferrals.requestedAt})`,
      }).from(referralCompanies)
        .leftJoin(caseReferrals, eq(caseReferrals.referralCompanyId, referralCompanies.id))
        .groupBy(referralCompanies.id),
    ]);

    const rows: PartnerActivityRow[] = funeralHomeRows.map((row) => normalizePartnerActivityRow({
      id: `funeral_home:${row.id}`,
      type: "funeral_home",
      displayName: row.displayName,
      sourceType: "linked_organization",
      enrollmentLabel: "Linked funeral home organization",
      status: row.status === "true" ? "Active" : "Inactive",
      createdAt: row.createdAt,
      linkedCount: row.linkedCount,
      activityCount: row.activityCount,
      lastActivityAt: row.lastActivityAt,
      managementPath: null,
    }));

    rows.push(...marketplaceRows.map((row) => normalizePartnerActivityRow({
      id: `marketplace_provider:${row.id}`,
      type: "marketplace_provider",
      displayName: row.displayName,
      sourceType: "catalog_listing",
      enrollmentLabel: "Marketplace catalog listing (not an account)",
      status: row.status,
      createdAt: row.createdAt,
      linkedCount: null,
      activityCount: row.activityCount,
      lastActivityAt: row.lastActivityAt,
      managementPath: "/admin/marketplace",
    })));

    rows.push(...referralRows.map((row) => normalizePartnerActivityRow({
      id: `referral_company:${row.id}`,
      type: "referral_company",
      displayName: row.displayName,
      sourceType: "referral_registry",
      enrollmentLabel: "Operational referral company (not a portal account)",
      status: row.status ? "Active" : "Inactive",
      createdAt: row.createdAt,
      linkedCount: null,
      activityCount: row.activityCount,
      lastActivityAt: row.lastActivityAt,
      managementPath: null,
    })));

    const roster = rosterTotals[0];
    const household = householdTotals[0];
    const activityCount = Number(roster?.auditCount || 0) + Number(household?.operationCount || 0);
    const activityDates = [roster?.lastAuditAt, household?.lastOperationAt]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value));
    if (roster || activityCount > 0) {
      rows.push(normalizePartnerActivityRow({
        id: "orsa:membership-program",
        type: "orsa",
        displayName: "ORSA Membership Program",
        sourceType: "partner_roster",
        enrollmentLabel: "Partner roster and linked household memberships",
        status: Number(roster?.activeMembers || 0) > 0 ? "Active roster" : "No active roster members",
        createdAt: roster?.createdAt || null,
        linkedCount: Number(roster?.activeMembers || 0) + Number(household?.activeMembers || 0),
        activityCount,
        lastActivityAt: activityDates.length
          ? new Date(Math.max(...activityDates.map((value) => value.getTime())))
          : null,
        managementPath: "/admin/orsa",
      }));
    }

    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Beneficiaries
  async getBeneficiaries(): Promise<Beneficiary[]> {
    return db.select().from(beneficiaries).orderBy(beneficiaries.createdAt);
  }

  async getBeneficiariesByCertificate(certificateId: string): Promise<Beneficiary[]> {
    return db.select().from(beneficiaries).where(eq(beneficiaries.certificateId, certificateId));
  }

  async getBeneficiary(id: string): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id));
    return beneficiary;
  }

  async createBeneficiary(insertBeneficiary: InsertBeneficiary): Promise<Beneficiary> {
    const [beneficiary] = await db.insert(beneficiaries).values(insertBeneficiary).returning();
    return beneficiary;
  }

  async updateBeneficiary(id: string, data: Partial<Beneficiary>): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db.update(beneficiaries)
      .set(data)
      .where(eq(beneficiaries.id, id))
      .returning();
    return beneficiary;
  }

  // Appointments
  async getAppointments(): Promise<Appointment[]> {
    return db.select().from(appointments).orderBy(appointments.scheduledDate);
  }

  async getAppointmentsByCertificate(certificateId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.certificateId, certificateId));
  }

  async getAppointmentsByBeneficiary(beneficiaryId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.beneficiaryId, beneficiaryId));
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }

  async updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment | undefined> {
    const [appointment] = await db.update(appointments)
      .set(data)
      .where(eq(appointments.id, id))
      .returning();
    return appointment;
  }

  // Government Notifications
  async getGovernmentNotifications(): Promise<GovernmentNotification[]> {
    return db.select().from(governmentNotifications).orderBy(governmentNotifications.sentAt);
  }

  async getGovernmentNotificationsByCertificate(certificateId: string): Promise<GovernmentNotification[]> {
    return db.select().from(governmentNotifications).where(eq(governmentNotifications.certificateId, certificateId));
  }

  async getGovernmentNotification(id: string): Promise<GovernmentNotification | undefined> {
    const [notification] = await db.select().from(governmentNotifications).where(eq(governmentNotifications.id, id));
    return notification;
  }

  async createGovernmentNotification(insertNotification: InsertGovernmentNotification): Promise<GovernmentNotification> {
    const [notification] = await db.insert(governmentNotifications).values(insertNotification).returning();
    return notification;
  }

  async updateGovernmentNotification(id: string, data: Partial<GovernmentNotification>): Promise<GovernmentNotification | undefined> {
    const [notification] = await db.update(governmentNotifications)
      .set(data)
      .where(eq(governmentNotifications.id, id))
      .returning();
    return notification;
  }

  // Estate Registry
  async getEstateRegistries(): Promise<EstateRegistry[]> {
    return db.select().from(estateRegistry).orderBy(estateRegistry.filingDate);
  }

  async getEstateRegistry(id: string): Promise<EstateRegistry | undefined> {
    const [estate] = await db.select().from(estateRegistry).where(eq(estateRegistry.id, id));
    return estate;
  }

  async getEstateRegistryByDocumentNumber(documentNumber: string): Promise<EstateRegistry | undefined> {
    const [estate] = await db.select().from(estateRegistry).where(eq(estateRegistry.documentNumber, documentNumber));
    return estate;
  }

  async searchEstatesByName(name: string): Promise<EstateRegistry[]> {
    const searchPattern = `%${name}%`;
    return db.select().from(estateRegistry).where(
      or(
        ilike(estateRegistry.principalName, searchPattern),
        ilike(estateRegistry.executorName, searchPattern),
        ilike(estateRegistry.attorneyName, searchPattern)
      )
    );
  }

  async createEstateRegistry(insertEstate: InsertEstateRegistry): Promise<EstateRegistry> {
    const [estate] = await db.insert(estateRegistry).values(insertEstate).returning();
    return estate;
  }

  async updateEstateRegistry(id: string, data: Partial<EstateRegistry>): Promise<EstateRegistry | undefined> {
    const [estate] = await db.update(estateRegistry)
      .set(data)
      .where(eq(estateRegistry.id, id))
      .returning();
    return estate;
  }

  // NER Analysis
  async getNerAnalyses(): Promise<NerAnalysis[]> {
    return db.select().from(nerAnalysis).orderBy(nerAnalysis.createdAt);
  }

  async getNerAnalysisByCertificate(certificateId: string): Promise<NerAnalysis | undefined> {
    const [analysis] = await db.select().from(nerAnalysis).where(eq(nerAnalysis.certificateId, certificateId));
    return analysis;
  }

  async getNerAnalysis(id: string): Promise<NerAnalysis | undefined> {
    const [analysis] = await db.select().from(nerAnalysis).where(eq(nerAnalysis.id, id));
    return analysis;
  }

  async createNerAnalysis(insertAnalysis: InsertNerAnalysis): Promise<NerAnalysis> {
    const [analysis] = await db.insert(nerAnalysis).values(insertAnalysis).returning();
    return analysis;
  }

  async updateNerAnalysis(id: string, data: Partial<NerAnalysis>): Promise<NerAnalysis | undefined> {
    const [analysis] = await db.update(nerAnalysis)
      .set(data)
      .where(eq(nerAnalysis.id, id))
      .returning();
    return analysis;
  }

  // Credit Protection
  async getCreditProtectionRequests(): Promise<CreditProtectionRequest[]> {
    return db.select().from(creditProtectionRequests).orderBy(creditProtectionRequests.createdAt);
  }

  async getCreditProtectionRequestsByCertificate(certificateId: string): Promise<CreditProtectionRequest[]> {
    return db.select().from(creditProtectionRequests).where(eq(creditProtectionRequests.certificateId, certificateId));
  }

  async getCreditProtectionRequest(id: string): Promise<CreditProtectionRequest | undefined> {
    const [request] = await db.select().from(creditProtectionRequests).where(eq(creditProtectionRequests.id, id));
    return request;
  }

  async createCreditProtectionRequest(insertRequest: InsertCreditProtectionRequest): Promise<CreditProtectionRequest> {
    const [request] = await db.insert(creditProtectionRequests).values(insertRequest).returning();
    return request;
  }

  async updateCreditProtectionRequest(id: string, data: Partial<CreditProtectionRequest>): Promise<CreditProtectionRequest | undefined> {
    const [request] = await db.update(creditProtectionRequests)
      .set(data)
      .where(eq(creditProtectionRequests.id, id))
      .returning();
    return request;
  }

  // Mail Service Requests (USPS Mail Stop, Marketing DNC)
  async getMailServiceRequests(): Promise<MailServiceRequest[]> {
    return db.select().from(mailServiceRequests).orderBy(mailServiceRequests.createdAt);
  }

  async getMailServiceRequestsByCertificate(certificateId: string): Promise<MailServiceRequest[]> {
    return db.select().from(mailServiceRequests).where(eq(mailServiceRequests.certificateId, certificateId));
  }

  async getMailServiceRequest(id: string): Promise<MailServiceRequest | undefined> {
    const [request] = await db.select().from(mailServiceRequests).where(eq(mailServiceRequests.id, id));
    return request;
  }

  async createMailServiceRequest(insertRequest: InsertMailServiceRequest): Promise<MailServiceRequest> {
    const [request] = await db.insert(mailServiceRequests).values(insertRequest).returning();
    return request;
  }

  async updateMailServiceRequest(id: string, data: Partial<MailServiceRequest>): Promise<MailServiceRequest | undefined> {
    const [request] = await db.update(mailServiceRequests)
      .set(data)
      .where(eq(mailServiceRequests.id, id))
      .returning();
    return request;
  }

  // Credit Pulls
  async getCreditPullsByCertificate(certificateId: string): Promise<CreditPull[]> {
    return db.select().from(creditPulls).where(eq(creditPulls.certificateId, certificateId));
  }

  async getCreditPull(id: string): Promise<CreditPull | undefined> {
    const [pull] = await db.select().from(creditPulls).where(eq(creditPulls.id, id));
    return pull;
  }

  async createCreditPull(pull: InsertCreditPull): Promise<CreditPull> {
    const [created] = await db.insert(creditPulls).values(pull).returning();
    return created;
  }

  async updateCreditPull(id: string, data: Partial<CreditPull>): Promise<CreditPull | undefined> {
    const [updated] = await db.update(creditPulls).set(data).where(eq(creditPulls.id, id)).returning();
    return updated;
  }

  async getCreditPullResults(creditPullId: string): Promise<CreditPullResult[]> {
    return db.select().from(creditPullResults).where(eq(creditPullResults.creditPullId, creditPullId));
  }

  async getCreditPullResultsByCertificate(certificateId: string): Promise<CreditPullResult[]> {
    return db.select().from(creditPullResults).where(eq(creditPullResults.certificateId, certificateId));
  }

  async createCreditPullResult(result: InsertCreditPullResult): Promise<CreditPullResult> {
    const [created] = await db.insert(creditPullResults).values(result).returning();
    return created;
  }

  async updateCreditPullResult(id: string, data: Partial<CreditPullResult>): Promise<CreditPullResult | undefined> {
    const [updated] = await db.update(creditPullResults).set(data).where(eq(creditPullResults.id, id)).returning();
    return updated;
  }

  // Nearest Relatives
  async getNearestRelativesByCertificate(certificateId: string): Promise<NearestRelative[]> {
    return db.select().from(nearestRelatives).where(eq(nearestRelatives.certificateId, certificateId));
  }

  async createNearestRelative(relative: InsertNearestRelative): Promise<NearestRelative> {
    const [created] = await db.insert(nearestRelatives).values(relative).returning();
    return created;
  }

  async deleteNearestRelativesByCertificate(certificateId: string): Promise<void> {
    await db.delete(nearestRelatives).where(eq(nearestRelatives.certificateId, certificateId));
  }

  // Life Insurance Policies
  async getLifeInsurancePoliciesByCertificate(certificateId: string): Promise<LifeInsurancePolicy[]> {
    const policies = await db.select().from(lifeInsurancePolicies).where(eq(lifeInsurancePolicies.certificateId, certificateId));
    return policies.filter(policy => !isSyntheticNaicPolicy(policy));
  }

  async createLifeInsurancePolicy(policy: InsertLifeInsurancePolicy): Promise<LifeInsurancePolicy> {
    const [created] = await db.insert(lifeInsurancePolicies).values(policy).returning();
    return created;
  }

  async updateLifeInsurancePolicy(id: string, data: Partial<LifeInsurancePolicy>): Promise<LifeInsurancePolicy | undefined> {
    const [updated] = await db.update(lifeInsurancePolicies).set(data).where(eq(lifeInsurancePolicies.id, id)).returning();
    return updated;
  }

  // Case Messages
  async getCaseMessagesByCertificate(certificateId: string): Promise<CaseMessage[]> {
    return db.select().from(caseMessages).where(eq(caseMessages.certificateId, certificateId));
  }

  async getCaseMessagesByAccount(accountId: string): Promise<CaseMessage[]> {
    return db.select().from(caseMessages).where(eq(caseMessages.accountId, accountId));
  }

  async createCaseMessage(message: InsertCaseMessage): Promise<CaseMessage> {
    const [created] = await db.insert(caseMessages).values(message).returning();
    return created;
  }

  async markCaseMessageRead(id: string): Promise<CaseMessage | undefined> {
    const [updated] = await db.update(caseMessages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(caseMessages.id, id))
      .returning();
    return updated;
  }

  // Search
  async searchCertificates(query: string, searchType: "ssn" | "name" | "certificate_number"): Promise<Certificate[]> {
    const searchPattern = `%${query}%`;
    switch (searchType) {
      case "ssn":
        return db.select().from(certificates).where(
          ilike(certificates.deceasedSsn, searchPattern)
        );
      case "name":
        return db.select().from(certificates).where(
          ilike(certificates.deceasedName, searchPattern)
        );
      case "certificate_number":
        return db.select().from(certificates).where(
          ilike(certificates.certificateNumber, searchPattern)
        );
      default:
        return [];
    }
  }

  // SAL Notifications
  async getSalNotifications(limit = 100): Promise<SalNotification[]> {
    return db.select().from(salNotifications).orderBy(desc(salNotifications.createdAt)).limit(limit);
  }

  async getSalNotification(id: number): Promise<SalNotification | undefined> {
    const [notification] = await db.select().from(salNotifications).where(eq(salNotifications.id, id));
    return notification;
  }

  async createSalNotification(notification: InsertSalNotification): Promise<SalNotification> {
    const [created] = await db.insert(salNotifications).values(notification).returning();
    return created;
  }

  async markSalNotificationRead(id: number): Promise<void> {
    await db.update(salNotifications).set({ isRead: true }).where(eq(salNotifications.id, id));
  }

  async getSalUnreadCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(salNotifications).where(eq(salNotifications.isRead, false));
    return Number(result[0]?.count || 0);
  }

  // SMS Messages
  async getSmsConversations(): Promise<{ phoneNumber: string; contactName: string | null; lastMessage: string; lastAt: Date; unreadCount: number; certificateId: string | null; deceasedName: string | null }[]> {
    const rows = await db.execute(sql`
      SELECT 
        phone_number,
        (SELECT contact_name FROM sms_messages s2 WHERE s2.phone_number = s.phone_number AND s2.contact_name IS NOT NULL ORDER BY s2.created_at DESC LIMIT 1) as contact_name,
        (SELECT body FROM sms_messages s3 WHERE s3.phone_number = s.phone_number ORDER BY s3.created_at DESC LIMIT 1) as last_message,
        MAX(created_at) as last_at,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND status = 'received') as unread_count,
        (SELECT certificate_id FROM sms_messages s4 WHERE s4.phone_number = s.phone_number AND s4.certificate_id IS NOT NULL ORDER BY s4.created_at DESC LIMIT 1) as certificate_id,
        (SELECT c.deceased_name FROM certificates c WHERE c.id = (SELECT s5.certificate_id FROM sms_messages s5 WHERE s5.phone_number = s.phone_number AND s5.certificate_id IS NOT NULL ORDER BY s5.created_at DESC LIMIT 1) LIMIT 1) as deceased_name
      FROM sms_messages s
      GROUP BY phone_number
      ORDER BY MAX(created_at) DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      phoneNumber: r.phone_number,
      contactName: r.contact_name,
      lastMessage: r.last_message,
      lastAt: new Date(r.last_at),
      unreadCount: Number(r.unread_count || 0),
      certificateId: r.certificate_id,
      deceasedName: r.deceased_name,
    }));
  }

  async getLpoaDocumentsByUser(userId: string): Promise<LpoaDocument[]> {
    return db.select().from(lpoaDocuments).where(eq(lpoaDocuments.userId, userId)).orderBy(desc(lpoaDocuments.signedAt));
  }

  async getLpoaDocumentsByCertificate(certificateId: string): Promise<LpoaDocument[]> {
    return db.select().from(lpoaDocuments).where(eq(lpoaDocuments.certificateId, certificateId)).orderBy(desc(lpoaDocuments.signedAt));
  }

  async createLpoaDocument(doc: InsertLpoaDocument): Promise<LpoaDocument> {
    const [created] = await db.insert(lpoaDocuments).values(doc).returning();
    return created;
  }

  async updateLpoaDocument(id: string, data: Partial<LpoaDocument>): Promise<LpoaDocument | undefined> {
    const [updated] = await db.update(lpoaDocuments)
      .set(data)
      .where(eq(lpoaDocuments.id, id))
      .returning();
    return updated;
  }

  async signLpoaDocument(doc: InsertLpoaDocument, requestId?: string): Promise<LpoaDocument> {
    if (!doc.certificateId) throw new Error("A case is required to sign an LPOA");
    const certificateId = doc.certificateId;
    return db.transaction(async (tx) => {
      const lockKey = `lpoa-case:${certificateId}:${doc.userId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const documents = await tx.select().from(lpoaDocuments)
        .where(and(
          eq(lpoaDocuments.certificateId, certificateId),
          eq(lpoaDocuments.userId, doc.userId),
        ))
        .orderBy(desc(lpoaDocuments.signedAt));
      const activeDocument = documents.find((document) => (document.status || "active") === "active");
      if (activeDocument && legalNamesMatch(activeDocument.principalName, doc.principalName)) {
        const error: any = new Error("An active LPOA already exists");
        error.code = "ACTIVE_LPOA_EXISTS";
        throw error;
      }
      const previousDocument =
        documents.find((document) => document.status === "replacement_required") ||
        activeDocument ||
        null;
      const [created] = await tx.insert(lpoaDocuments)
        .values({
          ...doc,
          status: "active",
          supersedesDocumentId: previousDocument?.id || null,
        })
        .returning();
      if (previousDocument) {
        await tx.update(lpoaDocuments)
          .set({
            status: "superseded",
            supersededAt: new Date(),
            supersededByDocumentId: created.id,
          })
          .where(and(
            eq(lpoaDocuments.id, previousDocument.id),
            eq(lpoaDocuments.certificateId, certificateId),
            eq(lpoaDocuments.userId, doc.userId),
          ));
      }
      let requestToCompleteId = requestId;
      if (!requestToCompleteId) {
        const [pendingRequest] = await tx.select({ id: lpoaRequests.id }).from(lpoaRequests)
          .where(and(
            eq(lpoaRequests.certificateId, certificateId),
            eq(lpoaRequests.userId, doc.userId),
            eq(lpoaRequests.status, "pending"),
          ))
          .orderBy(desc(lpoaRequests.requestedAt))
          .limit(1);
        requestToCompleteId = pendingRequest?.id;
      }
      if (requestToCompleteId) {
        await tx.update(lpoaRequests)
          .set({
            status: "completed",
            completedAt: new Date(),
            completedByDocumentId: created.id,
          })
          .where(and(
            eq(lpoaRequests.id, requestToCompleteId),
            eq(lpoaRequests.certificateId, certificateId),
            eq(lpoaRequests.userId, doc.userId),
            eq(lpoaRequests.status, "pending"),
          ));
      }
      return created;
    });
  }

  async getCaseIdentityReview(certificateId: string, userId: string): Promise<CaseIdentityReview | undefined> {
    const [review] = await db.select().from(caseIdentityReviews)
      .where(and(
        eq(caseIdentityReviews.certificateId, certificateId),
        eq(caseIdentityReviews.userId, userId),
      ))
      .orderBy(desc(caseIdentityReviews.reviewedAt))
      .limit(1);
    return review;
  }

  async createCaseIdentityReview(review: InsertCaseIdentityReview): Promise<CaseIdentityReview> {
    const [created] = await db.insert(caseIdentityReviews).values(review).returning();
    return created;
  }

  async getLatestLpoaRequest(certificateId: string, userId: string): Promise<LpoaRequest | undefined> {
    const [request] = await db.select().from(lpoaRequests)
      .where(and(
        eq(lpoaRequests.certificateId, certificateId),
        eq(lpoaRequests.userId, userId),
      ))
      .orderBy(desc(lpoaRequests.requestedAt))
      .limit(1);
    return request;
  }

  async createLpoaRequest(request: InsertLpoaRequest): Promise<LpoaRequest> {
    const [created] = await db.insert(lpoaRequests).values(request).returning();
    return created;
  }

  async updateLpoaRequest(id: string, data: Partial<LpoaRequest>): Promise<LpoaRequest | undefined> {
    const [updated] = await db.update(lpoaRequests)
      .set(data)
      .where(eq(lpoaRequests.id, id))
      .returning();
    return updated;
  }

  async claimLpoaRequestSend(
    request: InsertLpoaRequest,
    cooldownMs: number,
    replacementReason?: string,
    expectedActiveDocumentId?: string,
  ): Promise<{ request: LpoaRequest; retryAfterSeconds: number | null }> {
    return db.transaction(async (tx) => {
      const lockKey = `lpoa-case:${request.certificateId}:${request.userId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const [latest] = await tx.select().from(lpoaRequests)
        .where(and(
          eq(lpoaRequests.certificateId, request.certificateId),
          eq(lpoaRequests.userId, request.userId),
        ))
        .orderBy(desc(lpoaRequests.requestedAt))
        .limit(1);
      const now = new Date();
      if (latest?.status === "pending" && latest.lastSentAt) {
        const elapsed = now.getTime() - new Date(latest.lastSentAt).getTime();
        if (elapsed < cooldownMs) {
          return {
            request: latest,
            retryAfterSeconds: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000)),
          };
        }
      }
      let claimed: LpoaRequest;
      if (latest?.status === "pending") {
        const [claimed] = await tx.update(lpoaRequests)
          .set({
            reason: request.reason,
            requestedBy: request.requestedBy,
            requestedByName: request.requestedByName,
            lastSentAt: now,
            sendAttemptCount: latest.sendAttemptCount + 1,
          })
          .where(eq(lpoaRequests.id, latest.id))
          .returning();
        if (replacementReason) {
          const [activeDocument] = await tx.select().from(lpoaDocuments)
            .where(and(
              eq(lpoaDocuments.id, expectedActiveDocumentId || ""),
              eq(lpoaDocuments.certificateId, request.certificateId),
              eq(lpoaDocuments.userId, request.userId),
              eq(lpoaDocuments.status, "active"),
            ))
            .limit(1);
          if (!activeDocument) {
            const error: any = new Error("There is no active LPOA to replace");
            error.code = "LPOA_CHANGED";
            throw error;
          }
          await tx.update(lpoaDocuments)
            .set({
              status: "replacement_required",
              replacementRequestedAt: now,
              replacementRequestedBy: request.requestedBy,
              replacementReason,
            })
            .where(and(
              eq(lpoaDocuments.id, activeDocument.id),
              eq(lpoaDocuments.certificateId, request.certificateId),
              eq(lpoaDocuments.userId, request.userId),
              eq(lpoaDocuments.status, "active"),
            ));
        }
        return { request: claimed, retryAfterSeconds: null };
      }
      const [created] = await tx.insert(lpoaRequests)
        .values({
          ...request,
          lastSentAt: now,
          sendAttemptCount: 1,
        })
        .returning();
      claimed = created;
      if (replacementReason) {
        const [activeDocument] = await tx.select().from(lpoaDocuments)
          .where(and(
            eq(lpoaDocuments.id, expectedActiveDocumentId || ""),
            eq(lpoaDocuments.certificateId, request.certificateId),
            eq(lpoaDocuments.userId, request.userId),
            eq(lpoaDocuments.status, "active"),
          ))
          .limit(1);
        if (!activeDocument) {
          const error: any = new Error("There is no active LPOA to replace");
          error.code = "LPOA_CHANGED";
          throw error;
        }
        await tx.update(lpoaDocuments)
          .set({
            status: "replacement_required",
            replacementRequestedAt: now,
            replacementRequestedBy: request.requestedBy,
            replacementReason,
          })
          .where(and(
            eq(lpoaDocuments.id, activeDocument.id),
            eq(lpoaDocuments.certificateId, request.certificateId),
            eq(lpoaDocuments.userId, request.userId),
            eq(lpoaDocuments.status, "active"),
          ));
      }
      return { request: claimed, retryAfterSeconds: null };
    });
  }

  async getFamilyDocumentsByUser(userId: string): Promise<FamilyDocument[]> {
    return db.select().from(familyDocuments).where(eq(familyDocuments.userId, userId)).orderBy(desc(familyDocuments.uploadedAt));
  }

  async getFamilyDocumentsByUsers(userIds: string[]): Promise<FamilyDocument[]> {
    if (userIds.length === 0) return [];
    return db.select().from(familyDocuments)
      .where(inArray(familyDocuments.userId, userIds))
      .orderBy(desc(familyDocuments.uploadedAt));
  }

  async getFamilyDocument(id: string): Promise<FamilyDocument | undefined> {
    const [doc] = await db.select().from(familyDocuments).where(eq(familyDocuments.id, id));
    return doc;
  }

  async getFamilyDocumentByPath(objectPath: string): Promise<FamilyDocument | undefined> {
    const [doc] = await db.select().from(familyDocuments).where(eq(familyDocuments.objectPath, objectPath));
    return doc;
  }

  async getFamilyDocumentsByCertificate(certificateId: string): Promise<FamilyDocument[]> {
    return db.select().from(familyDocuments)
      .where(eq(familyDocuments.certificateId, certificateId))
      .orderBy(desc(familyDocuments.uploadedAt));
  }

  async createFamilyDocument(doc: InsertFamilyDocument): Promise<FamilyDocument> {
    const [created] = await db.insert(familyDocuments).values(doc).returning();
    return created;
  }

  async deleteFamilyDocument(id: string): Promise<void> {
    await db.delete(familyDocuments).where(eq(familyDocuments.id, id));
  }

  async overrideUserIdVerification(userId: string, adminId: string, adminName: string, note: string | null): Promise<void> {
    await db.update(users)
      .set({
        idVerificationStatus: "verified",
        idVerifiedAt: new Date(),
        idOverrideBy: adminId,
        idOverrideByName: adminName,
        idOverrideAt: new Date(),
        idOverrideNote: note,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getSmsMessagesByPhone(phoneNumber: string): Promise<SmsMessage[]> {
    return db.select().from(smsMessages).where(eq(smsMessages.phoneNumber, phoneNumber)).orderBy(smsMessages.createdAt);
  }

  async createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage> {
    const [created] = await db.insert(smsMessages).values(message).returning();
    return created;
  }

  async getUnreadSmsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(smsMessages)
      .where(sql`direction = 'inbound' AND status = 'received'`);
    return Number(result[0]?.count || 0);
  }

  async getCaseTasksByCertificate(certificateId: string): Promise<CaseTask[]> {
    return db.select().from(caseTasks).where(eq(caseTasks.certificateId, certificateId)).orderBy(caseTasks.id);
  }

  async ensureCaseTasks(certificateId: string): Promise<CaseTask[]> {
    const existing = await this.getCaseTasksByCertificate(certificateId);
    if (existing.length >= CASE_TASK_KEYS.length) return existing;

    const existingKeys = new Set(existing.map(t => t.taskKey));
    const missing = CASE_TASK_KEYS.filter(k => !existingKeys.has(k));

    if (missing.length > 0) {
      for (const taskKey of missing) {
        try {
          await db.insert(caseTasks).values({ certificateId, taskKey });
        } catch {
        }
      }
    }
    return this.getCaseTasksByCertificate(certificateId);
  }

  async updateCaseTask(id: number, data: Partial<CaseTask>): Promise<CaseTask | undefined> {
    const [updated] = await db.update(caseTasks).set(data).where(eq(caseTasks.id, id)).returning();
    return updated;
  }

  // -------- HeartPlan (pre-death planning) --------
  async getHeartPlans(): Promise<HeartPlan[]> {
    return db.select().from(heartPlans).orderBy(desc(heartPlans.createdAt));
  }

  async getHeartPlan(id: string): Promise<HeartPlan | undefined> {
    const [plan] = await db.select().from(heartPlans).where(eq(heartPlans.id, id));
    return plan;
  }

  async getHeartPlanByUser(userId: string): Promise<HeartPlan | undefined> {
    const [plan] = await db.select().from(heartPlans).where(eq(heartPlans.userId, userId));
    return plan;
  }

  async getHeartPlanByCertificate(certificateId: string): Promise<HeartPlan | undefined> {
    const [plan] = await db.select().from(heartPlans).where(eq(heartPlans.certificateId, certificateId));
    return plan;
  }

  async createHeartPlan(plan: InsertHeartPlan): Promise<HeartPlan> {
    const [created] = await db.insert(heartPlans).values(plan).returning();
    return created;
  }

  async createHeartPlanRegistration(
    user: UpsertUser,
    plan: InsertHeartPlan,
    consents: Omit<InsertHeartPlanConsentRecord, "planId">[],
    intake: Pick<InsertHeartPlanIntake, "firstName" | "lastName" | "hasLifeInsurance">,
  ): Promise<{ user: User; plan: HeartPlan; consents: HeartPlanConsentRecord[]; intake: HeartPlanIntake }> {
    return db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(users).values(user).returning();
      const [createdPlan] = await tx.insert(heartPlans).values(plan).returning();
      const createdConsents = await tx.insert(heartPlanConsentRecords)
        .values(consents.map((consent) => ({ ...consent, planId: createdPlan.id })))
        .returning();
      const [createdIntake] = await tx.insert(heartPlanIntakes).values({
        ...intake,
        planId: createdPlan.id,
        currentStep: 0,
      }).returning();
      return { user: createdUser, plan: createdPlan, consents: createdConsents, intake: createdIntake };
    });
  }

  async getHeartPlanConsents(planId: string): Promise<HeartPlanConsentRecord[]> {
    return db.select().from(heartPlanConsentRecords)
      .where(eq(heartPlanConsentRecords.planId, planId))
      .orderBy(heartPlanConsentRecords.recordedAt);
  }

  async updateHeartPlan(id: string, data: Partial<HeartPlan>): Promise<HeartPlan | undefined> {
    const [updated] = await db.update(heartPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(heartPlans.id, id))
      .returning();
    return updated;
  }

  async deleteActiveHeartPlan(input: {
    id: string;
    deletedBy: string | null;
    deletedByName: string | null;
    reason: string;
  }): Promise<{ plan: HeartPlan; cleanupJob: HeartPlanDeletionJob } | undefined> {
    return db.transaction(async (tx) => {
      const [plan] = await tx.select().from(heartPlans)
        .where(eq(heartPlans.id, input.id))
        .for("update");
      if (!plan || plan.status !== "active" || plan.certificateId || plan.tier !== "free" || plan.upgradedAt) {
        return undefined;
      }
      const unresolvedRequests = await tx.select({ id: planActivationRequests.id })
        .from(planActivationRequests)
        .where(and(
          eq(planActivationRequests.planId, plan.id),
          inArray(planActivationRequests.status, ["pending_verification", "pending"]),
        ))
        .limit(1);
      if (unresolvedRequests.length > 0) return undefined;

      const [documents, letters] = await Promise.all([
        tx.select({ objectPath: planDocuments.objectPath }).from(planDocuments).where(eq(planDocuments.planId, plan.id)),
        tx.select({
          objectPath: planLetters.objectPath,
          pendingObjectPath: planLetters.pendingObjectPath,
        }).from(planLetters).where(eq(planLetters.planId, plan.id)),
      ]);
      const objectPaths = Array.from(new Set([
        ...documents.map((document) => document.objectPath),
        ...letters.flatMap((letter) => [letter.objectPath, letter.pendingObjectPath]),
      ].filter((path): path is string => Boolean(path))));
      const [cleanupJob] = await tx.insert(heartPlanDeletionJobs).values({
        planId: plan.id,
        deletedBy: input.deletedBy,
        deletedByName: input.deletedByName,
        reason: input.reason,
        objectPaths,
        // Signed private upload URLs are valid for 15 minutes. Waiting one
        // additional minute ensures a late PUT cannot recreate an object after
        // this job has already been marked complete.
        cleanupNotBefore: new Date(Date.now() + (objectPaths.length > 0 ? 16 * 60 * 1000 : 0)),
      }).returning();
      const [deleted] = await tx.delete(heartPlans)
        .where(and(
          eq(heartPlans.id, plan.id),
          eq(heartPlans.status, "active"),
          isNull(heartPlans.certificateId),
        ))
        .returning();
      if (!deleted) throw new Error("HeartPlan changed during deletion");
      return { plan: deleted, cleanupJob };
    });
  }

  async getPendingHeartPlanDeletionJobs(limit = 25): Promise<HeartPlanDeletionJob[]> {
    return db.select().from(heartPlanDeletionJobs)
      .where(eq(heartPlanDeletionJobs.status, "pending"))
      .orderBy(heartPlanDeletionJobs.createdAt)
      .limit(limit);
  }

  async completeHeartPlanDeletionJob(id: string): Promise<void> {
    await db.update(heartPlanDeletionJobs).set({
      status: "complete",
      completedAt: new Date(),
      lastAttemptAt: new Date(),
      lastError: null,
      attempts: sql`${heartPlanDeletionJobs.attempts} + 1`,
    }).where(eq(heartPlanDeletionJobs.id, id));
  }

  async failHeartPlanDeletionJob(id: string, error: string): Promise<void> {
    await db.update(heartPlanDeletionJobs).set({
      lastAttemptAt: new Date(),
      lastError: error.slice(0, 500),
      attempts: sql`${heartPlanDeletionJobs.attempts} + 1`,
    }).where(eq(heartPlanDeletionJobs.id, id));
  }

  async getHeartPlanIntake(planId: string): Promise<HeartPlanIntake | undefined> {
    const [intake] = await db.select().from(heartPlanIntakes).where(eq(heartPlanIntakes.planId, planId));
    return intake;
  }

  async upsertHeartPlanIntake(planId: string, data: Partial<InsertHeartPlanIntake>): Promise<HeartPlanIntake> {
    const [intake] = await db.insert(heartPlanIntakes)
      .values({ ...data, planId } as InsertHeartPlanIntake)
      .onConflictDoUpdate({
        target: heartPlanIntakes.planId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return intake;
  }

  // Atomic compare-and-set: upgrades a plan from "free" to a paid tier exactly
  // once, even if the webhook and the redirect-verify path race each other.
  // Returns undefined when the plan was already upgraded (or doesn't exist).
  async upgradeHeartPlanTier(id: string, tier: string, stripeCheckoutSessionId: string): Promise<HeartPlan | undefined> {
    const [upgraded] = await db.update(heartPlans)
      .set({ tier, stripeCheckoutSessionId, upgradedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(heartPlans.id, id), eq(heartPlans.tier, "free")))
      .returning();
    return upgraded;
  }

  async getOrsaLegacyEntitlement(userId: string) {
    const [entitlement] = await db.select().from(orsaLegacyEntitlements)
      .where(eq(orsaLegacyEntitlements.userId, userId));
    return entitlement;
  }

  async fulfillOrsaLegacyPurchase(input: {
    checkoutSessionId: string;
    userId: string;
    amountCents: number;
    currency: string;
    purchasedAt: Date;
  }) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 63005))`);
      const [existingPurchase] = await tx.select().from(orsaLegacyPurchases)
        .where(eq(orsaLegacyPurchases.checkoutSessionId, input.checkoutSessionId));
      if (existingPurchase) {
        if (existingPurchase.userId !== input.userId) throw new Error("ORSA Legacy purchase belongs to a different account");
        const [entitlement] = await tx.select().from(orsaLegacyEntitlements)
          .where(eq(orsaLegacyEntitlements.userId, input.userId));
        return { purchase: existingPurchase, entitlement, duplicate: true };
      }

      await tx.insert(orsaLegacyEntitlements).values({ userId: input.userId })
        .onConflictDoNothing({ target: orsaLegacyEntitlements.userId });
      const [entitlement] = await tx.select().from(orsaLegacyEntitlements)
        .where(eq(orsaLegacyEntitlements.userId, input.userId)).for("update");
      const { startsAt, expiresAt } = orsaLegacyExtensionDates(input.purchasedAt, entitlement?.paidThrough ?? null);
      const [purchase] = await tx.insert(orsaLegacyPurchases).values({
        checkoutSessionId: input.checkoutSessionId,
        userId: input.userId,
        amountCents: input.amountCents,
        currency: input.currency,
        purchasedAt: input.purchasedAt,
        startsAt,
        expiresAt,
      }).onConflictDoNothing({ target: orsaLegacyPurchases.checkoutSessionId }).returning();
      if (!purchase) {
        const [winner] = await tx.select().from(orsaLegacyPurchases)
          .where(eq(orsaLegacyPurchases.checkoutSessionId, input.checkoutSessionId));
        return { purchase: winner, entitlement, duplicate: true };
      }
      const [updatedEntitlement] = await tx.update(orsaLegacyEntitlements).set({
        paidThrough: expiresAt,
        ...(entitlement.pendingCheckoutSessionId === input.checkoutSessionId
          ? { pendingCheckoutSessionId: null, pendingCheckoutExpiresAt: null }
          : {}),
        updatedAt: new Date(),
      }).where(eq(orsaLegacyEntitlements.userId, input.userId)).returning();
      return { purchase, entitlement: updatedEntitlement, duplicate: false };
    });
  }

  // Atomic compare-and-set: flips an "active" plan to "activated" and returns it,
  // or returns undefined if the plan was already claimed/activated by another request.
  async claimHeartPlanForActivation(id: string): Promise<HeartPlan | undefined> {
    const [claimed] = await db.update(heartPlans)
      .set({ status: "activated", updatedAt: new Date() })
      .where(and(eq(heartPlans.id, id), eq(heartPlans.status, "active")))
      .returning();
    return claimed;
  }

  // Releases a claim taken by claimHeartPlanForActivation after a failed
  // conversion — but never un-activates a plan that has a case linked.
  async releaseHeartPlanClaim(id: string): Promise<void> {
    await db.update(heartPlans)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(heartPlans.id, id), eq(heartPlans.status, "activated"), isNull(heartPlans.certificateId)));
  }

  // Converts a claimed HeartPlan into a Steps After Life case atomically:
  // every insert/update runs in one DB transaction, so a mid-conversion
  // failure leaves no partial case data behind.
  async convertHeartPlanToCase(input: {
    planId: string;
    certificate: Omit<typeof certificates.$inferInsert, "id" | "blockchainHash">;
    accounts: Omit<typeof connectedAccounts.$inferInsert, "id" | "certificateId">[];
    relatives: Omit<typeof nearestRelatives.$inferInsert, "id" | "certificateId">[];
    documents: Omit<typeof familyDocuments.$inferInsert, "id" | "certificateId">[];
    letterIds: string[];
    releasedAt: Date;
    activatedBy: string | null;
    activatedByName: string;
  }): Promise<{ certificate: Certificate; plan: HeartPlan }> {
    return db.transaction(async (tx) => {
      const blockchainHash = `0x${randomUUID().replace(/-/g, '')}`;
      const [certificate] = await tx.insert(certificates)
        .values({ ...input.certificate, blockchainHash })
        .returning();
      for (const account of input.accounts) {
        await tx.insert(connectedAccounts).values({ ...account, certificateId: certificate.id });
      }
      for (const relative of input.relatives) {
        await tx.insert(nearestRelatives).values({ ...relative, certificateId: certificate.id });
      }
      for (const doc of input.documents) {
        await tx.insert(familyDocuments).values({ ...doc, certificateId: certificate.id });
      }
      for (const taskKey of CASE_TASK_KEYS) {
        await tx.insert(caseTasks).values({ certificateId: certificate.id, taskKey });
      }
      if (input.letterIds.length > 0) {
        await tx.update(planLetters)
          .set({ releasedAt: input.releasedAt, updatedAt: new Date() })
          .where(inArray(planLetters.id, input.letterIds));
      }
      // Guard: only the first conversion may link a case to the plan. A
      // concurrent or repeated attempt matches no row here, throws, and the
      // whole transaction (including its new certificate) rolls back.
      const [plan] = await tx.update(heartPlans)
        .set({
          status: "activated",
          certificateId: certificate.id,
          activatedAt: input.releasedAt,
          activatedBy: input.activatedBy,
          activatedByName: input.activatedByName,
          updatedAt: new Date(),
        })
        .where(and(eq(heartPlans.id, input.planId), isNull(heartPlans.certificateId)))
        .returning();
      if (!plan) {
        throw new Error("Plan was already converted to a case by another request");
      }
      return { certificate, plan };
    });
  }

  async getPlanWishes(planId: string): Promise<PlanWishes | undefined> {
    const [wishes] = await db.select().from(planWishes).where(eq(planWishes.planId, planId));
    return wishes;
  }

  async upsertPlanWishes(planId: string, data: Partial<PlanWishes>): Promise<PlanWishes> {
    const existing = await this.getPlanWishes(planId);
    if (existing) {
      const [updated] = await db.update(planWishes)
        .set({ ...data, planId, updatedAt: new Date() })
        .where(eq(planWishes.planId, planId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(planWishes).values({ ...data, planId }).returning();
    return created;
  }

  async getPlanDocuments(planId: string): Promise<PlanDocument[]> {
    return db.select().from(planDocuments).where(eq(planDocuments.planId, planId)).orderBy(desc(planDocuments.uploadedAt));
  }

  async getPlanDocument(id: string): Promise<PlanDocument | undefined> {
    const [doc] = await db.select().from(planDocuments).where(eq(planDocuments.id, id));
    return doc;
  }

  async getPlanDocumentByPath(objectPath: string): Promise<PlanDocument | undefined> {
    const [doc] = await db.select().from(planDocuments).where(eq(planDocuments.objectPath, objectPath));
    return doc;
  }

  async createPlanDocument(doc: InsertPlanDocument): Promise<PlanDocument> {
    const [created] = await db.insert(planDocuments).values(doc).returning();
    return created;
  }

  async createPlanDocumentWithinLimit(doc: InsertPlanDocument, limitBytes: number): Promise<{ document: PlanDocument | null; usedBytes: number }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ${heartPlans} WHERE id = ${doc.planId} FOR UPDATE`);
      const [usage] = await tx
        .select({ usedBytes: sql<number>`COALESCE(SUM(${planDocuments.fileSize}), 0)` })
        .from(planDocuments)
        .where(eq(planDocuments.planId, doc.planId));
      const usedBytes = Number(usage?.usedBytes || 0);
      const fileSize = Number(doc.fileSize || 0);
      if (usedBytes + fileSize > limitBytes) return { document: null, usedBytes };
      const [document] = await tx.insert(planDocuments).values(doc).returning();
      return { document, usedBytes: usedBytes + fileSize };
    });
  }

  async deletePlanDocument(id: string): Promise<void> {
    await db.delete(planDocuments).where(eq(planDocuments.id, id));
  }

  async getPlanAssets(planId: string): Promise<PlanAsset[]> {
    return db.select().from(planAssets).where(eq(planAssets.planId, planId)).orderBy(planAssets.createdAt);
  }

  async getPlanAsset(id: string): Promise<PlanAsset | undefined> {
    const [asset] = await db.select().from(planAssets).where(eq(planAssets.id, id));
    return asset;
  }

  async createPlanAsset(asset: InsertPlanAsset): Promise<PlanAsset> {
    const [created] = await db.insert(planAssets).values(asset).returning();
    return created;
  }

  async updatePlanAsset(id: string, data: Partial<PlanAsset>): Promise<PlanAsset | undefined> {
    const [updated] = await db.update(planAssets).set(data).where(eq(planAssets.id, id)).returning();
    return updated;
  }

  async deletePlanAsset(id: string): Promise<void> {
    await db.delete(planAssets).where(eq(planAssets.id, id));
  }

  async getPlanDiscoverySessions(planId: string): Promise<PlanDiscoverySession[]> {
    return db.select().from(planDiscoverySessions)
      .where(eq(planDiscoverySessions.planId, planId))
      .orderBy(planDiscoverySessions.createdAt);
  }

  async getPlanDiscoveryItems(planId: string): Promise<PlanDiscoveryItem[]> {
    return db.select().from(planDiscoveryItems)
      .where(eq(planDiscoveryItems.planId, planId))
      .orderBy(planDiscoveryItems.createdAt);
  }

  async getPlanDiscoveryItem(id: string): Promise<PlanDiscoveryItem | undefined> {
    const [item] = await db.select().from(planDiscoveryItems).where(eq(planDiscoveryItems.id, id));
    return item;
  }

  async createPlanDiscoverySession(session: InsertPlanDiscoverySession): Promise<PlanDiscoverySession> {
    const [created] = await db.insert(planDiscoverySessions).values(session).returning();
    return created;
  }

  async createPlanDiscoveryItems(items: InsertPlanDiscoveryItem[]): Promise<PlanDiscoveryItem[]> {
    if (items.length === 0) return [];
    return db.insert(planDiscoveryItems).values(items).returning();
  }

  async updatePlanDiscoverySession(id: string, data: Partial<PlanDiscoverySession>): Promise<PlanDiscoverySession | undefined> {
    const [updated] = await db.update(planDiscoverySessions).set(data)
      .where(eq(planDiscoverySessions.id, id)).returning();
    return updated;
  }

  async updatePlanDiscoveryItem(id: string, data: Partial<PlanDiscoveryItem>): Promise<PlanDiscoveryItem | undefined> {
    const [updated] = await db.update(planDiscoveryItems).set({ ...data, updatedAt: new Date() })
      .where(eq(planDiscoveryItems.id, id)).returning();
    return updated;
  }

  async mergePlanDiscoveryItems(planId: string, sourceId: string, targetId: string): Promise<{ source: PlanDiscoveryItem; target: PlanDiscoveryItem } | undefined> {
    if (sourceId === targetId) return undefined;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ${heartPlans} WHERE id = ${planId} FOR UPDATE`);
      const items = await tx.select().from(planDiscoveryItems).where(and(
        eq(planDiscoveryItems.planId, planId),
        inArray(planDiscoveryItems.id, [sourceId, targetId]),
      ));
      const source = items.find((item) => item.id === sourceId);
      const target = items.find((item) => item.id === targetId);
      if (!source || !target || source.status === "saved" || target.status === "saved" ||
          source.status === "dismissed" || target.status === "dismissed" ||
          source.name.trim().toLowerCase() !== target.name.trim().toLowerCase()) {
        return undefined;
      }
      const [updatedTarget] = await tx.update(planDiscoveryItems).set({
        institution: target.institution || source.institution,
        accountNumberHint: target.accountNumberHint || source.accountNumberHint,
        estimatedValue: target.estimatedValue || source.estimatedValue,
        monthlyAmount: target.monthlyAmount || source.monthlyAmount,
        recurrence: target.recurrence || source.recurrence,
        updatedAt: new Date(),
      }).where(eq(planDiscoveryItems.id, target.id)).returning();
      const [updatedSource] = await tx.update(planDiscoveryItems).set({
        status: "dismissed",
        updatedAt: new Date(),
      }).where(eq(planDiscoveryItems.id, source.id)).returning();
      return { source: updatedSource, target: updatedTarget };
    });
  }

  async saveSelectedDiscoveryItems(planId: string, itemIds?: string[]): Promise<PlanDiscoveryItem[]> {
    return db.transaction(async (tx) => {
      // Serialize saves for this plan. Re-reading after the lock makes retries
      // and concurrent requests idempotent.
      await tx.execute(sql`SELECT id FROM ${heartPlans} WHERE id = ${planId} FOR UPDATE`);
      if (itemIds?.length) {
        const selectable = await tx.select({ id: planDiscoveryItems.id }).from(planDiscoveryItems).where(and(
          eq(planDiscoveryItems.planId, planId),
          inArray(planDiscoveryItems.id, itemIds),
        ));
        for (const item of selectable) {
          await tx.update(planDiscoveryItems).set({ status: "selected", updatedAt: new Date() }).where(and(
            eq(planDiscoveryItems.id, item.id),
             inArray(planDiscoveryItems.status, ["pending", "selected"]),
          ));
        }
      }
      const selected = await tx.select().from(planDiscoveryItems).where(and(
        eq(planDiscoveryItems.planId, planId),
        eq(planDiscoveryItems.status, "selected"),
        isNull(planDiscoveryItems.savedPlanAssetId),
      ));
      for (const item of selected) {
        const provenance = `Discovered in synthetic ${item.source} demo; classification: ${item.classification}.`;
        const [asset] = await tx.insert(planAssets).values({
          planId,
          name: item.name,
          category: item.category as any,
          assetType: item.classification,
          institution: item.institution,
          accountNumberHint: item.accountNumberHint,
          estimatedValue: item.estimatedValue,
          notes: [provenance, item.recurrence ? `Recurrence: ${item.recurrence}.` : null, item.notes]
            .filter(Boolean).join(" "),
        }).returning();
        await tx.update(planDiscoveryItems).set({
          savedPlanAssetId: asset.id,
          status: "saved",
          updatedAt: new Date(),
        }).where(eq(planDiscoveryItems.id, item.id));
      }
      return tx.select().from(planDiscoveryItems).where(eq(planDiscoveryItems.planId, planId));
    });
  }

  async resetPlanDiscovery(planId: string): Promise<void> {
    // Items cascade. Saved plan assets intentionally remain regular plan data.
    await db.delete(planDiscoverySessions).where(eq(planDiscoverySessions.planId, planId));
  }

  async getPlanContacts(planId: string): Promise<PlanContact[]> {
    return db.select().from(planContacts).where(eq(planContacts.planId, planId)).orderBy(planContacts.createdAt);
  }

  async getPlanAdvisorContacts(planId: string) {
    return db.select({
      isAdvisor: planContacts.isAdvisor,
      email: planContacts.email,
      advisorAccessLevel: planContacts.advisorAccessLevel,
      advisorPermission: planContacts.advisorPermission,
      fullName: planContacts.fullName,
    }).from(planContacts).where(and(eq(planContacts.planId, planId), eq(planContacts.isAdvisor, true)))
      .orderBy(planContacts.createdAt);
  }

  async getHeartPlanAdvisorSummary(planId: string) {
    return readHeartPlanAdvisorSummary(db, planId);
  }

  async getHeartPlanAdminData(planIds?: string[]) {
    return readHeartPlanAdminData(db, planIds);
  }

  async getPlanContact(id: string): Promise<PlanContact | undefined> {
    const [contact] = await db.select().from(planContacts).where(eq(planContacts.id, id));
    return contact;
  }

  async createPlanContact(contact: InsertPlanContact): Promise<PlanContact> {
    const [created] = await db.insert(planContacts).values(contact).returning();
    return created;
  }

  async updatePlanContact(id: string, data: Partial<PlanContact>): Promise<PlanContact | undefined> {
    const [updated] = await db.update(planContacts).set(data).where(eq(planContacts.id, id)).returning();
    return updated;
  }

  async getDueIncompleteHeartPlanReminderCandidates(now: Date) {
    const intakeCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const rows = await db
      .select({
        planId: heartPlans.id,
        email: users.email,
        firstName: users.firstName,
        intakeCreatedAt: heartPlanIntakes.createdAt,
        planStatus: heartPlans.status,
        reminderSentCycle: heartPlanIntakes.reminderSentCycle,
        reminderLeaseExpiresAt: heartPlanIntakes.reminderLeaseExpiresAt,
        reminderRetryAt: heartPlanIntakes.reminderRetryAt,
      })
      .from(heartPlanIntakes)
      .innerJoin(heartPlans, eq(heartPlanIntakes.planId, heartPlans.id))
      .innerJoin(users, eq(heartPlans.userId, users.id))
      .where(and(
        eq(heartPlans.status, "active"),
        sql`${users.role} IN ('planner', 'user')`,
        eq(users.isDemoAccount, false),
        isNull(heartPlanIntakes.completedAt),
        sql`${users.email} IS NOT NULL AND btrim(${users.email}) <> ''`,
        sql`${heartPlanIntakes.createdAt} <= ${intakeCutoff}`,
        sql`(${heartPlanIntakes.reminderLeaseExpiresAt} IS NULL OR ${heartPlanIntakes.reminderLeaseExpiresAt} <= ${now})`,
        sql`(${heartPlanIntakes.reminderRetryAt} IS NULL OR ${heartPlanIntakes.reminderRetryAt} <= ${now})`,
      ));
    return rows
      .filter((row): row is typeof row & { email: string } => !!row.email && !isDemoAccountEmail(row.email))
      .map(({ firstName, ...row }) => ({
        ...row,
        plannerName: firstName?.trim() || "there",
      }));
  }

  async claimIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, now: Date, leaseExpiresAt: Date): Promise<boolean> {
    const [claimed] = await db.update(heartPlanIntakes)
      .set({
        reminderClaimCycle: cycle,
        reminderLeaseToken: leaseToken,
        reminderLeaseExpiresAt: leaseExpiresAt,
      })
      .where(and(
        eq(heartPlanIntakes.planId, planId),
        sql`${heartPlanIntakes.reminderSentCycle} < ${cycle}`,
        sql`(${heartPlanIntakes.reminderLeaseExpiresAt} IS NULL OR ${heartPlanIntakes.reminderLeaseExpiresAt} <= ${now})`,
        sql`(${heartPlanIntakes.reminderRetryAt} IS NULL OR ${heartPlanIntakes.reminderRetryAt} <= ${now})`,
        sql`EXISTS (SELECT 1 FROM ${heartPlans} WHERE ${heartPlans.id} = ${planId} AND ${heartPlans.status} = 'active')`,
      ))
      .returning({ planId: heartPlanIntakes.planId });
    return !!claimed;
  }

  async completeIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, sentAt: Date): Promise<boolean> {
    const [completed] = await db.update(heartPlanIntakes)
      .set({
        reminderSentCycle: cycle,
        reminderLastSentAt: sentAt,
        reminderLeaseToken: null,
        reminderLeaseExpiresAt: null,
        reminderRetryAt: null,
      })
      .where(and(
        eq(heartPlanIntakes.planId, planId),
        eq(heartPlanIntakes.reminderClaimCycle, cycle),
        eq(heartPlanIntakes.reminderLeaseToken, leaseToken),
      ))
      .returning({ planId: heartPlanIntakes.planId });
    return !!completed;
  }

  async failIncompleteHeartPlanReminder(planId: string, cycle: number, leaseToken: string, retryAt: Date): Promise<void> {
    await db.update(heartPlanIntakes)
      .set({
        reminderLeaseToken: null,
        reminderLeaseExpiresAt: null,
        reminderRetryAt: retryAt,
      })
      .where(and(
        eq(heartPlanIntakes.planId, planId),
        eq(heartPlanIntakes.reminderClaimCycle, cycle),
        eq(heartPlanIntakes.reminderLeaseToken, leaseToken),
      ));
  }

  async deletePlanContact(id: string): Promise<void> {
    await db.delete(planContacts).where(eq(planContacts.id, id));
  }

  // Contacts that should have received the one-time "how to report a loss"
  // info email but haven't been stamped yet (e.g. the fire-and-forget send
  // failed). Joined with the plan to recover the planner for the email body.
  // Contacts that already burned through MAX_INFO_EMAIL_ATTEMPTS are excluded —
  // the address is presumed undeliverable and the planner/team has been alerted.
  async getPlanContactsNeedingInfoEmail(): Promise<Array<{ contact: PlanContact; plannerUserId: string }>> {
    return db
      .select({ contact: planContacts, plannerUserId: heartPlans.userId })
      .from(planContacts)
      .innerJoin(heartPlans, eq(planContacts.planId, heartPlans.id))
      .where(and(
        eq(planContacts.canRequestActivation, true),
        eq(heartPlans.status, "active"),
        isNull(planContacts.infoEmailSentAt),
        sql`${planContacts.email} IS NOT NULL AND btrim(${planContacts.email}) <> ''`,
        lt(planContacts.infoEmailAttempts, MAX_INFO_EMAIL_ATTEMPTS),
      ));
  }

  async getPlanContactsNeedingAdvisorInvitation(): Promise<Array<{ contact: PlanContact; plannerUserId: string }>> {
    return db
      .select({ contact: planContacts, plannerUserId: heartPlans.userId })
      .from(planContacts)
      .innerJoin(heartPlans, eq(planContacts.planId, heartPlans.id))
      .where(and(
        eq(planContacts.isAdvisor, true),
        eq(heartPlans.status, "active"),
        isNull(planContacts.advisorNotifiedAt),
        sql`${planContacts.email} IS NOT NULL AND btrim(${planContacts.email}) <> ''`,
      ));
  }

  // Atomically bump the failed-send counter for the info email and return the
  // updated contact (so callers can check whether the max was just reached).
  async incrementPlanContactInfoEmailAttempts(id: string): Promise<PlanContact | undefined> {
    const [updated] = await db.update(planContacts)
      .set({ infoEmailAttempts: sql`${planContacts.infoEmailAttempts} + 1` })
      .where(eq(planContacts.id, id))
      .returning();
    return updated;
  }

  // Stamp the "gave up — address appears undeliverable" marker exactly once.
  // Returns the contact only when this call performed the stamping, so the
  // caller can send the undeliverable alert without ever duplicating it.
  async markPlanContactInfoEmailFailed(id: string): Promise<PlanContact | undefined> {
    const [updated] = await db.update(planContacts)
      .set({ infoEmailFailedAt: new Date() })
      .where(and(eq(planContacts.id, id), isNull(planContacts.infoEmailFailedAt)))
      .returning();
    return updated;
  }

  // A post-send bounce (reported via SendGrid's Event Webhook) means the API
  // accepted the message but the address never received it — so the "sent"
  // stamp is a lie. Undo it, exhaust the retry counter (resending to a
  // bouncing address is pointless), and stamp the undeliverable marker.
  // Guarded to fire exactly once so the caller can alert the planner/team
  // without duplicates when SendGrid re-delivers webhook events. A later
  // email correction resets all three fields, re-enabling the send flow.
  async markPlanContactInfoEmailBounced(id: string): Promise<PlanContact | undefined> {
    const [updated] = await db.update(planContacts)
      .set({
        infoEmailSentAt: null,
        infoEmailAttempts: MAX_INFO_EMAIL_ATTEMPTS,
        infoEmailFailedAt: new Date(),
      })
      .where(and(eq(planContacts.id, id), isNull(planContacts.infoEmailFailedAt)))
      .returning();
    return updated;
  }

  async getPlanLetters(planId: string): Promise<PlanLetter[]> {
    return db.select().from(planLetters).where(eq(planLetters.planId, planId)).orderBy(planLetters.createdAt);
  }

  async getPlanLetter(id: string): Promise<PlanLetter | undefined> {
    const [letter] = await db.select().from(planLetters).where(eq(planLetters.id, id));
    return letter;
  }

  async getPlanLetterByPath(objectPath: string): Promise<PlanLetter | undefined> {
    const [letter] = await db.select().from(planLetters)
      .where(or(eq(planLetters.objectPath, objectPath), eq(planLetters.pendingObjectPath, objectPath)));
    return letter;
  }

  async createPlanLetter(letter: InsertPlanLetter): Promise<PlanLetter> {
    const [created] = await db.insert(planLetters).values(letter).returning();
    return created;
  }

  async updatePlanLetter(id: string, data: Partial<PlanLetter>): Promise<PlanLetter | undefined> {
    const [updated] = await db.update(planLetters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(planLetters.id, id))
      .returning();
    return updated;
  }

  async setPlanLetterGeneratedTranscript(id: string, objectPath: string, transcript: string): Promise<PlanLetter | undefined> {
    const [updated] = await db.update(planLetters)
      .set({ transcript, transcriptStatus: "completed", updatedAt: new Date() })
      .where(and(
        eq(planLetters.id, id),
        eq(planLetters.objectPath, objectPath),
        eq(planLetters.transcriptObjectPath, objectPath),
        isNull(planLetters.transcriptEditedAt),
      ))
      .returning();
    return updated;
  }

  async markPlanLetterTranscriptFailed(id: string, objectPath: string): Promise<PlanLetter | undefined> {
    const [updated] = await db.update(planLetters)
      .set({ transcriptStatus: "failed", updatedAt: new Date() })
      .where(and(
        eq(planLetters.id, id),
        eq(planLetters.objectPath, objectPath),
        eq(planLetters.transcriptObjectPath, objectPath),
        isNull(planLetters.transcriptEditedAt),
      ))
      .returning();
    return updated;
  }

  async deletePlanLetter(id: string): Promise<void> {
    await db.delete(planLetters).where(eq(planLetters.id, id));
  }

  async getPlanEvents(planId: string): Promise<PlanEvent[]> {
    return db.select().from(planEvents).where(eq(planEvents.planId, planId)).orderBy(desc(planEvents.createdAt));
  }

  async createPlanActivationRequest(request: InsertPlanActivationRequest): Promise<PlanActivationRequest> {
    const [created] = await db.insert(planActivationRequests).values(request).returning();
    return created;
  }

  async getPlanActivationRequest(id: string): Promise<PlanActivationRequest | undefined> {
    const [request] = await db.select().from(planActivationRequests).where(eq(planActivationRequests.id, id));
    return request;
  }

  async getPlanActivationRequestByToken(token: string): Promise<PlanActivationRequest | undefined> {
    const [request] = await db.select().from(planActivationRequests).where(eq(planActivationRequests.token, token));
    return request;
  }

  async getPlanActivationRequests(planId: string): Promise<PlanActivationRequest[]> {
    return db.select().from(planActivationRequests)
      .where(eq(planActivationRequests.planId, planId))
      .orderBy(desc(planActivationRequests.createdAt));
  }

  // Verified requests awaiting concierge review, across all plans.
  async getPendingActivationRequests(): Promise<PlanActivationRequest[]> {
    return db.select().from(planActivationRequests)
      .where(eq(planActivationRequests.status, "pending"))
      .orderBy(desc(planActivationRequests.createdAt));
  }

  async updatePlanActivationRequest(id: string, data: Partial<PlanActivationRequest>): Promise<PlanActivationRequest | undefined> {
    const [updated] = await db.update(planActivationRequests)
      .set(data)
      .where(eq(planActivationRequests.id, id))
      .returning();
    return updated;
  }

  // After a successful activation, close out every open request on the plan.
  async markPlanActivationRequestsApproved(planId: string, reviewedBy: string | null, reviewedByName: string): Promise<void> {
    await db.update(planActivationRequests)
      .set({ status: "approved", reviewedBy, reviewedByName, reviewedAt: new Date() })
      .where(and(
        eq(planActivationRequests.planId, planId),
        or(eq(planActivationRequests.status, "pending"), eq(planActivationRequests.status, "pending_verification"))
      ));
  }

  async logPlanEvent(event: InsertPlanEvent): Promise<PlanEvent> {
    const [created] = await db.insert(planEvents).values(event).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
