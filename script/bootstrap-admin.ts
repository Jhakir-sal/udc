import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../server/db";

const email = z.email().parse(process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase());
const password = process.env.ADMIN_SEED_PASSWORD;
if (!password || password.length < 12 || Buffer.byteLength(password) > 72 ||
    !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
  throw new Error("ADMIN_SEED_PASSWORD must be at least 12 characters, at most 72 UTF-8 bytes, and contain a special character.");
}

try {
  const hash = await bcrypt.hash(password, 12);
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const existing = await tx.execute(sql`SELECT 1 FROM users LIMIT 1`);
    if (existing.rows.length) {
      throw new Error("Admin bootstrap requires an empty users table; no accounts were changed.");
    }
    await tx.execute(sql`
      INSERT INTO users (email, first_name, last_name, role, password_hash, email_verified)
      VALUES (${email}, ${process.env.ADMIN_SEED_FIRST_NAME || "Admin"},
              ${process.env.ADMIN_SEED_LAST_NAME || "SAL"}, 'admin', ${hash}, true)
    `);
  });
  console.log("Initial admin created. Configure and verify MFA before use.");
} finally {
  await pool.end();
}
