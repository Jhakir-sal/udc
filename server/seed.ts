import { db } from "./db";
import { certificates, connectedAccounts, notifications } from "@shared/schema";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const OLD_TO_NEW_CATEGORY: Record<string, string> = {
  telecommunications: "miscellaneous",
  utilities: "real_estate",
  insurance: "financial",
  government: "protected_information",
  healthcare: "protected_information",
  other: "miscellaneous",
};

export async function migrateOldCategories() {
  try {
    const tablesToFix = ["connected_accounts", "credit_pull_results", "service_providers"];
    for (const table of tablesToFix) {
      try {
        const colInfo = await db.execute(
          sql.raw(`SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'category'`)
        );
        if (colInfo.rows.length === 0) continue;

        const isText = colInfo.rows[0].data_type === 'text' || colInfo.rows[0].udt_name === 'text';

        if (isText) {
          for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW_CATEGORY)) {
            await db.execute(
              sql.raw(`UPDATE "${table}" SET category = '${newVal}' WHERE category = '${oldVal}'`)
            );
          }
          console.log(`Migrated old category values in ${table} (text column)`);
        } else {
          const hasOldVals = await db.execute(
            sql.raw(`SELECT count(*) as cnt FROM "${table}" WHERE category::text IN ('telecommunications','utilities','insurance','government','healthcare','other')`)
          );
          if (Number(hasOldVals.rows[0].cnt) > 0) {
            for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW_CATEGORY)) {
              await db.execute(
                sql.raw(`UPDATE "${table}" SET category = '${newVal}' WHERE category::text = '${oldVal}'`)
              );
            }
            console.log(`Migrated old category values in ${table} (enum column)`);
          }
        }
      } catch (e: any) {
        if (!e.message?.includes('does not exist')) {
          console.log(`Note: Could not check ${table} for old categories:`, e.message?.substring(0, 80));
        }
      }
    }
  } catch (error: any) {
    console.error("Category migration error:", error.message);
  }
}

async function ensureAccountSyncColumns() {
  const columnsToAdd = [
    { column: "added_by", type: "text" },
    { column: "responsible_party", type: "text" },
    { column: "completed_by", type: "text" },
  ];
  for (const { column, type } of columnsToAdd) {
    try {
      const exists = await db.execute(
        sql.raw(`SELECT 1 FROM information_schema.columns WHERE table_name = 'connected_accounts' AND column_name = '${column}'`)
      );
      if (exists.rows.length === 0) {
        await db.execute(sql.raw(`ALTER TABLE connected_accounts ADD COLUMN ${column} ${type}`));
        console.log(`Added column ${column} to connected_accounts`);
      }
    } catch (e: any) {
      console.log(`Note: Could not add ${column}:`, e.message?.substring(0, 80));
    }
  }
}

async function ensureSalNotificationsTable() {
  try {
    const exists = await db.execute(
      sql.raw(`SELECT 1 FROM information_schema.tables WHERE table_name = 'sal_notifications'`)
    );
    if (exists.rows.length === 0) {
      await db.execute(sql.raw(`
        CREATE TABLE sal_notifications (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          user_email VARCHAR(255),
          user_name VARCHAR(255),
          case_id VARCHAR,
          deceased_name VARCHAR(255),
          payload TEXT,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `));
      console.log("Created sal_notifications table");
    }
  } catch (e: any) {
    console.log("Note: Could not ensure sal_notifications table:", e.message?.substring(0, 80));
  }
}

async function ensureSmsMessagesTable() {
  try {
    const exists = await db.execute(
      sql.raw(`SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_messages'`)
    );
    if (exists.rows.length === 0) {
      await db.execute(sql.raw(`
        CREATE TABLE sms_messages (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          phone_number TEXT NOT NULL,
          contact_name TEXT,
          direction TEXT NOT NULL DEFAULT 'outbound',
          body TEXT NOT NULL,
          certificate_id VARCHAR,
          admin_user_id VARCHAR,
          admin_name TEXT,
          status TEXT NOT NULL DEFAULT 'sent',
          ringcentral_message_id TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `));
      console.log("Created sms_messages table");
    }
  } catch (e: any) {
    console.log("Note: Could not ensure sms_messages table:", e.message?.substring(0, 80));
  }
}

