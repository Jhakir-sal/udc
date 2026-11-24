import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, boolean, integer, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  LEGACY_LPOA_AGREEMENT,
  LEGACY_LPOA_AGREEMENT_VERSION,
  serializeLpoaAgreement,
} from "./lpoaAgreement";
import { users } from "./models/auth";
import type { CompanyRoutingApproval } from "./companyEmailRouting";

// Export auth models
export * from "./models/auth";

export const conciergeInquiries = pgTable("concierge_inquiries", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  careLocation: text("care_location").notNull().default(""),
  bestTime: text("best_time").notNull().default(""),
  status: text("status").notNull().default("new"),
  notificationStatus: text("notification_status").notNull().default("pending"),
  contactPermissionAt: timestamp("contact_permission_at").defaultNow().notNull(),
  sourceHash: text("source_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [
  index("concierge_inquiries_created_idx").on(table.createdAt),
  index("concierge_inquiries_source_created_idx").on(table.sourceHash, table.createdAt),
]);

export const nextOfKinPrivateIdentities = pgTable("next_of_kin_private_identities", {
  certificateId: varchar("certificate_id").primaryKey().references(() => certificates.id, { onDelete: "cascade" }),
  contactToken: varchar("contact_token", { length: 64 }).notNull(),
  encryptedIdentity: text("encrypted_identity").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const certificateStatusEnum = pgEnum("certificate_status", [
  "pending",
  "verified",
  "processing",
  "completed"
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "pending_action",
  "suspended",
  "closed"
]);

export const accountActionEnum = pgEnum("account_action", [
  "close",
  "suspend",
  "continue",
  "transfer"
]);

export const ACCOUNT_CATEGORIES = [
  "financial",
  "memberships",
  "subscriptions",
  "real_estate",
  "protected_information",
  "miscellaneous"
] as const;
export type AccountCategory = typeof ACCOUNT_CATEGORIES[number];

export const taskCompletionStatusEnum = pgEnum("task_completion_status", [
  "pending",
  "successful",
  "not_completed",
  "unsuccessful",
  "not_applicable"
]);

export const webhookStatusEnum = pgEnum("webhook_status", [
  "pending",
  "sent",
  "delivered",
  "failed",
  "failed_permanent"
]);

export const certificates = pgTable("certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  deceasedName: text("deceased_name").notNull(),
  deceasedSsn: text("deceased_ssn"),
  dateOfDeath: text("date_of_death").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  certificateNumber: text("certificate_number").notNull().unique(),
  issuingAuthority: text("issuing_authority").notNull(),
  status: certificateStatusEnum("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
  blockchainHash: text("blockchain_hash"),
  fatherName: text("father_name"),
  motherName: text("mother_name"),
  nextOfKinName: text("next_of_kin_name"),
  nextOfKinRelationship: text("next_of_kin_relationship"),
  nextOfKinPhone: text("next_of_kin_phone"),
  nextOfKinEmail: text("next_of_kin_email"),
  nextOfKinAddress: text("next_of_kin_address"),
  nextOfKinCity: text("next_of_kin_city"),
  nextOfKinState: text("next_of_kin_state"),
  nextOfKinZip: text("next_of_kin_zip"),
  informantName: text("informant_name"),
  informantRelationship: text("informant_relationship"),
  informantPhone: text("informant_phone"),
  informantEmail: text("informant_email"),
  informantAddress: text("informant_address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  contactAddress: text("contact_address"),
  placeOfDeathType: text("place_of_death_type"),
  placeOfDeathFacility: text("place_of_death_facility"),
  placeOfDeathAddress: text("place_of_death_address"),
  placeOfDeathCity: text("place_of_death_city"),
  placeOfDeathCounty: text("place_of_death_county"),
  placeOfDeathState: text("place_of_death_state"),
  placeOfDeathZip: text("place_of_death_zip"),
  documentUrl: text("document_url"),
  aiVerificationStatus: text("ai_verification_status"),
  aiConfidenceScore: integer("ai_confidence_score"),
  aiVerificationDetails: text("ai_verification_details"),
  referralSource: text("referral_source"),
  referralDetail: text("referral_detail"),
  estateStatus: text("estate_status"),
  submitterRelationship: text("submitter_relationship"),
  isAuthorizedExecutor: text("is_authorized_executor"),
  servicePlan: text("service_plan"),
  paymentStatus: text("payment_status").default("unpaid"),
  paymentAmount: integer("payment_amount"),
  paidAt: timestamp("paid_at"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
}, (table) => [
  index("certificates_user_submitted_idx").on(table.userId, table.submittedAt),
]);

export const referralStatusEnum = pgEnum("case_referral_status", [
  "pending_family_confirmation",
  "confirmed",
  "declined",
  "revoked",
]);

// Operational referral contacts are deliberately separate from marketplace
// listings and partner user accounts. A linkage never implies referral consent.
export const referralCompanies = pgTable("referral_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notificationEmail: text("notification_email").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  funeralHomeId: varchar("funeral_home_id"),
  marketplaceProviderId: varchar("marketplace_provider_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("referral_companies_active_name_idx").on(table.isActive, table.name),
  index("referral_companies_funeral_home_idx").on(table.funeralHomeId),
  index("referral_companies_marketplace_idx").on(table.marketplaceProviderId),
]);

export const caseReferrals = pgTable("case_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  referralCompanyId: varchar("referral_company_id").notNull().references(() => referralCompanies.id),
  status: referralStatusEnum("status").notNull().default("pending_family_confirmation"),
  requestedBy: varchar("requested_by").notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  consentVersion: text("consent_version").notNull(),
  consentScope: text("consent_scope").notNull(),
  familyDecisionBy: varchar("family_decision_by"),
  familyDecisionAt: timestamp("family_decision_at"),
  confirmationEmailSentAt: timestamp("confirmation_email_sent_at"),
  initialPartnerEmailSentAt: timestamp("initial_partner_email_sent_at"),
  revokedBy: varchar("revoked_by"),
  revokedAt: timestamp("revoked_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("case_referrals_one_per_certificate_idx").on(table.certificateId),
  index("case_referrals_company_status_idx").on(table.referralCompanyId, table.status),
]);

export const referralMilestoneDeliveries = pgTable("referral_milestone_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseReferralId: varchar("case_referral_id").notNull().references(() => caseReferrals.id, { onDelete: "cascade" }),
  milestoneKey: text("milestone_key").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  lastError: text("last_error"),
}, (table) => [
  uniqueIndex("referral_milestone_delivery_once_idx").on(table.caseReferralId, table.milestoneKey),
]);

export const insertReferralCompanySchema = createInsertSchema(referralCompanies).omit({ id: true, createdAt: true, updatedAt: true });
export type ReferralCompany = typeof referralCompanies.$inferSelect;
export type InsertReferralCompany = z.infer<typeof insertReferralCompanySchema>;
export type CaseReferral = typeof caseReferrals.$inferSelect;
export type ReferralMilestoneDelivery = typeof referralMilestoneDeliveries.$inferSelect;

export const REFERRAL_SOURCES = [
  { value: "orsa", label: "ORSA / CFCU" },
  { value: "care_patrol", label: "Care Patrol" },
  { value: "funeral_home", label: "Funeral Home" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_EXEMPT_REFERRAL_SOURCES = ["orsa"] as const;

export const SERVICE_PLANS = [
  { value: "bronze", label: "Bronze", amount: 50000, display: "$500" },
  { value: "silver", label: "Silver", amount: 150000, display: "$1,500" },
  { value: "platinum", label: "Platinum", amount: 300000, display: "$3,000" },
] as const;

export function isPaymentExempt(referralSource: string | null | undefined): boolean {
  return !!referralSource && (PAYMENT_EXEMPT_REFERRAL_SOURCES as readonly string[]).includes(referralSource);
}

export const COMPANY_DIRECTORY_CATEGORIES = ACCOUNT_CATEGORIES;
export const companyDirectory = pgTable("company_directory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
  category: text("category").notNull(),
  officialDomain: text("official_domain").notNull(),
  notificationEmail: text("notification_email"),
  routingApproval: jsonb("routing_approval").$type<CompanyRoutingApproval>(),
  website: text("website"),
  isNational: boolean("is_national").notNull().default(true),
  status: text("status").notNull().default("active"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_directory_domain_idx").on(table.officialDomain),
  index("company_directory_search_idx").on(table.status, table.name),
]);

export const connectedAccounts = pgTable("connected_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  companyId: varchar("company_id").references(() => companyDirectory.id),
  accountName: text("account_name").notNull(),
  accountType: text("account_type").notNull(),
  category: text("category").notNull(),
  accountNumber: text("account_number"),
  isJoint: boolean("is_joint").notNull().default(false),
  accountDesignation: text("account_designation"),
  survivorName: text("survivor_name"),
  status: accountStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  selectedAction: accountActionEnum("selected_action"),
  actionDate: timestamp("action_date"),
  notificationSentAt: timestamp("notification_sent_at"),
  taskCompletionStatus: taskCompletionStatusEnum("task_completion_status").default("pending"),
  taskCompletionMessage: text("task_completion_message"),
  taskCompletedAt: timestamp("task_completed_at"),
  providerReference: text("provider_reference"),
  transferToName: text("transfer_to_name"),
  transferToRelationship: text("transfer_to_relationship"),
  transferVerifiedBy: text("transfer_verified_by"),
  transferVerificationId: varchar("transfer_verification_id"),
  transferVerifiedAt: timestamp("transfer_verified_at"),
  addedBy: text("added_by"),
  responsibleParty: text("responsible_party"),
  familyActionInstructions: text("family_action_instructions"),
  familyContactPhone: text("family_contact_phone"),
  familyContactEmail: text("family_contact_email"),
  completedBy: text("completed_by"),
});

/** Website evidence is separate from ordinary account-edit fields so it cannot be forged by CRUD. */
export const accountCompanyPhones = pgTable("account_company_phones", {
  accountId: varchar("account_id").primaryKey().references(() => connectedAccounts.id, { onDelete: "cascade" }),
  accountNameSnapshot: text("account_name_snapshot").notNull(),
  accountTypeSnapshot: text("account_type_snapshot").notNull().default(""),
  companyIdSnapshot: varchar("company_id_snapshot"),
  officialDomain: text("official_domain").notNull(),
  phone: text("phone").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceKind: text("source_kind").notNull(),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at").notNull(),
  lastCheckFailedAt: timestamp("last_check_failed_at"),
});

/** Single-use, time-limited capability for a funeral home to submit a certificate. */
export const deathCertificateInviteStatusEnum = pgEnum("death_certificate_invite_status", [
  "pending", "completed", "revoked", "expired",
]);
export const deathCertificateInvites = pgTable("death_certificate_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  funeralHomeName: text("funeral_home_name").notNull(),
  inviteeEmail: text("invitee_email").notNull(),
  status: deathCertificateInviteStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: varchar("created_by").notNull(),
  uploadedAt: timestamp("uploaded_at"),
  uploadedObjectPath: text("uploaded_object_path"),
  uploadedMimeType: text("uploaded_mime_type"),
  uploadedFileSize: integer("uploaded_file_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("death_certificate_invites_certificate_idx").on(table.certificateId, table.createdAt),
  index("death_certificate_invites_status_expiry_idx").on(table.status, table.expiresAt),
  uniqueIndex("death_certificate_invites_one_active_idx").on(table.certificateId)
    .where(sql`${table.status} = 'pending'`),
]);
export type DeathCertificateInvite = typeof deathCertificateInvites.$inferSelect;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  accountId: varchar("account_id").references(() => connectedAccounts.id),
  message: text("message").notNull(),
  type: text("type").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});


export const webhookLogs = pgTable("webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => connectedAccounts.id),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  webhookUrl: text("webhook_url").notNull(),
  payload: text("payload").notNull(),
  encryptedData: text("encrypted_data").notNull(),
  blockchainHash: text("blockchain_hash").notNull(),
  status: webhookStatusEnum("status").notNull().default("pending"),
  responseCode: text("response_code"),
  responseBody: text("response_body"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  retryCount: text("retry_count").default("0"),
});

export const serviceProviders = pgTable("service_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  webhookUrl: text("webhook_url"),
  apiKey: text("api_key"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const companyMemberships = pgTable("company_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companyDirectory.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_memberships_company_user_idx").on(table.companyId, table.userId),
  index("company_memberships_user_status_idx").on(table.userId, table.status),
]);

export const companyDeathNotices = pgTable("company_death_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companyDirectory.id),
  secureRecordId: varchar("secure_record_id", { length: 64 }).notNull().unique(),
  status: text("status").notNull().default("draft"),
  destinationEmail: text("destination_email"),
  createdBy: varchar("created_by").notNull(),
  sentAt: timestamp("sent_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("company_death_notices_account_company_active_idx")
    .on(table.accountId, table.companyId)
    .where(sql`${table.status} <> 'revoked'`),
  index("company_death_notices_company_status_idx").on(table.companyId, table.status),
]);

export const certificateAccessRequests = pgTable("certificate_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noticeId: varchar("notice_id").notNull().references(() => companyDeathNotices.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companyDirectory.id),
  requesterUserId: varchar("requester_user_id").notNull(),
  purpose: text("purpose").notNull(),
  attestation: text("attestation").notNull(),
  // Existing approvals remain certificate-only; a package requires a new staff decision.
  releaseScope: text("release_scope").notNull().default("certificate"),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by"),
  decisionNote: text("decision_note"),
  releaseDeliveryStatus: text("release_delivery_status").notNull().default("pending"),
  releaseSentAt: timestamp("release_sent_at"),
  releaseLastErrorCategory: text("release_last_error_category"),
}, (table) => [
  index("certificate_access_requests_company_status_idx").on(table.companyId, table.status),
  index("certificate_access_requests_notice_idx").on(table.noticeId),
  uniqueIndex("certificate_access_requests_active_requester_idx")
    .on(table.noticeId, table.requesterUserId)
    .where(sql`${table.status} in ('pending', 'approved')`),
]);

export const certificateReleaseGrants = pgTable("certificate_release_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessRequestId: varchar("access_request_id").notNull().references(() => certificateAccessRequests.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const companyNotificationAuditEvents = pgTable("company_notification_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  noticeId: varchar("notice_id"),
  accessRequestId: varchar("access_request_id"),
  actorUserId: varchar("actor_user_id"),
  actorRole: text("actor_role"),
  eventType: text("event_type").notNull(),
  ipHash: varchar("ip_hash", { length: 64 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("company_notification_audit_notice_idx").on(table.noticeId, table.createdAt),
  index("company_notification_audit_company_idx").on(table.companyId, table.createdAt),
]);

export const companyDirectoryStatusSchema = z.enum(["active", "inactive"]);
export const companyMembershipStatusSchema = z.enum(["pending", "approved", "rejected", "revoked"]);
export const companyNoticeStatusSchema = z.enum(["draft", "sending", "sent", "acknowledged", "revoked"]);
export const certificateAccessRequestStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export const createCompanyDirectorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  category: z.enum(ACCOUNT_CATEGORIES),
  officialDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/),
  notificationEmail: z.string().email().max(320).nullable().optional(),
  website: z.string().url().max(2000).nullable().optional(),
  isNational: z.boolean().default(true),
  status: companyDirectoryStatusSchema.default("active"),
  source: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const companyMembershipRequestSchema = z.object({ companyId: z.string().uuid() });
export const createCompanyNoticeSchema = z.object({
  accountId: z.string().uuid(),
  companyId: z.string().uuid(),
});
export const certificateAccessRequestSchema = z.object({
  purpose: z.string().trim().min(10).max(1000),
  attestation: z.string().trim().min(10).max(2000),
  releaseScope: z.enum(["certificate", "package"]).default("certificate"),
});
export const accessDecisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().trim().max(1000).optional(),
});

