import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, pgEnum, timestamp, varchar, text, boolean, integer } from "drizzle-orm/pg-core";

// User role enum for access control
export const userRoleEnum = pgEnum("user_role", [
  "user",           // Standard user - upload and manage their certificates
  "admin",          // Steps After Life team - full platform access
  "funeral_home",   // Funeral home staff - create certificates via API
  "planner"         // HeartPlan pre-death planner - manages their own HeartPlan
]);

// ID verification status enum
export const idVerificationStatusEnum = pgEnum("id_verification_status", [
  "not_started",
  "pending",
  "verified",
  "failed"
]);

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").notNull().default("user"),
  // Enables tightly allowlisted, synthetic-only product demonstrations. This
  // is deliberately independent from role/permissions.
  isDemoAccount: boolean("is_demo_account").notNull().default(false),
  funeralHomeId: varchar("funeral_home_id"),
  // Authentication fields
  passwordHash: varchar("password_hash"),
  // Phone verification
  phoneNumber: varchar("phone_number"),
  phoneVerified: boolean("phone_verified").default(false),
  phoneVerificationCode: varchar("phone_verification_code"),
  phoneVerificationExpiry: timestamp("phone_verification_expiry"),
  phoneEnrollmentAttempts: integer("phone_enrollment_attempts").notNull().default(0),
  phoneEnrollmentWindowStartedAt: timestamp("phone_enrollment_window_started_at"),
  // Two-factor authentication (opt-in, separate from phone verification)
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerificationCode: varchar("email_verification_code"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  // Stripe ID verification
  idVerificationStatus: idVerificationStatusEnum("id_verification_status").default("not_started"),
  stripeVerificationSessionId: varchar("stripe_verification_session_id"),
  idVerifiedAt: timestamp("id_verified_at"),
  idVerifiedName: varchar("id_verified_name"),
  // Manual concierge override of ID verification
  idOverrideBy: varchar("id_override_by"),
  idOverrideByName: varchar("id_override_by_name"),
  idOverrideAt: timestamp("id_override_at"),
  idOverrideNote: text("id_override_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("users_funeral_home_idx").on(table.funeralHomeId),
]);

// Funeral homes table - organizations that can create death certificates
export const funeralHomes = pgTable("funeral_homes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  licenseNumber: text("license_number").notNull().unique(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  apiKey: text("api_key").notNull().unique(),
  isActive: varchar("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type FuneralHome = typeof funeralHomes.$inferSelect;
export type InsertFuneralHome = typeof funeralHomes.$inferInsert;
