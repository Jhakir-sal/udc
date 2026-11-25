CREATE TYPE "public"."account_action" AS ENUM('close', 'suspend', 'continue', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'pending_action', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."beneficiary_status" AS ENUM('identified', 'verified', 'benefits_pending', 'benefits_active', 'benefits_denied');--> statement-breakpoint
CREATE TYPE "public"."beneficiary_type" AS ENUM('spouse', 'child', 'dependent', 'other');--> statement-breakpoint
CREATE TYPE "public"."case_family_membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."case_family_membership_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('pending', 'verified', 'processing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."credit_protection_status" AS ENUM('pending_approval', 'approved', 'in_progress', 'submitted', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."credit_pull_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."death_certificate_invite_status" AS ENUM('pending', 'completed', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."discovery_classification" AS ENUM('asset', 'liability', 'account', 'recurring_obligation');--> statement-breakpoint
CREATE TYPE "public"."discovery_review_status" AS ENUM('pending', 'selected', 'dismissed', 'saved');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('demo_credit_report', 'demo_bank_connection');--> statement-breakpoint
CREATE TYPE "public"."estate_document_type" AS ENUM('will', 'trust', 'estate', 'power_of_attorney', 'healthcare_directive', 'other');--> statement-breakpoint
CREATE TYPE "public"."estate_status" AS ENUM('active', 'probate', 'settled', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."government_agency" AS ENUM('ssa', 'va', 'medicare', 'medicaid', 'irs', 'state_benefits', 'other');--> statement-breakpoint
CREATE TYPE "public"."heart_plan_status" AS ENUM('active', 'activated');--> statement-breakpoint
CREATE TYPE "public"."home_occupancy_status" AS ENUM('owns_home', 'rents_home', 'lives_with_family_or_others', 'prefer_not_to_say_or_not_sure');--> statement-breakpoint
CREATE TYPE "public"."household_member_status" AS ENUM('invited', 'active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."mail_service_status" AS ENUM('pending', 'submitted', 'processing', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."mail_service_type" AS ENUM('usps_mail_stop', 'dnc_marketing');--> statement-breakpoint
CREATE TYPE "public"."marketplace_actor_role" AS ENUM('user', 'planner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."marketplace_event_action" AS ENUM('listing_view', 'profile_view', 'phone', 'email', 'website');--> statement-breakpoint
CREATE TYPE "public"."marketplace_provider_status" AS ENUM('draft', 'review', 'approved', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ner_analysis_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ner_enrollment_status" AS ENUM('pending_checkout', 'provisional', 'lifetime', 'past_due', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ner_external_status" AS ENUM('not_requested', 'pending', 'registered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."case_referral_status" AS ENUM('pending_family_confirmation', 'confirmed', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."task_completion_status" AS ENUM('pending', 'successful', 'not_completed', 'unsuccessful', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."vehicle_ownership_status" AS ENUM('owned_outright', 'financed', 'leased');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'failed_permanent');--> statement-breakpoint
CREATE TYPE "public"."id_verification_status" AS ENUM('not_started', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'funeral_home', 'planner');--> statement-breakpoint
CREATE TABLE "account_company_phones" (
	"account_id" varchar PRIMARY KEY NOT NULL,
	"account_name_snapshot" text NOT NULL,
	"account_type_snapshot" text DEFAULT '' NOT NULL,
	"company_id_snapshot" varchar,
	"official_domain" text NOT NULL,
	"phone" text NOT NULL,
	"source_url" text NOT NULL,
	"source_kind" text NOT NULL,
	"verified_by" varchar,
	"verified_at" timestamp NOT NULL,
	"last_check_failed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"beneficiary_id" varchar,
	"agency" "government_agency" NOT NULL,
	"appointment_type" text NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"scheduled_time" text NOT NULL,
	"location" text,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"meeting_link" text,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"confirmation_number" text,
	"notes" text,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"full_name" text NOT NULL,
	"relationship" "beneficiary_type" NOT NULL,
	"date_of_birth" text,
	"ssn" text,
	"email" text,
	"phone" text,
	"address" text,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" text,
	"status" "beneficiary_status" DEFAULT 'identified' NOT NULL,
	"eligible_benefits" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"actor_id" varchar,
	"actor_name" text,
	"actor_role" text DEFAULT 'system' NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_family_authorizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" varchar NOT NULL,
	"authorized_by" varchar,
	"owner_signature" text NOT NULL,
	"agreement_version" text NOT NULL,
	"agreement_text" text NOT NULL,
	"scope" text NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"member_signature" text,
	"member_accepted_at" timestamp,
	"review_status" text DEFAULT 'not_requested' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_reason" text,
	"authority_expires_at" timestamp with time zone,
	"evidence_document_id" varchar
);
--> statement-breakpoint
CREATE TABLE "case_family_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "case_family_membership_role" DEFAULT 'member' NOT NULL,
	"status" "case_family_membership_status" DEFAULT 'active' NOT NULL,
	"invited_by" varchar,
	"invitation_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_identity_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" varchar NOT NULL,
	"reviewed_by_name" text NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"account_id" varchar,
	"blockchain_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text,
	"recipient_name" text,
	"subject" text,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_secure" boolean DEFAULT true NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "case_referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"referral_company_id" varchar NOT NULL,
	"status" "case_referral_status" DEFAULT 'pending_family_confirmation' NOT NULL,
	"requested_by" varchar NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"consent_version" text NOT NULL,
	"consent_scope" text NOT NULL,
	"family_decision_by" varchar,
	"family_decision_at" timestamp,
	"confirmation_email_sent_at" timestamp,
	"initial_partner_email_sent_at" timestamp,
	"revoked_by" varchar,
	"revoked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"certificate_id" varchar NOT NULL,
	"task_key" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"completed_by" varchar,
	"completed_by_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "certificate_access_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"requester_user_id" varchar NOT NULL,
	"purpose" text NOT NULL,
	"attestation" text NOT NULL,
	"release_scope" text DEFAULT 'certificate' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"decision_note" text,
	"release_delivery_status" text DEFAULT 'pending' NOT NULL,
	"release_sent_at" timestamp,
	"release_last_error_category" text
);
--> statement-breakpoint
CREATE TABLE "certificate_release_grants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_request_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_release_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"deceased_name" text NOT NULL,
	"deceased_ssn" text,
	"date_of_death" text NOT NULL,
	"date_of_birth" text NOT NULL,
	"certificate_number" text NOT NULL,
	"issuing_authority" text NOT NULL,
	"status" "certificate_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	"blockchain_hash" text,
	"father_name" text,
	"mother_name" text,
	"next_of_kin_name" text,
	"next_of_kin_relationship" text,
	"next_of_kin_phone" text,
	"next_of_kin_email" text,
	"next_of_kin_address" text,
	"next_of_kin_city" text,
	"next_of_kin_state" text,
	"next_of_kin_zip" text,
	"informant_name" text,
	"informant_relationship" text,
	"informant_phone" text,
	"informant_email" text,
	"informant_address" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"contact_address" text,
	"place_of_death_type" text,
	"place_of_death_facility" text,
	"place_of_death_address" text,
	"place_of_death_city" text,
	"place_of_death_county" text,
	"place_of_death_state" text,
	"place_of_death_zip" text,
	"document_url" text,
	"ai_verification_status" text,
	"ai_confidence_score" integer,
	"ai_verification_details" text,
	"referral_source" text,
	"referral_detail" text,
	"estate_status" text,
	"submitter_relationship" text,
	"is_authorized_executor" text,
	"service_plan" text,
	"payment_status" text DEFAULT 'unpaid',
	"payment_amount" integer,
	"paid_at" timestamp,
	"stripe_checkout_session_id" text,
	CONSTRAINT "certificates_certificate_number_unique" UNIQUE("certificate_number")
);
--> statement-breakpoint
CREATE TABLE "company_death_notices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"secure_record_id" varchar(64) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"destination_email" text,
	"created_by" varchar NOT NULL,
	"sent_at" timestamp,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_death_notices_secure_record_id_unique" UNIQUE("secure_record_id")
);
--> statement-breakpoint
CREATE TABLE "company_directory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"category" text NOT NULL,
	"official_domain" text NOT NULL,
	"notification_email" text,
	"routing_approval" jsonb,
	"website" text,
	"is_national" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp,
	"verified_by" varchar,
	"source" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_notification_audit_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar,
	"notice_id" varchar,
	"access_request_id" varchar,
	"actor_user_id" varchar,
	"actor_role" text,
	"event_type" text NOT NULL,
	"ip_hash" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concierge_inquiries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"care_location" text DEFAULT '' NOT NULL,
	"best_time" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notification_status" text DEFAULT 'pending' NOT NULL,
	"contact_permission_at" timestamp DEFAULT now() NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"company_id" varchar,
	"account_name" text NOT NULL,
	"account_type" text NOT NULL,
	"category" text NOT NULL,
	"account_number" text,
	"is_joint" boolean DEFAULT false NOT NULL,
	"account_designation" text,
	"survivor_name" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"selected_action" "account_action",
	"action_date" timestamp,
	"notification_sent_at" timestamp,
	"task_completion_status" "task_completion_status" DEFAULT 'pending',
	"task_completion_message" text,
	"task_completed_at" timestamp,
	"provider_reference" text,
	"transfer_to_name" text,
	"transfer_to_relationship" text,
	"transfer_verified_by" text,
	"transfer_verification_id" varchar,
	"transfer_verified_at" timestamp,
	"added_by" text,
	"responsible_party" text,
	"family_action_instructions" text,
	"family_contact_phone" text,
	"family_contact_email" text,
	"completed_by" text
);
--> statement-breakpoint
CREATE TABLE "credit_protection_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"bureau" text NOT NULL,
	"status" "credit_protection_status" DEFAULT 'pending_approval' NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar,
	"submitted_at" timestamp,
	"completed_at" timestamp,
	"external_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_pull_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_pull_id" varchar NOT NULL,
	"certificate_id" varchar NOT NULL,
	"account_name" text NOT NULL,
	"account_type" text NOT NULL,
	"category" text NOT NULL,
	"account_number" text,
	"balance" text,
	"monthly_payment" text,
	"account_status" text,
	"date_opened" text,
	"last_activity" text,
	"is_imported" boolean DEFAULT false NOT NULL,
	"imported_account_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_pulls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"bureau" text NOT NULL,
	"status" "credit_pull_status" DEFAULT 'pending' NOT NULL,
	"total_accounts_found" text,
	"total_imported" text,
	"pull_date" timestamp,
	"external_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "death_certificate_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"funeral_home_name" text NOT NULL,
	"invitee_email" text NOT NULL,
	"status" "death_certificate_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by" varchar NOT NULL,
	"uploaded_at" timestamp,
	"uploaded_object_path" text,
	"uploaded_mime_type" text,
	"uploaded_file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "death_certificate_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "document_account_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estate_referral_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" varchar NOT NULL,
	"referral_version" integer NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"attempted_at" timestamp,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "estate_referral_updates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" varchar NOT NULL,
	"source" text NOT NULL,
	"summary" text NOT NULL,
	"reported_at" timestamp NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estate_referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"reference" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'needed' NOT NULL,
	"attorney_name" text DEFAULT '' NOT NULL,
	"attorney_firm" text DEFAULT '' NOT NULL,
	"attorney_email" text DEFAULT '' NOT NULL,
	"attorney_phone" text DEFAULT '' NOT NULL,
	"referred_at" timestamp,
	"next_follow_up_at" timestamp,
	"permission_confirmed_at" timestamp,
	"permission_confirmed_by" varchar,
	"resolution_summary" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "estate_referrals_certificate_id_unique" UNIQUE("certificate_id"),
	CONSTRAINT "estate_referrals_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "estate_registry" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "estate_document_type" NOT NULL,
	"principal_name" text NOT NULL,
	"principal_dob" text,
	"principal_ssn" text,
	"document_number" text NOT NULL,
	"filing_date" timestamp NOT NULL,
	"jurisdiction" text NOT NULL,
	"court_name" text,
	"case_number" text,
	"status" "estate_status" DEFAULT 'active' NOT NULL,
	"executor_name" text,
	"executor_contact" text,
	"attorney_name" text,
	"attorney_contact" text,
	"estimated_value" text,
	"beneficiary_names" text[],
	"asset_types" text[],
	"notes" text,
	"blockchain_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "estate_registry_document_number_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "family_document_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"certificate_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "family_document_notices" (
	"document_id" varchar PRIMARY KEY NOT NULL,
	"certificate_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"seen_at" timestamp,
	"seen_by" varchar
);
--> statement-breakpoint
CREATE TABLE "family_document_suggestions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" varchar NOT NULL,
	"document_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"certificate_id" varchar,
	"merchant_name" text NOT NULL,
	"description" text DEFAULT 'Recurring payment' NOT NULL,
	"amount_cents" integer,
	"frequency" text,
	"confidence" text,
	"category" text DEFAULT 'miscellaneous' NOT NULL,
	"recommended_action" text DEFAULT 'review' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"connected_account_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"certificate_id" varchar,
	"label" text NOT NULL,
	"document_type" text DEFAULT 'other' NOT NULL,
	"file_name" text NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"uploaded_by_role" text DEFAULT 'user' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invitation_challenges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" varchar NOT NULL,
	"account_created" boolean DEFAULT false NOT NULL,
	"user_id" varchar,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"email" text NOT NULL,
	"phone_number" text,
	"recipient_name" text NOT NULL,
	"deceased_relationship_to_recipient" text,
	"deceased_name" text NOT NULL,
	"token" text,
	"token_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false,
	"sms_sent" boolean DEFAULT false,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"sent_by" varchar,
	"sharing_authorized_by" varchar,
	"sharing_owner_signature" text,
	"sharing_agreement_version" text,
	"sharing_agreement_text" text,
	"sharing_scope" text,
	"sharing_signed_at" timestamp,
	CONSTRAINT "family_invitations_token_unique" UNIQUE("token"),
	CONSTRAINT "family_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "family_signup_consent_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"consent_type" text NOT NULL,
	"decision" boolean NOT NULL,
	"document_version" text NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"disclosure_text" text NOT NULL,
	"signup_source" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "government_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"agency" "government_agency" NOT NULL,
	"notification_type" text NOT NULL,
	"status" "task_completion_status" DEFAULT 'pending' NOT NULL,
	"reference_number" text,
	"response_message" text,
	"benefits_affected" text[],
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hard_asset_valuation_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"valuation_id" varchar,
	"created_by" varchar NOT NULL,
	"object_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hard_asset_valuation_attachments_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
CREATE TABLE "hard_asset_valuations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"item_name" text NOT NULL,
	"brand" text,
	"model" text,
	"year_or_edition" text,
	"reference_number" text,
	"property_location" text,
	"property_type" text,
	"living_area_square_feet" integer,
	"bedrooms" integer,
	"bathrooms" text,
	"lot_size" text,
	"sale_context" text,
	"condition" text NOT NULL,
	"condition_notes" text,
	"description" text NOT NULL,
	"provenance_notes" text,
	"authenticity_status" text DEFAULT 'not_reviewed' NOT NULL,
	"authenticity_notes" text,
	"asking_price_cents" integer,
	"ai_summary" text NOT NULL,
	"comparables" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"comparable_sales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_fmv_low_cents" integer,
	"ai_fmv_high_cents" integer,
	"ai_fmv_cents" integer,
	"ai_confidence" integer,
	"evidence_summary" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"assumptions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"risks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"missing_evidence" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"fmv_low_cents" integer NOT NULL,
	"fmv_high_cents" integer NOT NULL,
	"fmv_cents" integer NOT NULL,
	"offer_cents" integer NOT NULL,
	"confidence" integer NOT NULL,
	"status" text DEFAULT 'analyzed' NOT NULL,
	"created_by" varchar NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heart_plan_consent_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"consent_type" text NOT NULL,
	"decision" boolean NOT NULL,
	"document_version" text NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"disclosure_text" text NOT NULL,
	"signup_source" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heart_plan_deletion_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"deleted_by" varchar,
	"deleted_by_name" text,
	"reason" text NOT NULL,
	"object_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cleanup_not_before" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "heart_plan_deletion_jobs_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "heart_plan_intakes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"first_name" text,
	"last_name" text,
	"relationship_status" text,
	"has_children_or_dependents" text,
	"phone_type" text,
	"has_will_or_trust" text,
	"has_power_of_attorney" text,
	"has_healthcare_directive" text,
	"has_life_insurance" text,
	"has_investment_accounts" text,
	"has_toll_accounts" text,
	"has_storage_unit" text,
	"has_betting_apps" text,
	"has_crypto_apps" text,
	"has_final_arrangement_plans" text,
	"has_prepaid_funeral_plan" text,
	"current_step" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"skipped_at" timestamp,
	"reminder_sent_cycle" integer DEFAULT 0 NOT NULL,
	"reminder_claim_cycle" integer DEFAULT 0 NOT NULL,
	"reminder_lease_token" text,
	"reminder_lease_expires_at" timestamp,
	"reminder_retry_at" timestamp,
	"reminder_last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "heart_plan_intakes_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "heart_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"status" "heart_plan_status" DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"stripe_checkout_session_id" text,
	"upgraded_at" timestamp,
	"full_name" text,
	"date_of_birth" text,
	"phone" text,
	"street" text,
	"city" text,
	"state" text,
	"zip" text,
	"home_occupancy_status" "home_occupancy_status",
	"has_vehicles" boolean,
	"certificate_id" varchar,
	"activated_at" timestamp,
	"activated_by" varchar,
	"activated_by_name" text,
	"last_reviewed_at" timestamp,
	"last_reviewed_by" varchar,
	"last_reviewed_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "heart_plans_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "household_billing_operations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"member_id" varchar NOT NULL,
	"target_status" "household_member_status" NOT NULL,
	"target_quantity" integer,
	"checkout_session_id" varchar(255),
	"checkout_expires_at" timestamp,
	"checkout_success_url" text,
	"checkout_cancel_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"reconciliation_attempt_count" integer DEFAULT 0 NOT NULL,
	"reconciliation_last_attempt_at" timestamp,
	"reconciliation_next_attempt_at" timestamp,
	"concierge_notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"user_id" varchar,
	"normalized_email" varchar(320) NOT NULL,
	"display_name" text,
	"status" "household_member_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_user_id" varchar NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_subscription_item_id" text,
	"stripe_subscription_status" text,
	"stripe_cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"stripe_current_period_end" timestamp,
	"last_payment_failure_at" timestamp,
	"last_payment_failure_message" text,
	"pending_checkout_session_id" text,
	"pending_checkout_expires_at" timestamp,
	"stripe_billing_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "households_primary_user_id_unique" UNIQUE("primary_user_id")
);
--> statement-breakpoint
CREATE TABLE "life_insurance_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"policy_number" text,
	"policy_type" text,
	"face_value" text,
	"beneficiary_name" text,
	"beneficiary_relationship" text,
	"status" text DEFAULT 'discovered' NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"notes" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"claim_filed_at" timestamp,
	"claim_number" text
);
--> statement-breakpoint
CREATE TABLE "lpoa_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"certificate_id" varchar,
	"principal_name" text NOT NULL,
	"principal_address" text NOT NULL,
	"signature_type" text NOT NULL,
	"signature_data" text NOT NULL,
	"consent_agreed" boolean DEFAULT false NOT NULL,
	"identity_source" text DEFAULT 'stripe_verified' NOT NULL,
	"identity_fallback_reason" text,
	"identity_attested_at" timestamp,
	"valid_until" text NOT NULL,
	"agreement_version" text DEFAULT 'legacy-standard-v1' NOT NULL,
	"agreement_snapshot" text DEFAULT '{"title":"LIMITED POWER OF ATTORNEY","subtitle":"Standard — End-of-Life Resolution Services","grantParagraph":"I hereby grant this limited power of attorney to Steps After Life, Inc., represented by their authorized agent, Diana Milian, whose address is 21002 Mack Ave., Grosse Pointe Woods, MI 48236, to act on behalf of the Principal in all matters related to the end of life resolution services they provide. This limited power of attorney authorizes Steps After Life, Inc. to perform the following actions:","authorizedActions":["Communicate and interact with relevant resolution authorities, organizations, or entities.","Obtain and review resolution documents, records, and information pertaining to the Principal.","Handle estate matters, including the limited management and distribution of assets and liabilities, as required.","Deliver any necessary documents, contracts, or agreements related to resolution matters on behalf of the Principal.","Represent the Principal in non-legal or financial resolution and negotiations, if necessary.","Act on behalf of the Principal to identify debtors and creditors for the purpose of account resolution, including communicating and coordinating with credit reporting agencies and similar organizations, as well as obtaining a copy of the credit report as needed."],"diligenceParagraph":"Steps After Life, Inc. and its authorized agent are expected to act diligently, in good faith, and in the best interests of the Principal. They shall provide regular updates to me, the Principal, regarding all actions taken on behalf of the Principal under this limited power of attorney.","limitationParagraph":"This limited power of attorney is granted solely for resolution matters and does not grant Steps After Life, Inc. or its authorized agents any authority control over other legal or medical decisions.","acknowledgementParagraph":"By signing below, I acknowledge that I fully understand the terms and conditions of this limited power of attorney and willingly grant Steps After Life, Inc. the authority to represent the Principal for resolution matters."}' NOT NULL,
	"ip_address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"supersedes_document_id" varchar,
	"superseded_by_document_id" varchar,
	"replacement_requested_at" timestamp,
	"replacement_requested_by" varchar,
	"replacement_reason" text,
	"superseded_at" timestamp,
	"signed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lpoa_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" varchar NOT NULL,
	"requested_by_name" text NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"last_sent_at" timestamp,
	"send_attempt_count" integer DEFAULT 0 NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"sms_sent" boolean DEFAULT false NOT NULL,
	"in_app_sent" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"completed_by_document_id" varchar
);
--> statement-breakpoint
CREATE TABLE "mail_service_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"service_type" "mail_service_type" NOT NULL,
	"status" "mail_service_status" DEFAULT 'pending' NOT NULL,
	"deceased_address" text,
	"submitted_at" timestamp,
	"completed_at" timestamp,
	"external_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketplace_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"actor_role" "marketplace_actor_role" NOT NULL,
	"action" "marketplace_event_action" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"category_id" varchar NOT NULL,
	"description" text NOT NULL,
	"services" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"service_areas" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"image_url" text,
	"status" "marketplace_provider_status" DEFAULT 'draft' NOT NULL,
	"vetting_summary" text,
	"vetted_at" timestamp,
	"approved_at" timestamp,
	"approved_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nearest_relatives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"full_name" text NOT NULL,
	"relationship" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"age" text,
	"data_source" text DEFAULT 'public_records' NOT NULL,
	"confidence" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ner_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"status" "ner_analysis_status" DEFAULT 'pending' NOT NULL,
	"extracted_entities" text,
	"matched_estates" text[],
	"match_confidence" text,
	"analysis_details" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ner_enrollments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"status" "ner_enrollment_status" DEFAULT 'pending_checkout' NOT NULL,
	"paid_installment_count" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_subscription_item_id" text,
	"stripe_schedule_id" text,
	"pending_checkout_session_id" text,
	"checkout_expires_at" timestamp,
	"checkout_attempt" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp,
	"last_failure_message" text,
	"payment_retry_at" timestamp,
	"external_status" "ner_external_status" DEFAULT 'not_requested' NOT NULL,
	"external_reference" text,
	"external_last_attempt_at" timestamp,
	"external_last_failure" text,
	"external_attempt_count" integer DEFAULT 0 NOT NULL,
	"external_next_attempt_at" timestamp,
	"external_lease_id" varchar(64),
	"external_lease_expires_at" timestamp,
	"external_concierge_notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ner_enrollments_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ner_installments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar NOT NULL,
	"stripe_invoice_id" varchar(255) NOT NULL,
	"amount_paid" integer NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ner_installments_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "ner_search_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar,
	"actor_id" varchar NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"searcher_name" text NOT NULL,
	"searched_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"year_of_birth" text,
	"zip_code" text,
	"maiden_name" text,
	"source" text NOT NULL,
	"outcome" text NOT NULL,
	"result_count" integer,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"reported_at" timestamp,
	"reported_outcome" text,
	"report_notes" text
);
--> statement-breakpoint
CREATE TABLE "ner_subscription_bindings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"checkout_session_id" varchar(255),
	"schedule_id" varchar(255),
	"state" text DEFAULT 'pending' NOT NULL,
	"reconciliation_attempt_count" integer DEFAULT 0 NOT NULL,
	"reconciliation_last_attempt_at" timestamp,
	"reconciliation_next_attempt_at" timestamp,
	"reconciliation_last_error" text,
	"concierge_notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"retired_at" timestamp,
	CONSTRAINT "ner_subscription_bindings_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "next_of_kin_private_identities" (
	"certificate_id" varchar PRIMARY KEY NOT NULL,
	"contact_token" varchar(64) NOT NULL,
	"encrypted_identity" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" varchar NOT NULL,
	"account_id" varchar,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "orsa_bulk_sms_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"member_id" varchar NOT NULL,
	"display_name" text,
	"phone" varchar(20) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"attempted_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_bulk_sms_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"message" text NOT NULL,
	"attestation" text NOT NULL,
	"created_by" varchar NOT NULL,
	"approved_by" varchar,
	"timezone" text NOT NULL,
	"interval_seconds" integer DEFAULT 10 NOT NULL,
	"daily_limit" integer DEFAULT 1000 NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"next_attempt_at" timestamp,
	"day_key" text,
	"day_attempts" integer DEFAULT 0 NOT NULL,
	"pause_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_email_campaign_compliance" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"optouts_reviewed_at" timestamp,
	"optouts_reviewed_by" varchar
);
--> statement-breakpoint
CREATE TABLE "orsa_email_campaign_contacts" (
	"normalized_email" varchar(320) PRIMARY KEY NOT NULL,
	"unsubscribe_token" varchar(64) NOT NULL,
	"opted_out_at" timestamp,
	"opted_out_by" varchar,
	CONSTRAINT "orsa_email_campaign_contacts_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "orsa_email_campaign_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"normalized_email" varchar(320) NOT NULL,
	"template_id" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"sent_by" varchar,
	"tracking_token_hash" varchar(64),
	"first_opened_at" timestamp,
	"first_clicked_at" timestamp,
	CONSTRAINT "orsa_email_campaign_deliveries_tracking_token_hash_unique" UNIQUE("tracking_token_hash")
);
--> statement-breakpoint
CREATE TABLE "orsa_email_campaign_previews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"template_id" varchar(100) NOT NULL,
	"recipient_snapshot" jsonb NOT NULL,
	"expected_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_email_campaign_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_id" varchar NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"template_id" varchar(100) NOT NULL,
	"recipient_snapshot" jsonb NOT NULL,
	"expected_count" integer NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "orsa_email_campaign_runs_preview_id_unique" UNIQUE("preview_id")
);
--> statement-breakpoint
CREATE TABLE "orsa_email_warmup_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"scope" varchar(32) DEFAULT 'orsa' NOT NULL,
	"template_id" text,
	"actor_user_id" varchar,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_email_warmup_settings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT true NOT NULL,
	"daily_review_required" boolean DEFAULT false NOT NULL,
	"hourly_limit" integer DEFAULT 10 NOT NULL,
	"daily_limit" integer DEFAULT 25 NOT NULL,
	"min_interval_seconds" integer DEFAULT 360 NOT NULL,
	"provider_hourly_limit" integer DEFAULT 20 NOT NULL,
	"reserved_hourly" integer DEFAULT 10 NOT NULL,
	"pause_reason" text,
	"next_send_at" timestamp,
	"reviewed_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_legacy_entitlements" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"paid_through" timestamp,
	"pending_checkout_session_id" text,
	"pending_checkout_expires_at" timestamp,
	"checkout_attempt" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_legacy_purchases" (
	"checkout_session_id" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"purchased_at" timestamp NOT NULL,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_roster_audits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orsa_roster_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_email" varchar(320),
	"shared_eligibility_email" varchar(320),
	"normalized_phone" varchar(64),
	"external_member_id" varchar(255),
	"contact_key" text,
	"display_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"invitation_status" text DEFAULT 'pending' NOT NULL,
	"invitation_first_attempt_at" timestamp,
	"invitation_attempted_at" timestamp,
	"invitation_sent_at" timestamp,
	"invitation_accepted_at" timestamp,
	"invitation_accepted_user_id" varchar,
	"invitation_lease_id" varchar,
	"invitation_lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp,
	CONSTRAINT "orsa_roster_members_normalized_email_unique" UNIQUE("normalized_email"),
	CONSTRAINT "orsa_roster_members_external_member_id_unique" UNIQUE("external_member_id"),
	CONSTRAINT "orsa_roster_members_contact_key_unique" UNIQUE("contact_key")
);
--> statement-breakpoint
CREATE TABLE "orsa_sms_campaign" (
	"phone" varchar(20) PRIMARY KEY NOT NULL,
	"member_id" varchar,
	"consent_evidence" text,
	"consent_recorded_by" varchar,
	"consent_recorded_at" timestamp,
	"opted_out_at" timestamp,
	"status" text DEFAULT 'not_sent' NOT NULL,
	"attempted_at" timestamp,
	"submitted_at" timestamp,
	"sent_by" varchar,
	"provider_message_id" text,
	"delivery_status" text,
	CONSTRAINT "orsa_sms_campaign_provider_message_id_unique" UNIQUE("provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"first_name" varchar(100),
	"full_name" varchar(200),
	"company_name" varchar(200),
	"unsubscribe_token" varchar(64) NOT NULL,
	"unsubscribed_at" timestamp,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_contacts_email_unique" UNIQUE("email"),
	CONSTRAINT "outreach_contacts_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "outreach_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"sender_email" varchar(320) NOT NULL,
	"subject" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "outreach_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(100) NOT NULL,
	"subject" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"attachment_sha256" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "plan_activation_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"contact_id" varchar,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_phone" text,
	"relationship" text,
	"message" text,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"email_verified_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"reviewed_by" varchar,
	"reviewed_by_name" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_activation_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "plan_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"name" text NOT NULL,
	"asset_type" text,
	"category" text DEFAULT 'other' NOT NULL,
	"institution" text,
	"account_number_hint" text,
	"vehicle_ownership_status" "vehicle_ownership_status",
	"estimated_value" text,
	"desired_action" text,
	"beneficiary_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"full_name" text NOT NULL,
	"relationship" text,
	"phone" text,
	"email" text,
	"address" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"can_request_activation" boolean DEFAULT false NOT NULL,
	"notify_on_activation" boolean DEFAULT true NOT NULL,
	"is_advisor" boolean DEFAULT false NOT NULL,
	"advisor_access_level" text DEFAULT 'limited' NOT NULL,
	"advisor_permission" text DEFAULT 'view' NOT NULL,
	"advisor_notified_at" timestamp,
	"info_email_sent_at" timestamp,
	"info_email_attempts" integer DEFAULT 0 NOT NULL,
	"info_email_failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_discovery_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"source" "discovery_source" NOT NULL,
	"classification" "discovery_classification" NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"account_number_hint" text,
	"estimated_value" text,
	"monthly_amount" text,
	"recurrence" text,
	"notes" text,
	"review_status" "discovery_review_status" DEFAULT 'pending' NOT NULL,
	"saved_plan_asset_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_discovery_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"source" "discovery_source" NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"consented_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"label" text NOT NULL,
	"document_type" text DEFAULT 'other' NOT NULL,
	"file_name" text NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"file_size" integer,
	"notes" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"actor_id" varchar,
	"actor_name" text,
	"actor_role" text DEFAULT 'system' NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_letters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_contact_id" varchar,
	"subject" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"body" text,
	"file_name" text,
	"object_path" text,
	"content_type" text,
	"file_size" integer,
	"duration_seconds" integer,
	"transcript" text,
	"transcript_status" text,
	"transcript_edited_at" timestamp,
	"transcript_object_path" text,
	"consent_confirmed_at" timestamp,
	"upload_status" text DEFAULT 'ready' NOT NULL,
	"pending_object_path" text,
	"pending_file_name" text,
	"pending_content_type" text,
	"pending_file_size" integer,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_wishes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"resting_preference" text,
	"resting_details" text,
	"service_type" text,
	"service_location" text,
	"officiant" text,
	"music" text,
	"readings" text,
	"flowers_or_donations" text,
	"obituary_wishes" text,
	"additional_wishes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_wishes_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "referral_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"notification_email" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"funeral_home_id" varchar,
	"marketplace_provider_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_milestone_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_referral_id" varchar NOT NULL,
	"milestone_key" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "sal_notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sal_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" varchar(50) NOT NULL,
	"user_email" varchar(255),
	"user_name" varchar(255),
	"case_id" varchar,
	"deceased_name" varchar(255),
	"payload" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"webhook_url" text,
	"api_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sms_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone_number" text NOT NULL,
	"contact_name" text,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"body" text NOT NULL,
	"certificate_id" varchar,
	"admin_user_id" varchar,
	"admin_name" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"ringcentral_message_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stripe_event_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"lease_expires_at" timestamp,
	"processed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_event_ledger_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"certificate_id" varchar NOT NULL,
	"webhook_url" text NOT NULL,
	"payload" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"blockchain_hash" text NOT NULL,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"response_code" text,
	"response_body" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"retry_count" text DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "funeral_homes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"license_number" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"api_key" text NOT NULL,
	"is_active" varchar DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "funeral_homes_license_number_unique" UNIQUE("license_number"),
	CONSTRAINT "funeral_homes_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_demo_account" boolean DEFAULT false NOT NULL,
	"funeral_home_id" varchar,
	"password_hash" varchar,
	"phone_number" varchar,
	"phone_verified" boolean DEFAULT false,
	"phone_verification_code" varchar,
	"phone_verification_expiry" timestamp,
	"phone_enrollment_attempts" integer DEFAULT 0 NOT NULL,
	"phone_enrollment_window_started_at" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"email_verified" boolean DEFAULT false,
	"email_verification_code" varchar,
	"email_verification_expiry" timestamp,
	"id_verification_status" "id_verification_status" DEFAULT 'not_started',
	"stripe_verification_session_id" varchar,
	"id_verified_at" timestamp,
	"id_verified_name" varchar,
	"id_override_by" varchar,
	"id_override_by_name" varchar,
	"id_override_at" timestamp,
	"id_override_note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_company_phones" ADD CONSTRAINT "account_company_phones_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_authorizations" ADD CONSTRAINT "case_family_authorizations_membership_id_case_family_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."case_family_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_authorizations" ADD CONSTRAINT "case_family_authorizations_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_authorizations" ADD CONSTRAINT "case_family_authorizations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_authorizations" ADD CONSTRAINT "case_family_authorizations_evidence_document_id_family_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."family_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_memberships" ADD CONSTRAINT "case_family_memberships_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_memberships" ADD CONSTRAINT "case_family_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_memberships" ADD CONSTRAINT "case_family_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_family_memberships" ADD CONSTRAINT "case_family_memberships_invitation_id_family_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."family_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_identity_reviews" ADD CONSTRAINT "case_identity_reviews_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_referrals" ADD CONSTRAINT "case_referrals_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_referrals" ADD CONSTRAINT "case_referrals_referral_company_id_referral_companies_id_fk" FOREIGN KEY ("referral_company_id") REFERENCES "public"."referral_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_access_requests" ADD CONSTRAINT "certificate_access_requests_notice_id_company_death_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."company_death_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_access_requests" ADD CONSTRAINT "certificate_access_requests_company_id_company_directory_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_release_grants" ADD CONSTRAINT "certificate_release_grants_access_request_id_certificate_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "public"."certificate_access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_death_notices" ADD CONSTRAINT "company_death_notices_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_death_notices" ADD CONSTRAINT "company_death_notices_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_death_notices" ADD CONSTRAINT "company_death_notices_company_id_company_directory_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_company_id_company_directory_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company_directory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_company_id_company_directory_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_protection_requests" ADD CONSTRAINT "credit_protection_requests_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_pull_results" ADD CONSTRAINT "credit_pull_results_credit_pull_id_credit_pulls_id_fk" FOREIGN KEY ("credit_pull_id") REFERENCES "public"."credit_pulls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_pull_results" ADD CONSTRAINT "credit_pull_results_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_pulls" ADD CONSTRAINT "credit_pulls_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_certificate_invites" ADD CONSTRAINT "death_certificate_invites_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_account_links" ADD CONSTRAINT "document_account_links_document_id_family_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."family_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_account_links" ADD CONSTRAINT "document_account_links_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_referral_requests" ADD CONSTRAINT "estate_referral_requests_referral_id_estate_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."estate_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_referral_updates" ADD CONSTRAINT "estate_referral_updates_referral_id_estate_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."estate_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_referrals" ADD CONSTRAINT "estate_referrals_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_analyses" ADD CONSTRAINT "family_document_analyses_document_id_family_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."family_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_analyses" ADD CONSTRAINT "family_document_analyses_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_notices" ADD CONSTRAINT "family_document_notices_document_id_family_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."family_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_notices" ADD CONSTRAINT "family_document_notices_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_suggestions" ADD CONSTRAINT "family_document_suggestions_analysis_id_family_document_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."family_document_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_suggestions" ADD CONSTRAINT "family_document_suggestions_document_id_family_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."family_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_suggestions" ADD CONSTRAINT "family_document_suggestions_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_document_suggestions" ADD CONSTRAINT "family_document_suggestions_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_documents" ADD CONSTRAINT "family_documents_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitation_challenges" ADD CONSTRAINT "family_invitation_challenges_invitation_id_family_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."family_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitation_challenges" ADD CONSTRAINT "family_invitation_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_sharing_authorized_by_users_id_fk" FOREIGN KEY ("sharing_authorized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_notifications" ADD CONSTRAINT "government_notifications_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hard_asset_valuation_attachments" ADD CONSTRAINT "hard_asset_valuation_attachments_valuation_id_hard_asset_valuations_id_fk" FOREIGN KEY ("valuation_id") REFERENCES "public"."hard_asset_valuations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_plan_intakes" ADD CONSTRAINT "heart_plan_intakes_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_plans" ADD CONSTRAINT "heart_plans_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_billing_operations" ADD CONSTRAINT "household_billing_operations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_billing_operations" ADD CONSTRAINT "household_billing_operations_member_id_household_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_insurance_policies" ADD CONSTRAINT "life_insurance_policies_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpoa_documents" ADD CONSTRAINT "lpoa_documents_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lpoa_requests" ADD CONSTRAINT "lpoa_requests_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_service_requests" ADD CONSTRAINT "mail_service_requests_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_events" ADD CONSTRAINT "marketplace_events_provider_id_marketplace_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."marketplace_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_providers" ADD CONSTRAINT "marketplace_providers_category_id_marketplace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."marketplace_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nearest_relatives" ADD CONSTRAINT "nearest_relatives_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ner_analysis" ADD CONSTRAINT "ner_analysis_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ner_installments" ADD CONSTRAINT "ner_installments_enrollment_id_ner_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."ner_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ner_search_checks" ADD CONSTRAINT "ner_search_checks_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ner_subscription_bindings" ADD CONSTRAINT "ner_subscription_bindings_enrollment_id_ner_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."ner_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_of_kin_private_identities" ADD CONSTRAINT "next_of_kin_private_identities_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orsa_bulk_sms_recipients" ADD CONSTRAINT "orsa_bulk_sms_recipients_run_id_orsa_bulk_sms_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."orsa_bulk_sms_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activation_requests" ADD CONSTRAINT "plan_activation_requests_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activation_requests" ADD CONSTRAINT "plan_activation_requests_contact_id_plan_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."plan_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assets" ADD CONSTRAINT "plan_assets_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_contacts" ADD CONSTRAINT "plan_contacts_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_discovery_items" ADD CONSTRAINT "plan_discovery_items_session_id_plan_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."plan_discovery_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_discovery_items" ADD CONSTRAINT "plan_discovery_items_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_discovery_items" ADD CONSTRAINT "plan_discovery_items_saved_plan_asset_id_plan_assets_id_fk" FOREIGN KEY ("saved_plan_asset_id") REFERENCES "public"."plan_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_discovery_sessions" ADD CONSTRAINT "plan_discovery_sessions_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_documents" ADD CONSTRAINT "plan_documents_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_letters" ADD CONSTRAINT "plan_letters_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_wishes" ADD CONSTRAINT "plan_wishes_plan_id_heart_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."heart_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_milestone_deliveries" ADD CONSTRAINT "referral_milestone_deliveries_case_referral_id_case_referrals_id_fk" FOREIGN KEY ("case_referral_id") REFERENCES "public"."case_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_family_authorizations_membership_idx" ON "case_family_authorizations" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_family_authorizations_active_unique" ON "case_family_authorizations" USING btree ("membership_id") WHERE "case_family_authorizations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "case_family_memberships_user_idx" ON "case_family_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "case_family_memberships_certificate_idx" ON "case_family_memberships" USING btree ("certificate_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "case_family_memberships_case_user_unique" ON "case_family_memberships" USING btree ("certificate_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_referrals_one_per_certificate_idx" ON "case_referrals" USING btree ("certificate_id");--> statement-breakpoint
CREATE INDEX "case_referrals_company_status_idx" ON "case_referrals" USING btree ("referral_company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "case_tasks_certificate_task_unique" ON "case_tasks" USING btree ("certificate_id","task_key");--> statement-breakpoint
CREATE INDEX "certificate_access_requests_company_status_idx" ON "certificate_access_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "certificate_access_requests_notice_idx" ON "certificate_access_requests" USING btree ("notice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_access_requests_active_requester_idx" ON "certificate_access_requests" USING btree ("notice_id","requester_user_id") WHERE "certificate_access_requests"."status" in ('pending', 'approved');--> statement-breakpoint
CREATE INDEX "certificates_user_submitted_idx" ON "certificates" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_death_notices_account_company_active_idx" ON "company_death_notices" USING btree ("account_id","company_id") WHERE "company_death_notices"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "company_death_notices_company_status_idx" ON "company_death_notices" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "company_directory_domain_idx" ON "company_directory" USING btree ("official_domain");--> statement-breakpoint
CREATE INDEX "company_directory_search_idx" ON "company_directory" USING btree ("status","name");--> statement-breakpoint
CREATE UNIQUE INDEX "company_memberships_company_user_idx" ON "company_memberships" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_memberships_user_status_idx" ON "company_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "company_notification_audit_notice_idx" ON "company_notification_audit_events" USING btree ("notice_id","created_at");--> statement-breakpoint
CREATE INDEX "company_notification_audit_company_idx" ON "company_notification_audit_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "concierge_inquiries_created_idx" ON "concierge_inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "concierge_inquiries_source_created_idx" ON "concierge_inquiries" USING btree ("source_hash","created_at");--> statement-breakpoint
CREATE INDEX "death_certificate_invites_certificate_idx" ON "death_certificate_invites" USING btree ("certificate_id","created_at");--> statement-breakpoint
CREATE INDEX "death_certificate_invites_status_expiry_idx" ON "death_certificate_invites" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "death_certificate_invites_one_active_idx" ON "death_certificate_invites" USING btree ("certificate_id") WHERE "death_certificate_invites"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "document_account_links_document_account_idx" ON "document_account_links" USING btree ("document_id","account_id");--> statement-breakpoint
CREATE INDEX "document_account_links_account_idx" ON "document_account_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "family_document_notices_unseen_case_idx" ON "family_document_notices" USING btree ("certificate_id","seen_at","created_at");--> statement-breakpoint
CREATE INDEX "family_invitation_challenges_invitation_idx" ON "family_invitation_challenges" USING btree ("invitation_id","consumed_at");--> statement-breakpoint
CREATE INDEX "family_invitation_challenges_email_idx" ON "family_invitation_challenges" USING btree ("email","expires_at");--> statement-breakpoint
CREATE INDEX "hard_asset_valuation_attachments_valuation_idx" ON "hard_asset_valuation_attachments" USING btree ("valuation_id");--> statement-breakpoint
CREATE INDEX "hard_asset_valuation_attachments_created_by_idx" ON "hard_asset_valuation_attachments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "hard_asset_valuations_created_idx" ON "hard_asset_valuations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hard_asset_valuations_category_idx" ON "hard_asset_valuations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "hard_asset_valuations_status_idx" ON "hard_asset_valuations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "household_billing_operations_household_status_idx" ON "household_billing_operations" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "household_billing_operations_reconciliation_idx" ON "household_billing_operations" USING btree ("status","reconciliation_next_attempt_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "household_billing_operations_pending_target_idx" ON "household_billing_operations" USING btree ("member_id","target_status") WHERE "household_billing_operations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "household_members_household_status_idx" ON "household_members" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_email_idx" ON "household_members" USING btree ("household_id","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_active_email_unique" ON "household_members" USING btree ("normalized_email") WHERE "household_members"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_active_user_unique" ON "household_members" USING btree ("user_id") WHERE "household_members"."status" = 'active' and "household_members"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "marketplace_events_provider_created_idx" ON "marketplace_events" USING btree ("provider_id","created_at");--> statement-breakpoint
CREATE INDEX "ner_search_checks_case_date_idx" ON "ner_search_checks" USING btree ("certificate_id","requested_at");--> statement-breakpoint
CREATE INDEX "ner_search_checks_actor_date_idx" ON "ner_search_checks" USING btree ("actor_id","requested_at");--> statement-breakpoint
CREATE INDEX "ner_subscription_bindings_enrollment_state_idx" ON "ner_subscription_bindings" USING btree ("enrollment_id","state");--> statement-breakpoint
CREATE INDEX "ner_subscription_bindings_reconciliation_idx" ON "ner_subscription_bindings" USING btree ("state","reconciliation_next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ner_subscription_bindings_one_active_idx" ON "ner_subscription_bindings" USING btree ("enrollment_id") WHERE "ner_subscription_bindings"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "orsa_bulk_sms_recipients_run_phone_unique" ON "orsa_bulk_sms_recipients" USING btree ("run_id","phone");--> statement-breakpoint
CREATE INDEX "orsa_bulk_sms_recipients_pending_idx" ON "orsa_bulk_sms_recipients" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "orsa_bulk_sms_runs_status_idx" ON "orsa_bulk_sms_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orsa_email_campaign_delivery_once_idx" ON "orsa_email_campaign_deliveries" USING btree ("member_id","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orsa_email_campaign_email_template_once_idx" ON "orsa_email_campaign_deliveries" USING btree ("normalized_email","template_id");--> statement-breakpoint
CREATE INDEX "orsa_email_campaign_delivery_email_idx" ON "orsa_email_campaign_deliveries" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "orsa_warmup_attempts_created_idx" ON "orsa_email_warmup_attempts" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "orsa_legacy_purchases_user_idx" ON "orsa_legacy_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referral_companies_active_name_idx" ON "referral_companies" USING btree ("is_active","name");--> statement-breakpoint
CREATE INDEX "referral_companies_funeral_home_idx" ON "referral_companies" USING btree ("funeral_home_id");--> statement-breakpoint
CREATE INDEX "referral_companies_marketplace_idx" ON "referral_companies" USING btree ("marketplace_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_milestone_delivery_once_idx" ON "referral_milestone_deliveries" USING btree ("case_referral_id","milestone_key");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "users_funeral_home_idx" ON "users" USING btree ("funeral_home_id");