export const marketplaceProviderStatusEnum = pgEnum("marketplace_provider_status", [
  "draft",
  "review",
  "approved",
  "suspended",
  "archived",
]);
export const beneficiaryTypeEnum = pgEnum("beneficiary_type", [
  "spouse",
  "child",
  "dependent",
  "other"
]);

export const beneficiaryStatusEnum = pgEnum("beneficiary_status", [
  "identified",
  "verified",
  "benefits_pending",
  "benefits_active",
  "benefits_denied"
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show"
]);

export const governmentAgencyEnum = pgEnum("government_agency", [
  "ssa",
  "va",
  "medicare",
  "medicaid",
  "irs",
  "state_benefits",
  "other"
]);

export const beneficiaries = pgTable("beneficiaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  fullName: text("full_name").notNull(),
  relationship: beneficiaryTypeEnum("relationship").notNull(),
  dateOfBirth: text("date_of_birth"),
  ssn: text("ssn"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  isMinor: boolean("is_minor").notNull().default(false),
  guardianName: text("guardian_name"),
  status: beneficiaryStatusEnum("status").notNull().default("identified"),
  eligibleBenefits: text("eligible_benefits").array(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  beneficiaryId: varchar("beneficiary_id").references(() => beneficiaries.id),
  agency: governmentAgencyEnum("agency").notNull(),
  appointmentType: text("appointment_type").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  location: text("location"),
  isVirtual: boolean("is_virtual").notNull().default(false),
  meetingLink: text("meeting_link"),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  confirmationNumber: text("confirmation_number"),
  notes: text("notes"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const governmentNotifications = pgTable("government_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  agency: governmentAgencyEnum("agency").notNull(),
  notificationType: text("notification_type").notNull(),
  status: taskCompletionStatusEnum("status").notNull().default("pending"),
  referenceNumber: text("reference_number"),
  responseMessage: text("response_message"),
  benefitsAffected: text("benefits_affected").array(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export const estateDocumentTypeEnum = pgEnum("estate_document_type", [
  "will",
  "trust",
  "estate",
  "power_of_attorney",
  "healthcare_directive",
  "other"
]);

export const estateStatusEnum = pgEnum("estate_status", [
  "active",
  "probate",
  "settled",
  "revoked",
  "expired"
]);

export const nerAnalysisStatusEnum = pgEnum("ner_analysis_status", [
  "pending",
  "processing",
  "completed",
  "failed"
]);

export const estateRegistry = pgTable("estate_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentType: estateDocumentTypeEnum("document_type").notNull(),
  principalName: text("principal_name").notNull(),
  principalDob: text("principal_dob"),
  principalSsn: text("principal_ssn"),
  documentNumber: text("document_number").notNull().unique(),
  filingDate: timestamp("filing_date").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  courtName: text("court_name"),
  caseNumber: text("case_number"),
  status: estateStatusEnum("status").notNull().default("active"),
  executorName: text("executor_name"),
  executorContact: text("executor_contact"),
  attorneyName: text("attorney_name"),
  attorneyContact: text("attorney_contact"),
  estimatedValue: text("estimated_value"),
  beneficiaryNames: text("beneficiary_names").array(),
  assetTypes: text("asset_types").array(),
  notes: text("notes"),
  blockchainHash: text("blockchain_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const nerAnalysis = pgTable("ner_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  status: nerAnalysisStatusEnum("status").notNull().default("pending"),
  extractedEntities: text("extracted_entities"),
  matchedEstates: text("matched_estates").array(),
  matchConfidence: text("match_confidence"),
  analysisDetails: text("analysis_details"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const creditProtectionStatusEnum = pgEnum("credit_protection_status", [
  "pending_approval",
  "approved",
  "in_progress",
  "submitted",
  "completed",
  "rejected"
]);

export const creditProtectionRequests = pgTable("credit_protection_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  bureau: text("bureau").notNull(),
  status: creditProtectionStatusEnum("status").notNull().default("pending_approval"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  externalReference: text("external_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Mail Service Request Types: usps_mail_stop, dnc_marketing
export const mailServiceTypeEnum = pgEnum("mail_service_type", [
  "usps_mail_stop",
  "dnc_marketing"
]);

export const mailServiceStatusEnum = pgEnum("mail_service_status", [
  "pending",
  "submitted",
  "processing",
  "completed",
  "rejected"
]);

export const mailServiceRequests = pgTable("mail_service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  serviceType: mailServiceTypeEnum("service_type").notNull(),
  status: mailServiceStatusEnum("status").notNull().default("pending"),
  deceasedAddress: text("deceased_address"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  externalReference: text("external_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const creditPullStatusEnum = pgEnum("credit_pull_status", [
  "pending",
  "processing",
  "completed",
  "failed"
]);

export const creditPulls = pgTable("credit_pulls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  bureau: text("bureau").notNull(),
  status: creditPullStatusEnum("status").notNull().default("pending"),
  totalAccountsFound: text("total_accounts_found"),
  totalImported: text("total_imported"),
  pullDate: timestamp("pull_date"),
  externalReference: text("external_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const creditPullResults = pgTable("credit_pull_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditPullId: varchar("credit_pull_id").notNull().references(() => creditPulls.id),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  accountName: text("account_name").notNull(),
  accountType: text("account_type").notNull(),
  category: text("category").notNull(),
  accountNumber: text("account_number"),
  balance: text("balance"),
  monthlyPayment: text("monthly_payment"),
  accountStatus: text("account_status"),
  dateOpened: text("date_opened"),
  lastActivity: text("last_activity"),
  isImported: boolean("is_imported").notNull().default(false),
  importedAccountId: varchar("imported_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lifeInsurancePolicies = pgTable("life_insurance_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  provider: text("provider").notNull(),
  policyNumber: text("policy_number"),
  policyType: text("policy_type"),
  faceValue: text("face_value"),
  beneficiaryName: text("beneficiary_name"),
  beneficiaryRelationship: text("beneficiary_relationship"),
  status: text("status").notNull().default("discovered"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  claimFiledAt: timestamp("claim_filed_at"),
  claimNumber: text("claim_number"),
});

export const caseMessages = pgTable("case_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  accountId: varchar("account_id").references(() => connectedAccounts.id),
  blockchainId: text("blockchain_id").notNull(),
  senderType: text("sender_type").notNull(),
  senderName: text("sender_name"),
  recipientName: text("recipient_name"),
  subject: text("subject"),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isSecure: boolean("is_secure").notNull().default(true),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});

export const nearestRelatives = pgTable("nearest_relatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  fullName: text("full_name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  age: text("age"),
  dataSource: text("data_source").notNull().default("public_records"),
  confidence: text("confidence"),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
});

export type NearestRelative = typeof nearestRelatives.$inferSelect;
export type InsertNearestRelative = typeof nearestRelatives.$inferInsert;

export const insertCertificateSchema = createInsertSchema(certificates).omit({
  id: true,
  submittedAt: true,
  verifiedAt: true,
  blockchainHash: true,
});

export const insertConnectedAccountSchema = createInsertSchema(connectedAccounts).omit({
  id: true,
  actionDate: true,
  notificationSentAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  sentAt: true,
  readAt: true,
});

export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type Certificate = typeof certificates.$inferSelect;

export type InsertConnectedAccount = z.infer<typeof insertConnectedAccountSchema>;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;

export type ServiceProvider = typeof serviceProviders.$inferSelect;
export type InsertServiceProvider = typeof serviceProviders.$inferInsert;

export type Beneficiary = typeof beneficiaries.$inferSelect;
export type InsertBeneficiary = typeof beneficiaries.$inferInsert;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

export type GovernmentNotification = typeof governmentNotifications.$inferSelect;
export type InsertGovernmentNotification = typeof governmentNotifications.$inferInsert;

export type EstateRegistry = typeof estateRegistry.$inferSelect;
export type InsertEstateRegistry = typeof estateRegistry.$inferInsert;

export type NerAnalysis = typeof nerAnalysis.$inferSelect;
export type InsertNerAnalysis = typeof nerAnalysis.$inferInsert;

export type CreditProtectionRequest = typeof creditProtectionRequests.$inferSelect;
export type InsertCreditProtectionRequest = typeof creditProtectionRequests.$inferInsert;

export type MailServiceRequest = typeof mailServiceRequests.$inferSelect;
export type InsertMailServiceRequest = typeof mailServiceRequests.$inferInsert;

export type CreditPull = typeof creditPulls.$inferSelect;
export type InsertCreditPull = typeof creditPulls.$inferInsert;

export type CreditPullResult = typeof creditPullResults.$inferSelect;
export type InsertCreditPullResult = typeof creditPullResults.$inferInsert;

export type LifeInsurancePolicy = typeof lifeInsurancePolicies.$inferSelect;
export type InsertLifeInsurancePolicy = typeof lifeInsurancePolicies.$inferInsert;

export type CaseMessage = typeof caseMessages.$inferSelect;
export type InsertCaseMessage = typeof caseMessages.$inferInsert;

export type CreditPullStatus = "pending" | "processing" | "completed" | "failed";
export type MailServiceType = "usps_mail_stop" | "dnc_marketing";
export type MailServiceStatus = "pending" | "submitted" | "processing" | "completed" | "rejected";

export type CertificateStatus = "pending" | "verified" | "processing" | "completed";
export type AccountStatus = "active" | "pending_action" | "suspended" | "closed";
export type AccountAction = "close" | "suspend" | "continue";
export type TaskCompletionStatus = "pending" | "successful" | "not_completed" | "unsuccessful" | "not_applicable";
export type WebhookStatus = "pending" | "sent" | "delivered" | "failed";
export type BeneficiaryType = "spouse" | "child" | "dependent" | "other";
export type BeneficiaryStatus = "identified" | "verified" | "benefits_pending" | "benefits_active" | "benefits_denied";
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
export type GovernmentAgency = "ssa" | "va" | "medicare" | "medicaid" | "irs" | "state_benefits" | "other";
export type EstateDocumentType = "will" | "trust" | "estate" | "power_of_attorney" | "healthcare_directive" | "other";
export type EstateStatus = "active" | "probate" | "settled" | "revoked" | "expired";
export type NerAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export const familyInvitations = pgTable("family_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id),
  email: text("email").notNull(),
  phoneNumber: text("phone_number"),
  recipientName: text("recipient_name").notNull(),
  // The deceased person's relationship to the recipient (not the inverse NOK relationship).
  deceasedRelationshipToRecipient: text("deceased_relationship_to_recipient"),
  deceasedName: text("deceased_name").notNull(),
  // Legacy plaintext tokens remain nullable only for the bounded compatibility
  // window while already-sent invitations expire.
  token: text("token").unique(),
  tokenHash: text("token_hash").unique(),
  status: text("status").notNull().default("pending"),
  emailSent: boolean("email_sent").default(false),
  smsSent: boolean("sms_sent").default(false),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  sentBy: varchar("sent_by"),
  sharingAuthorizedBy: varchar("sharing_authorized_by").references(() => users.id, { onDelete: "set null" }),
  sharingOwnerSignature: text("sharing_owner_signature"),
  sharingAgreementVersion: text("sharing_agreement_version"),
  sharingAgreementText: text("sharing_agreement_text"),
  sharingScope: text("sharing_scope"),
  sharingSignedAt: timestamp("sharing_signed_at"),
});

export type FamilyInvitation = typeof familyInvitations.$inferSelect;
export type InsertFamilyInvitation = typeof familyInvitations.$inferInsert;

// A certificate may be shared by multiple verified family accounts.  The
// certificate.userId column remains the canonical owner for backwards
// compatibility; this table is the source of truth for additional access.
export const caseFamilyMembershipRoleEnum = pgEnum("case_family_membership_role", [
  "owner",
  "member",
]);
export const caseFamilyMembershipStatusEnum = pgEnum("case_family_membership_status", [
  "active",
  "revoked",
]);

export const caseFamilyMemberships = pgTable("case_family_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: caseFamilyMembershipRoleEnum("role").notNull().default("member"),
  status: caseFamilyMembershipStatusEnum("status").notNull().default("active"),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: "set null" }),
  invitationId: varchar("invitation_id").references(() => familyInvitations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("case_family_memberships_user_idx").on(table.userId, table.status),
  index("case_family_memberships_certificate_idx").on(table.certificateId, table.status),
  uniqueIndex("case_family_memberships_case_user_unique").on(table.certificateId, table.userId),
]);

export type CaseFamilyMembership = typeof caseFamilyMemberships.$inferSelect;
export type InsertCaseFamilyMembership = typeof caseFamilyMemberships.$inferInsert;

// Signed sharing is separate from estate/LPOA authority. Missing records deny
// additional-member access, including memberships created before this policy.
export const caseFamilyAuthorizations = pgTable("case_family_authorizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  membershipId: varchar("membership_id").notNull().references(() => caseFamilyMemberships.id, { onDelete: "cascade" }),
  authorizedBy: varchar("authorized_by").references(() => users.id, { onDelete: "set null" }),
  ownerSignature: text("owner_signature").notNull(),
  agreementVersion: text("agreement_version").notNull(),
  agreementText: text("agreement_text").notNull(),
  scope: text("scope").notNull(),
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
  memberSignature: text("member_signature"),
  memberAcceptedAt: timestamp("member_accepted_at"),
  reviewStatus: text("review_status").notNull().default("not_requested"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewReason: text("review_reason"),
  // Exclusive end instant: authority is invalid at and after this timestamp.
  authorityExpiresAt: timestamp("authority_expires_at", { withTimezone: true }),
  evidenceDocumentId: varchar("evidence_document_id").references(() => familyDocuments.id, { onDelete: "set null" }),
}, (table) => [
  index("case_family_authorizations_membership_idx").on(table.membershipId),
  uniqueIndex("case_family_authorizations_active_unique").on(table.membershipId).where(sql`${table.revokedAt} IS NULL`),
]);

export type CaseFamilyAuthorization = typeof caseFamilyAuthorizations.$inferSelect;

// One-time proof for an invitation. This is intentionally separate from a
// user's normal email verification state.
export const familyInvitationChallenges = pgTable("family_invitation_challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invitationId: varchar("invitation_id").notNull().references(() => familyInvitations.id, { onDelete: "cascade" }),
  accountCreated: boolean("account_created").notNull().default(false),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("family_invitation_challenges_invitation_idx").on(table.invitationId, table.consumedAt),
  index("family_invitation_challenges_email_idx").on(table.email, table.expiresAt),
]);
export type FamilyInvitationChallenge = typeof familyInvitationChallenges.$inferSelect;
export type InsertFamilyInvitationChallenge = typeof familyInvitationChallenges.$inferInsert;

export const lpoaDocuments = pgTable("lpoa_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  certificateId: varchar("certificate_id").references(() => certificates.id),
  principalName: text("principal_name").notNull(),
  principalAddress: text("principal_address").notNull(),
  signatureType: text("signature_type").notNull(),
  signatureData: text("signature_data").notNull(),
  consentAgreed: boolean("consent_agreed").notNull().default(false),
  identitySource: text("identity_source").notNull().default("stripe_verified"),
  identityFallbackReason: text("identity_fallback_reason"),
  identityAttestedAt: timestamp("identity_attested_at"),
  validUntil: text("valid_until").notNull(),
  agreementVersion: text("agreement_version").notNull().default(LEGACY_LPOA_AGREEMENT_VERSION),
  agreementSnapshot: text("agreement_snapshot").notNull().default(serializeLpoaAgreement(LEGACY_LPOA_AGREEMENT)),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("active"),
  supersedesDocumentId: varchar("supersedes_document_id"),
  supersededByDocumentId: varchar("superseded_by_document_id"),
  replacementRequestedAt: timestamp("replacement_requested_at"),
  replacementRequestedBy: varchar("replacement_requested_by"),
  replacementReason: text("replacement_reason"),
  supersededAt: timestamp("superseded_at"),
  signedAt: timestamp("signed_at").notNull().defaultNow(),
});

export const insertLpoaDocumentSchema = createInsertSchema(lpoaDocuments).omit({
  id: true,
  signedAt: true,
});

export type LpoaDocument = typeof lpoaDocuments.$inferSelect;
export type InsertLpoaDocument = z.infer<typeof insertLpoaDocumentSchema>;

export const caseIdentityReviews = pgTable("case_identity_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  status: text("status").notNull().default("approved"),
  reason: text("reason").notNull(),
  reviewedBy: varchar("reviewed_by").notNull(),
  reviewedByName: text("reviewed_by_name").notNull(),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});

export const insertCaseIdentityReviewSchema = createInsertSchema(caseIdentityReviews).omit({
  id: true,
  reviewedAt: true,
});
export type CaseIdentityReview = typeof caseIdentityReviews.$inferSelect;
export type InsertCaseIdentityReview = z.infer<typeof insertCaseIdentityReviewSchema>;

export const lpoaRequests = pgTable("lpoa_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  requestedBy: varchar("requested_by").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at"),
  sendAttemptCount: integer("send_attempt_count").notNull().default(0),
  emailSent: boolean("email_sent").notNull().default(false),
  smsSent: boolean("sms_sent").notNull().default(false),
  inAppSent: boolean("in_app_sent").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedByDocumentId: varchar("completed_by_document_id"),
});

export const insertLpoaRequestSchema = createInsertSchema(lpoaRequests).omit({
  id: true,
  requestedAt: true,
});
export type LpoaRequest = typeof lpoaRequests.$inferSelect;
export type InsertLpoaRequest = z.infer<typeof insertLpoaRequestSchema>;

export const salNotifications = pgTable("sal_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: varchar("type", { length: 50 }).notNull(),
  userEmail: varchar("user_email", { length: 255 }),
  userName: varchar("user_name", { length: 255 }),
  caseId: varchar("case_id"),
  deceasedName: varchar("deceased_name", { length: 255 }),
  payload: text("payload"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalNotificationSchema = createInsertSchema(salNotifications).omit({ createdAt: true });
export type SalNotification = typeof salNotifications.$inferSelect;
export type InsertSalNotification = z.infer<typeof insertSalNotificationSchema>;

export const smsMessages = pgTable("sms_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  phoneNumber: text("phone_number").notNull(),
  contactName: text("contact_name"),
  direction: text("direction").notNull().default("outbound"),
  body: text("body").notNull(),
  certificateId: varchar("certificate_id"),
  adminUserId: varchar("admin_user_id"),
  adminName: text("admin_name"),
  status: text("status").notNull().default("sent"),
  ringcentralMessageId: text("ringcentral_message_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmsMessageSchema = createInsertSchema(smsMessages).omit({ createdAt: true });
export type SmsMessage = typeof smsMessages.$inferSelect;
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;

export const CASE_TASK_KEYS = [
  "case_created",
  "certificate_uploaded",
  "verified_blockchain",
  "accounts_added",
  "notifications_sent",
  "gov_agencies_notified",
  "credit_protection",
  "insurance_benefits",
  "case_complete",
] as const;

export const CASE_TASK_LABELS: Record<string, string> = {
  case_created: "Case Created",
  certificate_uploaded: "Certificate Uploaded",
  verified_blockchain: "Verified & Blockchain ID",
  accounts_added: "Accounts Added",
  notifications_sent: "Notifications Sent",
  gov_agencies_notified: "Gov Agencies Notified",
  credit_protection: "Credit Protection",
  insurance_benefits: "Insurance & Benefits",
  case_complete: "Case Complete",
};

export const caseTasks = pgTable("case_tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  taskKey: text("task_key").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  completedByName: text("completed_by_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("case_tasks_certificate_task_unique").on(table.certificateId, table.taskKey),
]);

export const insertCaseTaskSchema = createInsertSchema(caseTasks).omit({ createdAt: true });
export type CaseTask = typeof caseTasks.$inferSelect;

// Documents uploaded by family members (e.g., driver's license, additional ID)
// Case timeline / audit trail — chronological record of all actions on a case
export const caseEvents = pgTable("case_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id"),
  actorName: text("actor_name"),
  actorRole: text("actor_role").notNull().default("system"),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCaseEventSchema = createInsertSchema(caseEvents).omit({ id: true, createdAt: true });
export type CaseEvent = typeof caseEvents.$inferSelect;
export type InsertCaseEvent = typeof caseEvents.$inferInsert;

// Attorney coordination is case-scoped and separate from partner referral attribution.
export const estateReferrals = pgTable("estate_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().unique().references(() => certificates.id, { onDelete: "cascade" }),
  reference: text("reference").notNull().unique(),
  version: integer("version").notNull().default(1),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("needed"),
  attorneyName: text("attorney_name").notNull().default(""),
  attorneyFirm: text("attorney_firm").notNull().default(""),
  attorneyEmail: text("attorney_email").notNull().default(""),
  attorneyPhone: text("attorney_phone").notNull().default(""),
  referredAt: timestamp("referred_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  permissionConfirmedAt: timestamp("permission_confirmed_at"),
  permissionConfirmedBy: varchar("permission_confirmed_by"),
  resolutionSummary: text("resolution_summary").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").notNull(),
});
export const estateReferralUpdates = pgTable("estate_referral_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralId: varchar("referral_id").notNull().references(() => estateReferrals.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  summary: text("summary").notNull(),
  reportedAt: timestamp("reported_at").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  recordedBy: varchar("recorded_by").notNull(),
});
export const estateReferralRequests = pgTable("estate_referral_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralId: varchar("referral_id").notNull().references(() => estateReferrals.id, { onDelete: "cascade" }),
  referralVersion: integer("referral_version").notNull(),
  recipientKind: text("recipient_kind").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").notNull(),
  attemptedAt: timestamp("attempted_at"),
  submittedAt: timestamp("submitted_at"),
});

// A request, provider result, and family-reported external search are different evidence.
export const nerSearchChecks = pgTable("ner_search_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").references(() => certificates.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  searcherName: text("searcher_name").notNull(),
  searchedName: text("searched_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  yearOfBirth: text("year_of_birth"),
  zipCode: text("zip_code"),
  maidenName: text("maiden_name"),
  source: text("source").notNull(),
  outcome: text("outcome").notNull(),
  resultCount: integer("result_count"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  reportedAt: timestamp("reported_at"),
  reportedOutcome: text("reported_outcome"),
  reportNotes: text("report_notes"),
}, table => [
  index("ner_search_checks_case_date_idx").on(table.certificateId, table.requestedAt),
  index("ner_search_checks_actor_date_idx").on(table.actorId, table.requestedAt),
]);

export const familyDocuments = pgTable("family_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  certificateId: varchar("certificate_id").references(() => certificates.id),
  label: text("label").notNull(),
  documentType: text("document_type").notNull().default("other"),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  uploadedByRole: text("uploaded_by_role").notNull().default("user"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Staff organization only: linking a file never approves it or authorizes release.
// A statement may support multiple accounts, without duplicating the private file.
export const documentAccountLinks = pgTable("document_account_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => familyDocuments.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, table => [
  uniqueIndex("document_account_links_document_account_idx").on(table.documentId, table.accountId),
  index("document_account_links_account_idx").on(table.accountId),
]);

// Created atomically with new case-linked family uploads; historical files are not "new".
export const familyDocumentNotices = pgTable("family_document_notices", {
  documentId: varchar("document_id").primaryKey().references(() => familyDocuments.id, { onDelete: "cascade" }),
  certificateId: varchar("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  seenAt: timestamp("seen_at"),
  seenBy: varchar("seen_by"),
}, table => [
  index("family_document_notices_unseen_case_idx").on(table.certificateId, table.seenAt, table.createdAt),
]);

// AI/OCR never writes directly to connected_accounts. It first creates a
// reviewable analysis and normalized suggestions owned by the source document.
export const familyDocumentAnalyses = pgTable("family_document_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => familyDocuments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  certificateId: varchar("certificate_id").references(() => certificates.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const familyDocumentSuggestions = pgTable("family_document_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: varchar("analysis_id").notNull().references(() => familyDocumentAnalyses.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").notNull().references(() => familyDocuments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  certificateId: varchar("certificate_id").references(() => certificates.id, { onDelete: "cascade" }),
  merchantName: text("merchant_name").notNull(),
  description: text("description").notNull().default("Recurring payment"),
  amountCents: integer("amount_cents"),
  frequency: text("frequency"),
  confidence: text("confidence"),
  category: text("category").notNull().default("miscellaneous"),
  recommendedAction: text("recommended_action").notNull().default("review"),
  status: text("status").notNull().default("pending"),
  connectedAccountId: varchar("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFamilyDocumentSchema = createInsertSchema(familyDocuments).omit({
  id: true,
  uploadedAt: true,
}).extend({
  documentType: z.enum([
    "death_certificate",
    "identification",
    "will_trust",
    "insurance_policy",
    "power_of_attorney",
    "financial_statement",
    "utility_bill",
    "other",
  ]).default("other"),
});

export const FAMILY_DOCUMENT_TYPES = [
  { value: "death_certificate", label: "Death Certificate" },
  { value: "identification", label: "ID / Driver's License" },
  { value: "will_trust", label: "Will / Trust" },
  { value: "insurance_policy", label: "Insurance Policy" },
  { value: "power_of_attorney", label: "Power of Attorney" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "utility_bill", label: "Utility Bill" },
  { value: "other", label: "Other" },
] as const;

export type FamilyDocument = typeof familyDocuments.$inferSelect;
export type InsertFamilyDocument = z.infer<typeof insertFamilyDocumentSchema>;
export type FamilyDocumentAnalysis = typeof familyDocumentAnalyses.$inferSelect;
export type FamilyDocumentSuggestion = typeof familyDocumentSuggestions.$inferSelect;

export type HeartPlanIntake = typeof heartPlanIntakes.$inferSelect;
export type InsertCaseTask = z.infer<typeof insertCaseTaskSchema>;

// HeartPlan (pre-death planning)
// A HeartPlan belongs to a "planner" user and is completely separate from the
// certificate-centric case tables. The only link to a case is created when a
// concierge activates the plan after the planner passes away.

export const heartPlanStatusEnum = pgEnum("heart_plan_status", [
  "active",     // Planner is alive and maintaining the plan
  "activated",  // Death activation done — converted into a case
]);

export const homeOccupancyStatusEnum = pgEnum("home_occupancy_status", [
  "owns_home",
  "rents_home",
  "lives_with_family_or_others",
  "prefer_not_to_say_or_not_sure",
]);

export const heartPlans = pgTable("heart_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  status: heartPlanStatusEnum("status").notNull().default("active"),
  // Pricing tier — "free" or a paid tier (e.g. "legacy"), upgraded via Stripe Checkout
  tier: text("tier").notNull().default("free"),
  // Stripe upgrade tracking — set when the planner starts/completes a paid upgrade
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  upgradedAt: timestamp("upgraded_at"),
  // Planner profile (becomes the deceased info at activation)
  fullName: text("full_name"),
  dateOfBirth: text("date_of_birth"),
  phone: text("phone"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  homeOccupancyStatus: homeOccupancyStatusEnum("home_occupancy_status"),
  hasVehicles: boolean("has_vehicles"),
  // Activation link — only set when a concierge activates the plan
  certificateId: varchar("certificate_id").references(() => certificates.id),
  activatedAt: timestamp("activated_at"),
  activatedBy: varchar("activated_by"),
  activatedByName: text("activated_by_name"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastReviewedBy: varchar("last_reviewed_by"),
  lastReviewedByName: text("last_reviewed_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ORSA Legacy extensions are separate from the perpetual $149 HeartPlan tier.
// Purchases are kept as a ledger so fulfillment is idempotent and auditable.
export const orsaLegacyEntitlements = pgTable("orsa_legacy_entitlements", {
  userId: varchar("user_id").primaryKey(),
  paidThrough: timestamp("paid_through"),
  pendingCheckoutSessionId: text("pending_checkout_session_id"),
  pendingCheckoutExpiresAt: timestamp("pending_checkout_expires_at"),
  checkoutAttempt: integer("checkout_attempt").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orsaLegacyPurchases = pgTable("orsa_legacy_purchases", {
  checkoutSessionId: text("checkout_session_id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  purchasedAt: timestamp("purchased_at").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("orsa_legacy_purchases_user_idx").on(table.userId),
}));

// ORSA membership and billing
// ORSA eligibility deliberately lives outside certificates.  A certificate
// referral is user-entered case history and must never grant account benefits.
export const orsaRosterMembers = pgTable("orsa_roster_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalizedEmail: varchar("normalized_email", { length: 320 }).unique(),
  // A confirmed shared address grants one verified login ORSA eligibility,
  // but never identifies either individual member or their private data.
  sharedEligibilityEmail: varchar("shared_eligibility_email", { length: 320 }),
  normalizedPhone: varchar("normalized_phone", { length: 64 }),
  externalMemberId: varchar("external_member_id", { length: 255 }).unique(),
  contactKey: text("contact_key").unique(),
  displayName: text("display_name"),
  active: boolean("active").notNull().default(true),
  invitationStatus: text("invitation_status").notNull().default("pending"),
  invitationFirstAttemptAt: timestamp("invitation_first_attempt_at"),
  invitationAttemptedAt: timestamp("invitation_attempted_at"),
  invitationSentAt: timestamp("invitation_sent_at"),
  invitationAcceptedAt: timestamp("invitation_accepted_at"),
  invitationAcceptedUserId: varchar("invitation_accepted_user_id"),
  invitationLeaseId: varchar("invitation_lease_id"),
  invitationLeaseExpiresAt: timestamp("invitation_lease_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at"),
});

// Phone-scoped suppression and one-time ORSA outreach. Never inferred from a
// roster import; consent must be documented separately by an administrator.
export const orsaBulkSmsRuns = pgTable("orsa_bulk_sms_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("draft"),
  message: text("message").notNull(),
  attestation: text("attestation").notNull(),
  createdBy: varchar("created_by").notNull(),
  approvedBy: varchar("approved_by"),
  timezone: text("timezone").notNull(),
  intervalSeconds: integer("interval_seconds").notNull().default(10),
  dailyLimit: integer("daily_limit").notNull().default(1000),
  scheduledAt: timestamp("scheduled_at").notNull(),
  nextAttemptAt: timestamp("next_attempt_at"),
  dayKey: text("day_key"),
  dayAttempts: integer("day_attempts").notNull().default(0),
  pauseReason: text("pause_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [index("orsa_bulk_sms_runs_status_idx").on(table.status)]);

export const orsaBulkSmsRecipients = pgTable("orsa_bulk_sms_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => orsaBulkSmsRuns.id, { onDelete: "cascade" }),
  memberId: varchar("member_id").notNull(),
  displayName: text("display_name"),
  phone: varchar("phone", { length: 20 }).notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  attemptedAt: timestamp("attempted_at"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  uniqueIndex("orsa_bulk_sms_recipients_run_phone_unique").on(table.runId, table.phone),
  index("orsa_bulk_sms_recipients_pending_idx").on(table.runId, table.status),
]);

export const orsaSmsCampaign = pgTable("orsa_sms_campaign", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  memberId: varchar("member_id"),
  consentEvidence: text("consent_evidence"),
  consentRecordedBy: varchar("consent_recorded_by"),
  consentRecordedAt: timestamp("consent_recorded_at"),
  optedOutAt: timestamp("opted_out_at"),
  status: text("status").notNull().default("not_sent"),
  attemptedAt: timestamp("attempted_at"),
  submittedAt: timestamp("submitted_at"),
  sentBy: varchar("sent_by"),
  providerMessageId: text("provider_message_id").unique(),
  deliveryStatus: text("delivery_status"),
});

// Member marketing suppression and per-template delivery state are separate
// from invitation history. Unique delivery claims make concurrent batches safe.
export const orsaEmailCampaignContacts = pgTable("orsa_email_campaign_contacts", {
  normalizedEmail: varchar("normalized_email", { length: 320 }).primaryKey(),
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull().unique(),
  optedOutAt: timestamp("opted_out_at"),
  optedOutBy: varchar("opted_out_by"),
});

export const orsaEmailCampaignDeliveries = pgTable("orsa_email_campaign_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull(),
  normalizedEmail: varchar("normalized_email", { length: 320 }).notNull(),
  templateId: varchar("template_id", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(), // sending | sent | needs_review
  attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  sentBy: varchar("sent_by"),
  trackingTokenHash: varchar("tracking_token_hash", { length: 64 }).unique(),
  firstOpenedAt: timestamp("first_opened_at"),
  firstClickedAt: timestamp("first_clicked_at"),
}, (table) => ({
  oneDeliveryPerTemplate: uniqueIndex("orsa_email_campaign_delivery_once_idx").on(table.memberId, table.templateId),
  oneDeliveryPerEmailTemplate: uniqueIndex("orsa_email_campaign_email_template_once_idx").on(table.normalizedEmail, table.templateId),
  emailIdx: index("orsa_email_campaign_delivery_email_idx").on(table.normalizedEmail),
}));

export const orsaEmailCampaignPreviews = pgTable("orsa_email_campaign_previews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  templateId: varchar("template_id", { length: 100 }).notNull(),
  recipientSnapshot: jsonb("recipient_snapshot").$type<Array<{ id: string; email: string }>>().notNull(),
  expectedCount: integer("expected_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const orsaEmailCampaignRuns = pgTable("orsa_email_campaign_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  previewId: varchar("preview_id").notNull().unique(),
  adminUserId: varchar("admin_user_id").notNull(),
  templateId: varchar("template_id", { length: 100 }).notNull(),
  recipientSnapshot: jsonb("recipient_snapshot").$type<Array<{ id: string; email: string }>>().notNull(),
  expectedCount: integer("expected_count").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("confirmed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const orsaEmailCampaignCompliance = pgTable("orsa_email_campaign_compliance", {
  id: varchar("id", { length: 32 }).primaryKey(),
  optoutsReviewedAt: timestamp("optouts_reviewed_at"),
  optoutsReviewedBy: varchar("optouts_reviewed_by"),
});

// Global, persisted pacing shared by every ORSA outreach path and admin tab.
export const orsaEmailWarmupSettings = pgTable("orsa_email_warmup_settings", {
  id: varchar("id", { length: 32 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(true),
  dailyReviewRequired: boolean("daily_review_required").notNull().default(false),
  hourlyLimit: integer("hourly_limit").notNull().default(10),
  dailyLimit: integer("daily_limit").notNull().default(25),
  minIntervalSeconds: integer("min_interval_seconds").notNull().default(360),
  providerHourlyLimit: integer("provider_hourly_limit").notNull().default(20),
  reservedHourly: integer("reserved_hourly").notNull().default(10),
  pauseReason: text("pause_reason"),
  nextSendAt: timestamp("next_send_at"),
  reviewedBy: varchar("reviewed_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// No copied recipient addresses or tracking tokens. Failed/unused reservations
// consume capacity conservatively; they are never automatically retried.
export const orsaEmailWarmupAttempts = pgTable("orsa_email_warmup_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(), // outreach | other
  scope: varchar("scope", { length: 32 }).notNull().default("orsa"),
  templateId: text("template_id"),
  actorUserId: varchar("actor_user_id"),
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [index("orsa_warmup_attempts_created_idx").on(table.scope, table.createdAt)]);

// An append-only account of administrative roster operations.  It intentionally
// contains no copied roster values or case/HeartPlan data.
export const orsaRosterAudits = pgTable("orsa_roster_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").notNull(),
  action: text("action").notNull(), // replace | upsert | active_changed
  affectedCount: integer("affected_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const householdStatusEnum = pgEnum("household_member_status", [
  "invited",
  "active",
  "removed",
]);

export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primaryUserId: varchar("primary_user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionItemId: text("stripe_subscription_item_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  stripeCancelAtPeriodEnd: boolean("stripe_cancel_at_period_end").notNull().default(false),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
  lastPaymentFailureAt: timestamp("last_payment_failure_at"),
  lastPaymentFailureMessage: text("last_payment_failure_message"),
  pendingCheckoutSessionId: text("pending_checkout_session_id"),
  pendingCheckoutExpiresAt: timestamp("pending_checkout_expires_at"),
  stripeBillingEventAt: timestamp("stripe_billing_event_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// This is not case familyInvitations.  It models paid membership seats and is
// retained after removal for auditability.
export const householdMembers = pgTable("household_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull().references(() => households.id),
  userId: varchar("user_id"),
  normalizedEmail: varchar("normalized_email", { length: 320 }).notNull(),
  displayName: text("display_name"),
  status: householdStatusEnum("status").notNull().default("invited"),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
  removedAt: timestamp("removed_at"),
}, (table) => [
  index("household_members_household_status_idx").on(table.householdId, table.status),
  uniqueIndex("household_members_household_email_idx").on(table.householdId, table.normalizedEmail),
  uniqueIndex("household_members_active_email_unique").on(table.normalizedEmail)
    .where(sql`${table.status} = 'active'`),
  uniqueIndex("household_members_active_user_unique").on(table.userId)
    .where(sql`${table.status} = 'active' and ${table.userId} is not null`),
]);

// Stripe mutations are deliberately represented before the provider call.
// Pending rows are reconciliation work: retries use the same operation id as
// Stripe's idempotency key, so a provider success can never be duplicated.
export const householdBillingOperations = pgTable("household_billing_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull().references(() => households.id),
  memberId: varchar("member_id").notNull().references(() => householdMembers.id),
  targetStatus: householdStatusEnum("target_status").notNull(),
  targetQuantity: integer("target_quantity"),
  checkoutSessionId: varchar("checkout_session_id", { length: 255 }),
  checkoutExpiresAt: timestamp("checkout_expires_at"),
  checkoutSuccessUrl: text("checkout_success_url"),
  checkoutCancelUrl: text("checkout_cancel_url"),
  status: text("status").notNull().default("pending"), // pending | completed
  lastError: text("last_error"),
  reconciliationAttemptCount: integer("reconciliation_attempt_count").notNull().default(0),
  reconciliationLastAttemptAt: timestamp("reconciliation_last_attempt_at"),
  reconciliationNextAttemptAt: timestamp("reconciliation_next_attempt_at"),
  conciergeNotifiedAt: timestamp("concierge_notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("household_billing_operations_household_status_idx").on(table.householdId, table.status),
  index("household_billing_operations_reconciliation_idx").on(table.status, table.reconciliationNextAttemptAt, table.updatedAt),
  uniqueIndex("household_billing_operations_pending_target_idx")
    .on(table.memberId, table.targetStatus)
    .where(sql`${table.status} = 'pending'`),
]);

export const nerEnrollmentStatusEnum = pgEnum("ner_enrollment_status", [
  "pending_checkout",
  "provisional",
  "lifetime",
  "past_due",
  "paused",
  "cancelled",
]);

export const nerExternalStatusEnum = pgEnum("ner_external_status", [
  "not_requested",
  "pending",
  "registered",
  "failed",
]);

export const nerEnrollments = pgTable("ner_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  status: nerEnrollmentStatusEnum("status").notNull().default("pending_checkout"),
  paidInstallmentCount: integer("paid_installment_count").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionItemId: text("stripe_subscription_item_id"),
  stripeScheduleId: text("stripe_schedule_id"),
  pendingCheckoutSessionId: text("pending_checkout_session_id"),
  checkoutExpiresAt: timestamp("checkout_expires_at"),
  checkoutAttempt: integer("checkout_attempt").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at"),
  lastFailureMessage: text("last_failure_message"),
  paymentRetryAt: timestamp("payment_retry_at"),
  externalStatus: nerExternalStatusEnum("external_status").notNull().default("not_requested"),
  externalReference: text("external_reference"),
  externalLastAttemptAt: timestamp("external_last_attempt_at"),
  externalLastFailure: text("external_last_failure"),
  externalAttemptCount: integer("external_attempt_count").notNull().default(0),
  externalNextAttemptAt: timestamp("external_next_attempt_at"),
  externalLeaseId: varchar("external_lease_id", { length: 64 }),
  externalLeaseExpiresAt: timestamp("external_lease_expires_at"),
  externalConciergeNotifiedAt: timestamp("external_concierge_notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-preserving authorization history for every Stripe subscription ever
// associated with an enrollment. Exactly one binding is active in normal
// operation; retired rows make late provider events safe to classify.
export const nerSubscriptionBindings = pgTable("ner_subscription_bindings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id").notNull().references(() => nerEnrollments.id),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).notNull().unique(),
  checkoutSessionId: varchar("checkout_session_id", { length: 255 }),
  scheduleId: varchar("schedule_id", { length: 255 }),
  state: text("state").notNull().default("pending"), // pending | active | retired
  reconciliationAttemptCount: integer("reconciliation_attempt_count").notNull().default(0),
  reconciliationLastAttemptAt: timestamp("reconciliation_last_attempt_at"),
  reconciliationNextAttemptAt: timestamp("reconciliation_next_attempt_at"),
  reconciliationLastError: text("reconciliation_last_error"),
  conciergeNotifiedAt: timestamp("concierge_notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
  retiredAt: timestamp("retired_at"),
}, (table) => [
  index("ner_subscription_bindings_enrollment_state_idx").on(table.enrollmentId, table.state),
  index("ner_subscription_bindings_reconciliation_idx").on(table.state, table.reconciliationNextAttemptAt, table.createdAt),
  uniqueIndex("ner_subscription_bindings_one_active_idx")
    .on(table.enrollmentId)
    .where(sql`${table.state} = 'active'`),
]);

// Invoice IDs are the authoritative idempotency key for installment counting.
// Stripe can replay or deliver lifecycle events out of order.
export const nerInstallments = pgTable("ner_installments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id").notNull().references(() => nerEnrollments.id),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }).notNull().unique(),
  amountPaid: integer("amount_paid").notNull(),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
});

// Stripe retries deliveries.  Event IDs are durable idempotency keys; no
// customer, payment, or private application payload is copied into this ledger.
export const stripeEventLedger = pgTable("stripe_event_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  status: text("status").notNull().default("processing"), // processing | processed | failed
  attemptCount: integer("attempt_count").notNull().default(1),
  leaseExpiresAt: timestamp("lease_expires_at"),
  processedAt: timestamp("processed_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const heartPlanIntakes = pgTable("heart_plan_intakes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().unique().references(() => heartPlans.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  firstName: text("first_name"),
  lastName: text("last_name"),
  relationshipStatus: text("relationship_status"),
  hasChildrenOrDependents: text("has_children_or_dependents"),
  phoneType: text("phone_type"),
  hasWillOrTrust: text("has_will_or_trust"),
  hasPowerOfAttorney: text("has_power_of_attorney"),
  hasHealthcareDirective: text("has_healthcare_directive"),
  hasLifeInsurance: text("has_life_insurance"),
  hasInvestmentAccounts: text("has_investment_accounts"),
  hasTollAccounts: text("has_toll_accounts"),
  hasStorageUnit: text("has_storage_unit"),
  hasBettingApps: text("has_betting_apps"),
  hasCryptoApps: text("has_crypto_apps"),
  hasFinalArrangementPlans: text("has_final_arrangement_plans"),
  hasPrepaidFuneralPlan: text("has_prepaid_funeral_plan"),
  currentStep: integer("current_step").notNull().default(0),
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  // Durable delivery state for the 72-hour incomplete-intake journey.
  // A cycle is the number of complete 72-hour periods since intake creation.
  reminderSentCycle: integer("reminder_sent_cycle").notNull().default(0),
  reminderClaimCycle: integer("reminder_claim_cycle").notNull().default(0),
  reminderLeaseToken: text("reminder_lease_token"),
  reminderLeaseExpiresAt: timestamp("reminder_lease_expires_at"),
  reminderRetryAt: timestamp("reminder_retry_at"),
  reminderLastSentAt: timestamp("reminder_last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const heartPlanConsentRecords = pgTable("heart_plan_consent_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  // Deliberately retained without a cascading FK: deleting an account or plan
  // must not erase the historical evidence of what was accepted or declined.
  planId: varchar("plan_id").notNull(),
  consentType: text("consent_type").notNull(),
  decision: boolean("decision").notNull(),
  documentVersion: text("document_version").notNull(),
  sourceUrl: text("source_url").notNull(),
  contentHash: text("content_hash").notNull(),
  // Exact immutable text shown or linked at the time of the decision.
  disclosureText: text("disclosure_text").notNull(),
  signupSource: text("signup_source").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

// Family signup has no HeartPlan. Retain its own consent evidence even if the
// account is later removed, just as HeartPlan consent evidence is retained.
export const familySignupConsentRecords = pgTable("family_signup_consent_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  consentType: text("consent_type").notNull(),
  decision: boolean("decision").notNull(),
  documentVersion: text("document_version").notNull(),
  sourceUrl: text("source_url").notNull(),
  contentHash: text("content_hash").notNull(),
  disclosureText: text("disclosure_text").notNull(),
  signupSource: text("signup_source").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

// Business outreach is separate from operational partner contacts and case data.
export const outreachContacts = pgTable("outreach_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 320 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  fullName: varchar("full_name", { length: 200 }),
  companyName: varchar("company_name", { length: 200 }),
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull().unique(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const outreachTemplates = pgTable("outreach_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: varchar("label", { length: 100 }).notNull(),
  subject: varchar("subject", { length: 180 }).notNull(),
  body: text("body").notNull(),
  attachmentSha256: varchar("attachment_sha256", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});

export const outreachDeliveries = pgTable("outreach_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  templateId: varchar("template_id").notNull(),
  senderEmail: varchar("sender_email", { length: 320 }).notNull(),
  subject: text("subject").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
});

// Retained audit/outbox for administrative HeartPlan deletion. It deliberately
// has no FK to heartPlans because the plan row and its private contents are
// removed in the same transaction that creates this cleanup record.
export const heartPlanDeletionJobs = pgTable("heart_plan_deletion_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().unique(),
  deletedBy: varchar("deleted_by"),
  deletedByName: text("deleted_by_name"),
  reason: text("reason").notNull(),
  objectPaths: jsonb("object_paths").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pending"), // pending | complete
  cleanupNotBefore: timestamp("cleanup_not_before").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastAttemptAt: timestamp("last_attempt_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planWishes = pgTable("plan_wishes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().unique().references(() => heartPlans.id, { onDelete: "cascade" }),
  restingPreference: text("resting_preference"),   // burial | cremation | green_burial | donation | other | undecided
  restingDetails: text("resting_details"),
  serviceType: text("service_type"),               // traditional | celebration_of_life | memorial | private | none | undecided
  serviceLocation: text("service_location"),
  officiant: text("officiant"),
  music: text("music"),
  readings: text("readings"),
  flowersOrDonations: text("flowers_or_donations"),
  obituaryWishes: text("obituary_wishes"),
  additionalWishes: text("additional_wishes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const planDocuments = pgTable("plan_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  documentType: text("document_type").notNull().default("other"),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const vehicleOwnershipStatusEnum = pgEnum("vehicle_ownership_status", [
  "owned_outright",
  "financed",
  "leased",
]);

export const planAssets = pgTable("plan_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  assetType: text("asset_type"),
  category: text("category").notNull().default("other"), // financial | insurance | subscription | membership | property | digital | other
  institution: text("institution"),
  accountNumberHint: text("account_number_hint"),        // last 4 digits only
  vehicleOwnershipStatus: vehicleOwnershipStatusEnum("vehicle_ownership_status"),
  estimatedValue: text("estimated_value"),
  desiredAction: text("desired_action"),                 // close | transfer | notify | cancel | other
  beneficiaryName: text("beneficiary_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const discoverySourceEnum = pgEnum("discovery_source", [
  "demo_credit_report",
  "demo_bank_connection",
]);

export const discoveryClassificationEnum = pgEnum("discovery_classification", [
  "asset",
  "liability",
  "account",
  "recurring_obligation",
]);

export const discoveryReviewStatusEnum = pgEnum("discovery_review_status", [
  "pending",
  "selected",
  "dismissed",
  "saved",
]);

// Synthetic discovery runs are plan-scoped. No credentials, full account
// numbers, transaction details, SSNs, or credit-report identifiers belong in
// either of these tables.
export const planDiscoverySessions = pgTable("plan_discovery_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  source: discoverySourceEnum("source").notNull(),
  status: text("status").notNull().default("ready"), // ready | completed
  consentedAt: timestamp("consented_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planDiscoveryItems = pgTable("plan_discovery_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => planDiscoverySessions.id, { onDelete: "cascade" }),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  source: discoverySourceEnum("source").notNull(),
  classification: discoveryClassificationEnum("classification").notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  institution: text("institution"),
  accountNumberHint: text("account_number_hint"),
  estimatedValue: text("estimated_value"),
  monthlyAmount: text("monthly_amount"),
  recurrence: text("recurrence"),
  notes: text("notes"),
  status: discoveryReviewStatusEnum("review_status").notNull().default("pending"),
  savedPlanAssetId: varchar("saved_plan_asset_id").references(() => planAssets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const planContacts = pgTable("plan_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  isPrimary: boolean("is_primary").notNull().default(false),
  canRequestActivation: boolean("can_request_activation").notNull().default(false),
  notifyOnActivation: boolean("notify_on_activation").notNull().default(true),
  isAdvisor: boolean("is_advisor").notNull().default(false),
  advisorAccessLevel: text("advisor_access_level").notNull().default("limited"),
  advisorPermission: text("advisor_permission").notNull().default("view"),
  advisorNotifiedAt: timestamp("advisor_notified_at"),
  // Set once when the trusted-contact info email (how to report a loss) has
  // been sent, so re-edits never trigger a duplicate email.
  infoEmailSentAt: timestamp("info_email_sent_at"),
  // Failed send attempts for the info email. Once this reaches
  // MAX_INFO_EMAIL_ATTEMPTS the retry sweeper stops retrying and the planner +
  // concierge team are alerted (stamped in infoEmailFailedAt). Fixing the
  // contact's email resets both so sends resume.
  infoEmailAttempts: integer("info_email_attempts").notNull().default(0),
  infoEmailFailedAt: timestamp("info_email_failed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Give up on the trusted-contact info email after this many failed sends and
// alert the planner + concierge team instead of retrying forever.
export const MAX_INFO_EMAIL_ATTEMPTS = 5;

export const planLetters = pgTable("plan_letters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull(),
  recipientContactId: varchar("recipient_contact_id"),
  subject: text("subject"),
  // Kept as one table for backwards compatibility: existing rows are text,
  // while new rows may instead contain a private audio or video object.
  messageType: text("message_type").notNull().default("text"),
  body: text("body"),
  fileName: text("file_name"),
  objectPath: text("object_path"),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  transcriptStatus: text("transcript_status"),
  // A human edit wins over an in-flight transcription job. The source object
  // ties generated text to the specific media revision that produced it.
  transcriptEditedAt: timestamp("transcript_edited_at"),
  transcriptObjectPath: text("transcript_object_path"),
  consentConfirmedAt: timestamp("consent_confirmed_at"),
  uploadStatus: text("upload_status").notNull().default("ready"),
  // A replacement is staged separately so the old playable object remains
  // intact until the newly uploaded object passes server-side verification.
  pendingObjectPath: text("pending_object_path"),
  pendingFileName: text("pending_file_name"),
  pendingContentType: text("pending_content_type"),
  pendingFileSize: integer("pending_file_size"),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Activation requests filed by trusted contacts (public "report a loss" flow).
// A request must be email-verified by the requester before it is shown to the
// concierge team for review; approval reuses the admin activation endpoint.
export const planActivationRequests = pgTable("plan_activation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").references(() => planContacts.id, { onDelete: "set null" }),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  requesterPhone: text("requester_phone"),
  relationship: text("relationship"),
  message: text("message"),
  token: text("token").notNull().unique(),
  // pending_verification -> pending (email confirmed) -> approved | dismissed
  status: text("status").notNull().default("pending_verification"),
  emailVerifiedAt: timestamp("email_verified_at"),
  expiresAt: timestamp("expires_at").notNull(),
  reviewedBy: varchar("reviewed_by"),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planEvents = pgTable("plan_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => heartPlans.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id"),
  actorName: text("actor_name"),
  actorRole: text("actor_role").notNull().default("system"),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const PLAN_DOCUMENT_TYPES = [
  { value: "will_trust", label: "Will / Trust" },
  { value: "insurance_policy", label: "Insurance Policy" },
  { value: "deed_title", label: "Deed / Title" },
  { value: "power_of_attorney", label: "Power of Attorney" },
  { value: "healthcare_directive", label: "Healthcare Directive" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "passwords_note", label: "Passwords / Access Note" },
  { value: "other", label: "Other" },
] as const;

export const HEARTPLAN_VAULT_LIMITS = {
  free: 100 * 1024 * 1024,
  legacy: 1024 * 1024 * 1024,
} as const;

export const PLAN_ASSET_CATEGORIES = [
  { value: "banking", label: "Banking & Cash", description: "Checking, savings, CDs, and cash accounts" },
  { value: "investments", label: "Investments & Retirement", description: "Brokerage, retirement, pension, and annuity accounts" },
  { value: "insurance", label: "Insurance", description: "Life, health, property, and other policies" },
  { value: "real_estate", label: "Real Estate", description: "Homes, land, and other real property" },
  { value: "vehicles", label: "Vehicles", description: "Cars, motorcycles, boats, and recreational vehicles" },
  { value: "business", label: "Business Interests", description: "Ownership stakes, partnerships, and business accounts" },
  { value: "valuables", label: "Valuables & Personal Property", description: "Jewelry, art, collections, and other important items" },
  { value: "digital", label: "Digital Assets & Online Accounts", description: "Email, social, domains, crypto, and cloud accounts" },
  { value: "subscription", label: "Subscriptions & Recurring Services", description: "Utilities, streaming, software, and deliveries" },
  { value: "membership", label: "Memberships & Benefits", description: "Professional, club, loyalty, and community memberships" },
  { value: "debt", label: "Debts & Liabilities", description: "Mortgages, credit cards, loans, and amounts owed" },
  { value: "other", label: "Other", description: "Anything important that does not fit another category" },
] as const;

export const PLAN_ASSET_TYPES = {
  banking: [
    { value: "checking", label: "Checking account" },
    { value: "savings", label: "Savings account" },
    { value: "money_market", label: "Money market account" },
    { value: "certificate_of_deposit", label: "Certificate of deposit (CD)" },
    { value: "cash", label: "Cash or safe deposit box" },
    { value: "other_banking", label: "Other banking account" },
  ],
  investments: [
    { value: "brokerage", label: "Brokerage account" },
    { value: "retirement_401k_403b", label: "401(k) or 403(b)" },
    { value: "ira", label: "IRA or Roth IRA" },
    { value: "pension", label: "Pension" },
    { value: "annuity", label: "Annuity" },
    { value: "education_savings", label: "Education savings account" },
    { value: "stock_equity", label: "Stock or equity holding" },
    { value: "other_investment", label: "Other investment" },
  ],
  insurance: [
    { value: "life_insurance", label: "Life insurance" },
    { value: "health_insurance", label: "Health insurance" },
    { value: "homeowners_renters", label: "Homeowners or renters insurance" },
    { value: "auto_insurance", label: "Auto insurance" },
    { value: "long_term_care", label: "Long-term care insurance" },
    { value: "disability_insurance", label: "Disability insurance" },
    { value: "other_insurance", label: "Other insurance policy" },
  ],
  real_estate: [
    { value: "primary_residence", label: "Primary residence" },
    { value: "second_home", label: "Second home or vacation property" },
    { value: "rental_property", label: "Rental property" },
    { value: "land", label: "Land" },
    { value: "commercial_property", label: "Commercial property" },
    { value: "other_real_estate", label: "Other real estate" },
  ],
  vehicles: [
    { value: "car_truck", label: "Car or truck" },
    { value: "motorcycle", label: "Motorcycle" },
    { value: "atv", label: "ATV or off-road vehicle" },
    { value: "boat", label: "Boat or watercraft" },
    { value: "rv", label: "RV or camper" },
    { value: "other_vehicle", label: "Other vehicle" },
  ],
  business: [
    { value: "sole_proprietorship", label: "Sole proprietorship" },
    { value: "partnership", label: "Partnership interest" },
    { value: "private_company", label: "Private company ownership" },
    { value: "business_account", label: "Business financial account" },
    { value: "intellectual_property", label: "Intellectual property or royalties" },
    { value: "other_business", label: "Other business interest" },
  ],
  valuables: [
    { value: "jewelry", label: "Jewelry or watches" },
    { value: "art", label: "Art" },
    { value: "collectibles", label: "Collectibles" },
    { value: "firearms", label: "Firearms" },
    { value: "household_item", label: "Important household item" },
    { value: "other_valuable", label: "Other valuable property" },
  ],
  digital: [
    { value: "email_account", label: "Email account" },
    { value: "social_media", label: "Social media account" },
    { value: "cloud_storage", label: "Cloud storage or photo account" },
    { value: "cryptocurrency", label: "Cryptocurrency or digital wallet" },
    { value: "crypto_app", label: "Crypto app or exchange" },
    { value: "betting_app", label: "Sports betting or gaming app" },
    { value: "domain_website", label: "Domain or website" },
    { value: "online_store", label: "Online store or marketplace account" },
    { value: "other_digital", label: "Other digital asset" },
  ],
  subscription: [
    { value: "utility", label: "Utility or household service" },
    { value: "streaming", label: "Streaming or entertainment" },
    { value: "software", label: "Software or app" },
    { value: "toll_account", label: "Toll account (SunPass, E-ZPass, Peach Pass, etc.)" },
    { value: "storage_unit", label: "Storage unit" },
    { value: "news_publication", label: "News or publication" },
    { value: "delivery", label: "Delivery or recurring order" },
    { value: "other_subscription", label: "Other subscription" },
  ],
  membership: [
    { value: "professional", label: "Professional association" },
    { value: "club", label: "Club or social organization" },
    { value: "fitness", label: "Gym or fitness membership" },
    { value: "loyalty_rewards", label: "Loyalty or rewards program" },
    { value: "religious_community", label: "Religious or community organization" },
    { value: "other_membership", label: "Other membership" },
  ],
  debt: [
    { value: "mortgage", label: "Mortgage" },
    { value: "credit_card", label: "Credit card" },
    { value: "personal_loan", label: "Personal loan" },
    { value: "auto_loan", label: "Auto loan" },
    { value: "student_loan", label: "Student loan" },
    { value: "line_of_credit", label: "Line of credit" },
    { value: "tax_debt", label: "Tax debt" },
    { value: "other_debt", label: "Other amount owed" },
  ],
  other: [
    { value: "other", label: "Other important item or account" },
  ],
} as const;

export const insertHeartPlanSchema = createInsertSchema(heartPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
});

export type HeartPlanConsentRecord = typeof heartPlanConsentRecords.$inferSelect;
export type InsertHeartPlanConsentRecord = typeof heartPlanConsentRecords.$inferInsert;
export type HeartPlanDeletionJob = typeof heartPlanDeletionJobs.$inferSelect;

export const insertPlanWishesSchema = createInsertSchema(planWishes).omit({
  id: true,
  updatedAt: true,
});

export const insertPlanDocumentSchema = createInsertSchema(planDocuments).omit({
  id: true,
  uploadedAt: true,
}).extend({
  documentType: z.enum([
    "will_trust",
    "insurance_policy",
    "deed_title",
    "power_of_attorney",
    "healthcare_directive",
    "financial_statement",
    "passwords_note",
    "other",
  ]).default("other"),
  label: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(300),
  objectPath: z.string().trim().min(1).max(500),
  contentType: z.string().trim().max(150).nullable().optional(),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const planAssetInsertBaseSchema = createInsertSchema(planAssets).omit({
  id: true,
  createdAt: true,
}).extend({
  category: z.enum([
    "financial",
    "banking",
    "investments",
    "insurance",
    "subscription",
    "membership",
    "property",
    "real_estate",
    "vehicles",
    "business",
    "valuables",
    "digital",
    "debt",
    "other",
  ]).default("other"),
  name: z.string().trim().min(1).max(200),
  assetType: z.string().trim().max(100).nullable().optional(),
  institution: z.string().trim().max(200).nullable().optional(),
  // Never allow full account numbers — at most the last 4 digits.
  accountNumberHint: z.string().trim().regex(/^\d{0,4}$/, "Only the last 4 digits may be stored").nullable().optional(),
  vehicleOwnershipStatus: z.enum(["owned_outright", "financed", "leased"]).nullable().optional(),
  estimatedValue: z.string().trim().max(100).nullable().optional(),
  desiredAction: z.enum(["close", "transfer", "notify", "cancel", "other"]).nullable().optional(),
  beneficiaryName: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const insertPlanAssetSchema = planAssetInsertBaseSchema.superRefine((asset, context) => {
  if (asset.category === "vehicles" && !asset.vehicleOwnershipStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleOwnershipStatus"],
      message: "Choose whether this vehicle is owned outright, financed, or leased",
    });
  } else if (asset.category !== "vehicles" && asset.vehicleOwnershipStatus != null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleOwnershipStatus"],
      message: "Vehicle ownership status can only be used for vehicle assets",
    });
  }
  // Older records used these broad values. Keep them readable, but require all
  // newly categorized records to use a specific type from the selected group.
  if (asset.category === "financial" || asset.category === "property") return;
  const types = PLAN_ASSET_TYPES[asset.category];
  if (!asset.assetType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assetType"],
      message: "Choose a specific type for this category",
    });
    return;
  }
  if (!types.some(type => type.value === asset.assetType)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assetType"],
      message: "The specific type does not match the selected category",
    });
  }
});

export const planAssetPatchSchema = planAssetInsertBaseSchema
  .omit({ planId: true })
  .partial()
  .strict();

export const discoveryItemPatchSchema = z.object({
  category: z.enum(["financial", "insurance", "subscription", "membership", "property", "digital", "other"]).optional(),
  classification: z.enum(["asset", "liability", "account", "recurring_obligation"]).optional(),
  accountNumberHint: z.string().trim().regex(/^\d{0,4}$/, "Only the last 4 digits may be stored").nullable().optional(),
  estimatedValue: z.string().trim().regex(/^\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\$?\d+(?:\.\d{1,2})?$/, "Enter a monetary amount only").max(100).nullable().optional(),
  monthlyAmount: z.string().trim().regex(/^\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\$?\d+(?:\.\d{1,2})?$/, "Enter a monetary amount only").max(100).nullable().optional(),
  recurrence: z.enum(["monthly", "quarterly", "annual"]).nullable().optional(),
  status: z.enum(["pending", "selected", "dismissed"]).optional(),
}).strict();

export const insertPlanContactSchema = createInsertSchema(planContacts).omit({
  id: true,
  createdAt: true,
  infoEmailSentAt: true,
  infoEmailAttempts: true,
  infoEmailFailedAt: true,
  advisorNotifiedAt: true,
}).extend({
  fullName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email("Must be a valid email").max(255).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  isAdvisor: z.boolean().optional(),
  advisorAccessLevel: z.enum(["full", "limited"]).optional(),
  advisorPermission: z.enum(["view", "edit"]).optional(),
});

const planLetterFieldsSchema = createInsertSchema(planLetters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  releasedAt: true,
}).extend({
  recipientName: z.string().trim().min(1).max(200),
  recipientContactId: z.string().trim().max(100).nullable().optional(),
  subject: z.string().trim().max(300).nullable().optional(),
  messageType: z.enum(["text", "audio", "video"]).default("text"),
  body: z.string().trim().min(1).max(20000).nullable().optional(),
  fileName: z.string().trim().min(1).max(300).nullable().optional(),
  objectPath: z.string().trim().startsWith("/objects/").max(500).nullable().optional(),
  contentType: z.string().trim().max(150).nullable().optional(),
  fileSize: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().max(300).nullable().optional(),
  transcript: z.string().trim().max(30000).nullable().optional(),
  transcriptStatus: z.enum(["pending", "completed", "failed"]).nullable().optional(),
  uploadStatus: z.enum(["uploading", "ready", "failed"]).default("ready"),
});

export const insertPlanLetterSchema = planLetterFieldsSchema.superRefine((value, ctx) => {
  if (value.messageType === "text" && !value.body) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Text messages require a body" });
  }
  if (value.messageType !== "text" && value.uploadStatus === "ready" && !value.objectPath) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["objectPath"], message: "Media messages require an uploaded file" });
  }
});

export const updatePlanLetterSchema = z.object({
  recipientName: z.string().trim().min(1).max(200).optional(),
  recipientContactId: z.string().trim().max(100).nullable().optional(),
  subject: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().min(1).max(20000).nullable().optional(),
  transcript: z.string().trim().max(30000).nullable().optional(),
}).strict();

export const PLAN_MESSAGE_MIME_TYPES = {
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;
export const PLAN_MESSAGE_MAX_BYTES = {
  audio: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
} as const;
export const PLAN_MESSAGE_MAX_DURATION_SECONDS = 300;

export const planMessageUploadSchema = z.object({
  recipientName: z.string().trim().min(1).max(200),
  recipientContactId: z.string().trim().min(1).max(100),
  subject: z.string().trim().max(300).nullable().optional(),
  messageType: z.enum(["audio", "video"]),
  fileName: z.string().trim().min(1).max(300),
  contentType: z.string().trim(),
  fileSize: z.number().int().positive(),
  durationSeconds: z.number().int().positive().max(PLAN_MESSAGE_MAX_DURATION_SECONDS),
  recordingConsent: z.literal(true, { error: "Recording consent is required" }),
}).superRefine((value, ctx) => {
  const allowed = PLAN_MESSAGE_MIME_TYPES[value.messageType] as readonly string[];
  if (!allowed.includes(value.contentType.toLowerCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contentType"], message: `Unsupported ${value.messageType} format` });
  }
  if (value.fileSize > PLAN_MESSAGE_MAX_BYTES[value.messageType]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fileSize"], message: `${value.messageType} file is too large` });
  }
});

export const planMessageFinalizeSchema = z.object({
  durationSeconds: z.number().int().positive().max(PLAN_MESSAGE_MAX_DURATION_SECONDS),
});

export type HeartPlan = typeof heartPlans.$inferSelect;
export type InsertHeartPlan = z.infer<typeof insertHeartPlanSchema>;
export type PlanWishes = typeof planWishes.$inferSelect;
export type InsertPlanWishes = z.infer<typeof insertPlanWishesSchema>;
export type PlanDocument = typeof planDocuments.$inferSelect;
export type InsertPlanDocument = z.infer<typeof insertPlanDocumentSchema>;
export type PlanAsset = typeof planAssets.$inferSelect;
export type InsertPlanAsset = z.infer<typeof insertPlanAssetSchema>;
export type PlanDiscoverySession = typeof planDiscoverySessions.$inferSelect;
export type InsertPlanDiscoverySession = typeof planDiscoverySessions.$inferInsert;
export type PlanDiscoveryItem = typeof planDiscoveryItems.$inferSelect;
export type InsertPlanDiscoveryItem = typeof planDiscoveryItems.$inferInsert;
export type PlanContact = typeof planContacts.$inferSelect;
export type InsertPlanContact = z.infer<typeof insertPlanContactSchema>;
export type PlanLetter = typeof planLetters.$inferSelect;
export type InsertPlanLetter = z.infer<typeof insertPlanLetterSchema>;
export type PlanEvent = typeof planEvents.$inferSelect;
export type InsertPlanEvent = typeof planEvents.$inferInsert;
export type PlanActivationRequest = typeof planActivationRequests.$inferSelect;
export type InsertPlanActivationRequest = typeof planActivationRequests.$inferInsert;

export type InsertHeartPlanIntake = typeof heartPlanIntakes.$inferInsert;
export type OrsaRosterMember = typeof orsaRosterMembers.$inferSelect;
export type InsertOrsaRosterMember = typeof orsaRosterMembers.$inferInsert;
export type OrsaRosterAudit = typeof orsaRosterAudits.$inferSelect;
export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type HouseholdBillingOperation = typeof householdBillingOperations.$inferSelect;
export type NerEnrollment = typeof nerEnrollments.$inferSelect;
export type NerSubscriptionBinding = typeof nerSubscriptionBindings.$inferSelect;
export type NerInstallment = typeof nerInstallments.$inferSelect;
export type StripeEventLedgerEntry = typeof stripeEventLedger.$inferSelect;
export type HouseholdMemberStatus = "invited" | "active" | "removed";
export type NerEnrollmentStatus = "pending_checkout" | "provisional" | "lifetime" | "past_due" | "paused" | "cancelled";
export type NerExternalStatus = "not_requested" | "pending" | "registered" | "failed";

const emptyStringToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const marketplaceCategories = pgTable("marketplace_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MarketplacePublicEligibilityInput = Pick<
  typeof marketplaceProviders.$inferSelect,
  "status" | "businessName" | "description" | "services" | "serviceAreas" | "phone" | "email" | "website"
> & { categoryIsActive: boolean };

export function isMarketplaceProviderPubliclyEligible(provider: MarketplacePublicEligibilityInput): boolean {
  const nonblank = (value: string | null | undefined) => Boolean(value?.trim());
  return provider.status === "approved"
    && provider.categoryIsActive
    && nonblank(provider.businessName)
    && nonblank(provider.description)
    && provider.services.some(nonblank)
    && provider.serviceAreas.some(nonblank)
    && [provider.phone, provider.email, provider.website].some(nonblank);
}

export const marketplaceEventActionEnum = pgEnum("marketplace_event_action", [
  "listing_view",
  "profile_view",
  "phone",
  "email",
  "website",
]);

export const marketplaceActorRoleEnum = pgEnum("marketplace_actor_role", [
  "user",
  "planner",
  "admin",
]);

export const marketplaceEvents = pgTable("marketplace_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => marketplaceProviders.id, { onDelete: "cascade" }),
  actorRole: marketplaceActorRoleEnum("actor_role").notNull(),
  action: marketplaceEventActionEnum("action").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("marketplace_events_provider_created_idx").on(table.providerId, table.createdAt),
]);

const marketplaceCategoryFields = {
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens only"),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
};

export const createMarketplaceCategorySchema = z.object(marketplaceCategoryFields).strict();

const optionalContact = z.preprocess(
  emptyStringToNull,
  z.string().trim().max(500).nullable().optional(),
);

export type InsertMarketplaceCategory = z.infer<typeof createMarketplaceCategorySchema>;

export type InsertMarketplaceProvider = z.infer<typeof createMarketplaceProviderSchema>;

const optionalHttpUrl = z.preprocess(
  emptyStringToNull,
  z.string().trim().url().max(2000)
    .refine((value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "URL must use HTTP or HTTPS")
    .nullable()
    .optional(),
);

export type MarketplaceEvent = typeof marketplaceEvents.$inferSelect;

export const updateMarketplaceCategorySchema = z.object(marketplaceCategoryFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type MarketplaceProvider = typeof marketplaceProviders.$inferSelect;

export const marketplaceProviders = pgTable("marketplace_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessName: text("business_name").notNull(),
  categoryId: varchar("category_id").notNull().references(() => marketplaceCategories.id),
  description: text("description").notNull(),
  services: text("services").array().notNull().default(sql`ARRAY[]::text[]`),
  serviceAreas: text("service_areas").array().notNull().default(sql`ARRAY[]::text[]`),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  imageUrl: text("image_url"),
  status: marketplaceProviderStatusEnum("status").notNull().default("draft"),
  vettingSummary: text("vetting_summary"),
  vettedAt: timestamp("vetted_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const marketplaceProviderFields = {
  businessName: z.string().trim().min(1).max(300),
  categoryId: z.string().trim().min(1).max(100),
  description: z.string().trim().max(10000),
  services: z.array(z.string().trim().min(1).max(300)).max(100),
  serviceAreas: z.array(z.string().trim().min(1).max(300)).max(100),
  phone: optionalContact,
  email: z.preprocess(
    emptyStringToNull,
    z.string().trim().email().max(320).nullable().optional(),
  ),
  website: optionalHttpUrl,
  imageUrl: optionalHttpUrl,
  status: z.enum(["draft", "review", "approved", "suspended", "archived"]).optional(),
  vettingSummary: z.string().trim().max(5000).nullable().optional(),
};

export const createMarketplaceProviderSchema = z.object(marketplaceProviderFields).strict();

export const updateMarketplaceProviderSchema = z.object(marketplaceProviderFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type MarketplaceCategory = typeof marketplaceCategories.$inferSelect;

export type InsertMarketplaceEvent = typeof marketplaceEvents.$inferInsert;

export const createMarketplaceEventSchema = z.object({
  providerId: z.string().trim().min(1).max(100),
  action: z.enum(["listing_view", "profile_view", "phone", "email", "website"]),
}).strict();

// Admin hard-asset valuation

export const HARD_ASSET_CATEGORIES = [
  "watch",
  "vehicle",
  "real_estate",
  "jewelry",
  "trading_card",
  "collectible",
  "art",
  "other",
] as const;

export const HARD_ASSET_MATCH_QUALITIES = ["strong", "moderate", "weak"] as const;
export const HARD_ASSET_CONDITIONS = [
  "new",
  "like_new",
  "excellent",
  "very_good",
  "good",
  "fair",
  "poor",
  "damaged",
  "salvage",
] as const;

export const HARD_ASSET_AUTHENTICATION_STATUSES = [
  "not_reviewed",
  "seller_represented",
  "documents_supplied",
  "reference_matched",
  "third_party_authenticated",
  "professionally_graded",
  "ownership_or_title_verified",
  "concerns_identified",
] as const;

export const hardAssetValuations = pgTable("hard_asset_valuations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  brand: text("brand"),
  model: text("model"),
  yearOrEdition: text("year_or_edition"),
  referenceNumber: text("reference_number"),
  propertyLocation: text("property_location"),
  propertyType: text("property_type"),
  livingAreaSquareFeet: integer("living_area_square_feet"),
  bedrooms: integer("bedrooms"),
  bathrooms: text("bathrooms"),
  lotSize: text("lot_size"),
  saleContext: text("sale_context"),
  condition: text("condition").notNull(),
  conditionNotes: text("condition_notes"),
  description: text("description").notNull(),
  provenanceNotes: text("provenance_notes"),
  authenticityStatus: text("authenticity_status").notNull().default("not_reviewed"),
  authenticityNotes: text("authenticity_notes"),
  askingPriceCents: integer("asking_price_cents"),
  aiSummary: text("ai_summary").notNull(),
  comparables: text("comparables").array().notNull().default(sql`ARRAY[]::text[]`),
  comparableSales: jsonb("comparable_sales").$type<HardAssetComparableSale[]>().notNull().default(sql`'[]'::jsonb`),
  aiFmvLowCents: integer("ai_fmv_low_cents"),
  aiFmvHighCents: integer("ai_fmv_high_cents"),
  aiFmvCents: integer("ai_fmv_cents"),
  aiConfidence: integer("ai_confidence"),
  evidenceSummary: text("evidence_summary"),
  revision: integer("revision").notNull().default(0),
  assumptions: text("assumptions").array().notNull().default(sql`ARRAY[]::text[]`),
  risks: text("risks").array().notNull().default(sql`ARRAY[]::text[]`),
  missingEvidence: text("missing_evidence").array().notNull().default(sql`ARRAY[]::text[]`),
  fmvLowCents: integer("fmv_low_cents").notNull(),
  fmvHighCents: integer("fmv_high_cents").notNull(),
  fmvCents: integer("fmv_cents").notNull(),
  offerCents: integer("offer_cents").notNull(),
  confidence: integer("confidence").notNull(),
  status: text("status").notNull().default("analyzed"),
  createdBy: varchar("created_by").notNull(),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("hard_asset_valuations_created_idx").on(table.createdAt),
  index("hard_asset_valuations_category_idx").on(table.category),
  index("hard_asset_valuations_status_idx").on(table.status),
]);

export const hardAssetValuationAttachments = pgTable("hard_asset_valuation_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  valuationId: varchar("valuation_id").references(() => hardAssetValuations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull(),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("uploading"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("hard_asset_valuation_attachments_valuation_idx").on(table.valuationId),
  index("hard_asset_valuation_attachments_created_by_idx").on(table.createdBy),
]);
const optionalHardAssetText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(2000).nullable().optional(),
);

const hardAssetManualValuationRequestSchema = z.object({
  photoMode: z.boolean().optional(),
  category: z.enum(HARD_ASSET_CATEGORIES),
  itemName: z.string().trim().min(2).max(300),
  brand: optionalHardAssetText,
  model: optionalHardAssetText,
  yearOrEdition: optionalHardAssetText,
  referenceNumber: optionalHardAssetText,
  propertyLocation: optionalHardAssetText,
  propertyType: optionalHardAssetText,
  livingAreaSquareFeet: z.number().int().positive().max(1_000_000).nullable().optional(),
  bedrooms: z.number().int().min(0).max(200).nullable().optional(),
  bathrooms: optionalHardAssetText,
  lotSize: optionalHardAssetText,
  saleContext: optionalHardAssetText,
  condition: z.enum(HARD_ASSET_CONDITIONS),
  conditionNotes: optionalHardAssetText,
  description: z.string().trim().min(10).max(8000),
  provenanceNotes: optionalHardAssetText,
  authenticityStatus: z.enum(HARD_ASSET_AUTHENTICATION_STATUSES).default("not_reviewed"),
  authenticityNotes: optionalHardAssetText,
  askingPriceCents: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
}).strict();

export const hardAssetPhotoIdentificationSchema = hardAssetManualValuationRequestSchema.pick({
  category: true, itemName: true, brand: true, model: true, yearOrEdition: true,
  condition: true, conditionNotes: true, description: true,
}).strict();

export const hardAssetValuationRequestSchema = z.union([
  z.object({
    photoMode: z.literal(true),
    attachmentIds: z.array(z.string().uuid()).min(1).max(6)
      .refine(ids => new Set(ids).size === ids.length, "Choose distinct photos"),
  }).strict().transform((input): z.infer<typeof hardAssetManualValuationRequestSchema> => ({
    ...input,
    category: "other", itemName: "Photo identification pending", condition: "good",
    description: "Identify this one item from its photographs and estimate its current resale value.",
    authenticityStatus: "not_reviewed",
  })),
  hardAssetManualValuationRequestSchema.refine(input => !input.photoMode, "Photo mode accepts photos only"),
]);

export const hardAssetComparableSaleSchema = z.object({
  id: z.string().uuid(),
  soldAt: z.string().date(),
  source: z.string().trim().min(2).max(500),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional(),
  priceCents: z.number().int().positive().max(2_000_000_000),
  condition: z.string().trim().min(2).max(1000),
  matchQuality: z.enum(HARD_ASSET_MATCH_QUALITIES),
  included: z.boolean(),
  exclusionReason: z.string().trim().max(1000).nullable().optional(),
  verifiedBy: z.string().min(1),
  verifiedAt: z.string().datetime(),
}).strict();

export const hardAssetValuationUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  contentType: z.enum([
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
  ]),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
}).strict();
export type HardAssetValuation = typeof hardAssetValuations.$inferSelect;

export type HardAssetValuationAttachment = typeof hardAssetValuationAttachments.$inferSelect;
export type HardAssetValuationRequest = z.infer<typeof hardAssetValuationRequestSchema>;

export type HardAssetComparableSale = z.infer<typeof hardAssetComparableSaleSchema>;

export const hardAssetComparableSaleInputSchema = hardAssetComparableSaleSchema
  .omit({ id: true, verifiedBy: true, verifiedAt: true })
  .extend({
    id: z.string().uuid().optional(),
    soldAt: z.string().date().refine(
      (value) => value <= new Date().toISOString().slice(0, 10),
      "Sale date cannot be in the future",
    ),
    sourceUrl: z.union([z.string().trim().url().max(2000), z.literal(""), z.null()]).optional()
      .transform((value) => value || null),
    exclusionReason: z.union([z.string().trim().max(1000), z.literal(""), z.null()]).optional()
      .transform((value) => value || null),
  })
  .refine((sale) => sale.included || !!sale.exclusionReason, {
    message: "Excluded sales require a reason",
    path: ["exclusionReason"],
  });

export const hardAssetComparablesUpdateSchema = z.object({
  comparableSales: z.array(hardAssetComparableSaleInputSchema).max(30),
  expectedRevision: z.number().int().min(0),
}).strict();
