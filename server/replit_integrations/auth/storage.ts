import { users, type User, type UpsertUser } from "@shared/models/auth";
import { isDemoAccountEmail, normalizeAccountEmail } from "@shared/demoAccounts";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const normalizedEmail = normalizeAccountEmail(userData.email);
    const persistedUser = {
      ...userData,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      isDemoAccount: isDemoAccountEmail(normalizedEmail),
    };
    const [user] = await db
      .insert(users)
      .values(persistedUser)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...persistedUser,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
