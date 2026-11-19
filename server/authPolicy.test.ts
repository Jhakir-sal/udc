import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/models/auth";
import {
  canonicalDestination,
  isAllowedAuthRedirect,
  permissionsFor,
  requiresMfa,
  sessionProfile,
} from "./authPolicy";

function user(role: User["role"], overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "person@example.com",
    firstName: "Test",
    lastName: "User",
    profileImageUrl: null,
    role,
    funeralHomeId: null,
    passwordHash: "secret-hash",
    phoneNumber: null,
    phoneVerified: false,
    phoneVerificationCode: "123456",
    phoneVerificationExpiry: new Date(),
    phoneEnrollmentAttempts: 0,
    phoneEnrollmentWindowStartedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    emailVerificationCode: "654321",
    emailVerificationExpiry: new Date(),
    idVerificationStatus: "not_started",
    stripeVerificationSessionId: null,
    idVerifiedAt: null,
    idVerifiedName: null,
    idOverrideBy: null,
    idOverrideByName: null,
    idOverrideAt: null,
    idOverrideNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("each server-owned role has one canonical workspace", () => {
  assert.equal(canonicalDestination(user("user")), "/");
  assert.equal(canonicalDestination(user("planner")), "/heartplan");
  assert.equal(canonicalDestination(user("admin")), "/admin");
  assert.equal(canonicalDestination(user("funeral_home")), "/funeral-home");
});

test("privileged and explicitly enrolled accounts require MFA", () => {
  assert.equal(requiresMfa(user("admin")), true);
  assert.equal(requiresMfa(user("funeral_home")), true);
  assert.equal(requiresMfa(user("planner")), false);
  assert.equal(requiresMfa(user("user", { twoFactorEnabled: true })), true);
});

test("admin permission includes partner tools but other roles stay scoped", () => {
  assert.ok(permissionsFor(user("admin")).includes("funeral-home:access"));
  assert.deepEqual(permissionsFor(user("funeral_home")), ["funeral-home:access"]);
  assert.ok(!permissionsFor(user("planner")).includes("admin:access"));
  assert.ok(!permissionsFor(user("user")).includes("admin:access"));
});

test("session profile never exposes credential or challenge material", () => {
  const profile = sessionProfile(user("admin"));
  assert.equal("passwordHash" in profile, false);
  assert.equal("phoneVerificationCode" in profile, false);
  assert.equal("phoneEnrollmentAttempts" in profile, false);
  assert.equal("emailVerificationCode" in profile, false);
  assert.equal(profile.destination, "/admin");
  assert.equal(profile.mfaRequired, true);
});

test("post-auth redirects use only the fixed allowlist", () => {
  for (const path of ["/", "/admin", "/heartplan", "/funeral-home"]) {
    assert.equal(isAllowedAuthRedirect(path), true);
  }
  for (const path of ["https://evil.example", "//evil.example", "/admin?next=https://evil.example", "/settings"]) {
    assert.equal(isAllowedAuthRedirect(path), false);
  }
});