export async function seedDatabase() {
  try {
    await migrateOldCategories();
    await ensureAccountSyncColumns();
    await ensureSalNotificationsTable();
    await ensureSmsMessagesTable();

    console.log("Seed data disabled - platform uses real data only");
    return;

    const existingCertificates = await db.select().from(certificates);
    if (existingCertificates.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database with sample data...");

    // Create sample certificates
    const sampleCertificates = [
      {
        deceasedName: "Margaret Elizabeth Thompson",
        dateOfDeath: "2025-12-15",
        dateOfBirth: "1948-03-22",
        certificateNumber: "CA-2025-78432",
        issuingAuthority: "California Dept of Public Health",
        status: "verified" as const,
        blockchainHash: `0x${randomUUID().replace(/-/g, '')}`,
      },
      {
        deceasedName: "Robert James Wilson",
        dateOfDeath: "2026-01-08",
        dateOfBirth: "1955-07-14",
        certificateNumber: "NY-2026-12098",
        issuingAuthority: "New York State DOH",
        status: "processing" as const,
        blockchainHash: `0x${randomUUID().replace(/-/g, '')}`,
      },
      {
        deceasedName: "Patricia Ann Rodriguez",
        dateOfDeath: "2026-01-28",
        dateOfBirth: "1962-11-05",
        certificateNumber: "TX-2026-45672",
        issuingAuthority: "Texas DSHS",
        status: "pending" as const,
        blockchainHash: `0x${randomUUID().replace(/-/g, '')}`,
      },
    ];

    const insertedCertificates = await db.insert(certificates).values(sampleCertificates).returning();

    // Create connected accounts for each certificate with realistic joint/protected accounts
    const accountTemplates = [
      // Joint bank accounts (J2 designation - protected)
      { 
        accountName: "Chase Bank", 
        accountType: "Joint Checking Account", 
        category: "financial" as const,
        isJoint: true,
        accountDesignation: "J2",
        survivorName: "James Thompson"
      },
      // Joint credit card (B2 designation - protected)
      { 
        accountName: "Wells Fargo", 
        accountType: "Joint Credit Card", 
        category: "financial" as const,
        isJoint: true,
        accountDesignation: "B2",
        survivorName: "James Thompson"
      },
      // Essential utilities (protected)
      { 
        accountName: "Pacific Gas & Electric", 
        accountType: "Electric & Gas Service", 
        category: "real_estate" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "City Water Department", 
        accountType: "Water Service", 
        category: "real_estate" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      // Non-protected accounts
      { 
        accountName: "Verizon Wireless", 
        accountType: "Mobile Plan", 
        category: "miscellaneous" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "AT&T", 
        accountType: "Internet Service", 
        category: "real_estate" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "State Farm", 
        accountType: "Auto Insurance", 
        category: "miscellaneous" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Blue Cross Blue Shield", 
        accountType: "Health Insurance", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Netflix", 
        accountType: "Streaming", 
        category: "subscriptions" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      // Joint investment account (protected)
      { 
        accountName: "Fidelity Investments", 
        accountType: "Joint Investment Account", 
        category: "financial" as const,
        isJoint: true,
        accountDesignation: "JTWROS",
        survivorName: "James Thompson"
      },
      { 
        accountName: "Social Security Administration", 
        accountType: "Benefits", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Dr. Sarah Mitchell, MD", 
        accountType: "Primary Care Physician", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Dr. James Patel, MD", 
        accountType: "Cardiologist", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Mercy General Hospital", 
        accountType: "Hospital / Medical Center", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "CVS Pharmacy", 
        accountType: "Pharmacy", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
      { 
        accountName: "Department of Motor Vehicles", 
        accountType: "Driver's License", 
        category: "protected_information" as const,
        isJoint: false,
        accountDesignation: null,
        survivorName: null
      },
    ];

    // Different survivor names for different certificates
    const survivorNames = ["James Thompson", "Linda Wilson", "Carlos Rodriguez"];

    for (let i = 0; i < insertedCertificates.length; i++) {
      const cert = insertedCertificates[i];
      const survivorName = survivorNames[i];
      const numAccounts = i === 0 ? accountTemplates.length : i === 1 ? 12 : 8;
      
      for (let j = 0; j < numAccounts && j < accountTemplates.length; j++) {
        const template = accountTemplates[j];
        const statuses = ["active", "pending_action", "suspended", "closed"] as const;
        // Protected accounts stay active or pending_action, never closed
        const isProtected = template.isJoint || 
          (template.category === "real_estate" && 
           (template.accountType.toLowerCase().includes("electric") || 
            template.accountType.toLowerCase().includes("water") ||
            template.accountType.toLowerCase().includes("gas")));
        
        let status: typeof statuses[number];
        if (isProtected) {
          status = i === 0 ? "active" : "pending_action";
        } else {
          status = i === 0 ? statuses[j % 4] : "pending_action";
        }
        
        await db.insert(connectedAccounts).values({
          certificateId: cert.id,
          accountName: template.accountName,
          accountType: template.accountType,
          category: template.category,
          accountNumber: `****${Math.floor(1000 + Math.random() * 9000)}`,
          isJoint: template.isJoint,
          accountDesignation: template.accountDesignation,
          survivorName: template.isJoint ? survivorName : null,
          status: status,
          selectedAction: !isProtected && status === "closed" ? "close" : !isProtected && status === "suspended" ? "suspend" : null,
          actionDate: !isProtected && (status === "closed" || status === "suspended") ? new Date() : null,
        });
      }
    }

    // Create notifications
    const notificationTemplates = [
      { type: "certificate_uploaded", message: (name: string) => `Death certificate for ${name} has been uploaded and encrypted on the blockchain.` },
      { type: "verification_complete", message: (name: string) => `Certificate verification completed for ${name}. All connected services can now be notified.` },
      { type: "account_notified", message: (name: string) => `Chase Bank has been notified about the death certificate for ${name}.` },
      { type: "account_notified", message: (name: string) => `Verizon Wireless has been notified about the death certificate for ${name}.` },
      { type: "action_taken", message: (name: string) => `Netflix subscription has been successfully closed for ${name}.` },
      { type: "protection_active", message: (name: string) => `Joint accounts for ${name} have been identified and protected. Surviving account holder has been notified.` },
      { type: "healthcare_provider_notified", message: (name: string) => `Healthcare providers and doctors have been notified about the passing of ${name}. This includes primary care physician, specialists, hospital, pharmacy, and health insurance provider. Medical records will be preserved per HIPAA requirements.` },
      { type: "account_notified", message: (name: string) => `Dr. Sarah Mitchell, MD (Primary Care Physician) has been notified about the death certificate for ${name}.` },
      { type: "account_notified", message: (name: string) => `Mercy General Hospital has been notified about the death certificate for ${name}.` },
    ];

    for (const cert of insertedCertificates) {
      for (const template of notificationTemplates) {
        await db.insert(notifications).values({
          certificateId: cert.id,
          message: template.message(cert.deceasedName),
          type: template.type,
          readAt: Math.random() > 0.5 ? new Date() : null,
        });
      }
    }

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

export async function ensureAdminUsers() {
  try {
    // Accounts that should always hold the admin role once they exist, but
    // never get a password seeded here (they must register/reset normally).
    const adminAccounts: Array<{ email: string; password?: string; firstName: string; lastName: string }> = [
      { email: "georgemilian1@gmail.com", firstName: "George", lastName: "Milian" },
    ];

    // A known initial admin password is only ever created when an operator
    // explicitly opts in via env vars (e.g. bootstrapping a brand new
    // environment). This repo must never ship a hardcoded default admin
    // password — see docs/REPLIT_MIGRATION_PLAN.md Phase 0.
    const seedAdminEmail = process.env.ADMIN_SEED_EMAIL;
    const seedAdminPassword = process.env.ADMIN_SEED_PASSWORD;
    if (seedAdminEmail && seedAdminPassword) {
      adminAccounts.push({
        email: seedAdminEmail,
        password: seedAdminPassword,
        firstName: process.env.ADMIN_SEED_FIRST_NAME || "Admin",
        lastName: process.env.ADMIN_SEED_LAST_NAME || "SAL",
      });
    }

    for (const admin of adminAccounts) {
      const existing = await db.execute(
        sql`SELECT id, role, password_hash FROM users WHERE email = ${admin.email}`
      );

      if (existing.rows.length > 0) {
        const user = existing.rows[0] as any;

        if (user.role !== "admin") {
          await db.execute(sql`UPDATE users SET role = 'admin' WHERE email = ${admin.email}`);
          console.log(`Promoted ${admin.email} to admin`);
        }
        if (admin.password && !user.password_hash) {
          const hash = await bcrypt.hash(admin.password, 10);
          await db.execute(sql`UPDATE users SET password_hash = ${hash} WHERE email = ${admin.email}`);
          console.log(`Set initial password for ${admin.email}`);
        }
      } else if (admin.password) {
        const hash = await bcrypt.hash(admin.password, 10);
        await db.execute(
          sql`INSERT INTO users (email, first_name, last_name, role, password_hash, phone_verified) VALUES (${admin.email}, ${admin.firstName}, ${admin.lastName}, 'admin', ${hash}, true)`
        );
        console.log(`Created admin account for ${admin.email}`);
      }
    }
  } catch (error: any) {
    console.error("Error ensuring admin users:", error.message);
  }
}
