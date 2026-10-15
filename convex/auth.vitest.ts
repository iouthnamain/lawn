/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seededAuth() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "owner@example.com", name: "Owner" });
    const firstSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    const nextSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return { userId, firstSessionId, nextSessionId };
  });
  return { t, ...seeded };
}

test("team access survives a new password session and uses the stored profile", async () => {
  const { t, userId, firstSessionId, nextSessionId } = await seededAuth();
  const first = t.withIdentity({
    subject: `${userId}|${firstSessionId}`,
    email: "forged@example.com",
    name: "Forged",
  });
  const team = await first.mutation(api.teams.create, { name: "Garden" });
  const next = t.withIdentity({ subject: `${userId}|${nextSessionId}` });
  expect(await next.query(api.auth.current, {})).toMatchObject({
    subject: userId,
    email: "owner@example.com",
    name: "Owner",
  });
  expect(await next.query(api.teams.list, {})).toMatchObject([{ _id: team.teamId, role: "owner" }]);
  const membership = await t.run((ctx) => ctx.db.query("teamMembers").first());
  expect(membership).toMatchObject({
    userClerkId: userId,
    userEmail: "owner@example.com",
    userName: "Owner",
  });
});

test("anonymous and revoked sessions cannot create teams", async () => {
  const { t, userId, firstSessionId } = await seededAuth();
  expect(await t.query(api.auth.current, {})).toBeNull();
  await expect(t.mutation(api.teams.create, { name: "Unauthorized" })).rejects.toThrow(
    "Not authenticated",
  );
  await t.run((ctx) => ctx.db.delete(firstSessionId));
  const revoked = t.withIdentity({ subject: `${userId}|${firstSessionId}` });
  expect(await revoked.query(api.auth.current, {})).toBeNull();
  await expect(revoked.mutation(api.teams.create, { name: "Unauthorized" })).rejects.toThrow(
    "Not authenticated",
  );
});

test("password registration is rejected on the server", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: "owner@example.com",
        password: "sufficiently-long-password",
        flow: "signUp",
      },
    }),
  ).rejects.toThrow("registration is managed");
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
});

test("operator provisioning hashes passwords and reset revokes existing sessions", async () => {
  const t = convexTest(schema, modules);
  await t.action(makeFunctionReference<"action">("localAccounts:create"), {
    email: " Owner@Example.com ",
    password: "original-password-123",
    name: "Owner",
  });
  const account = await t.run((ctx) => ctx.db.query("authAccounts").first());
  expect(account).toMatchObject({ providerAccountId: "owner@example.com", provider: "password" });
  expect(account?.secret).not.toBe("original-password-123");
  if (!account) throw new Error("Provisioning did not create an account");
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", { userId: account.userId, expirationTime: Date.now() + 60_000 }),
  );
  await t.action(makeFunctionReference<"action">("localAccounts:resetPassword"), {
    email: "owner@example.com",
    password: "replacement-password-456",
  });
  expect(await t.run((ctx) => ctx.db.get(sessionId))).toBeNull();
  const updated = await t.run((ctx) => ctx.db.get(account._id));
  expect(updated?.secret).not.toBe(account.secret);
});

test("operator email corrections preserve passwords and membership and reject collisions", async () => {
  const { t, userId, firstSessionId } = await seededAuth();
  const accountId = await t.run((ctx) =>
    ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: "owner@example.com",
      secret: "existing-password-hash",
    }),
  );
  const user = t.withIdentity({ subject: `${userId}|${firstSessionId}` });
  const team = await user.mutation(api.teams.create, { name: "Garden" });
  const changeEmail = makeFunctionReference<"mutation">("localAccounts:changeEmail");
  expect(
    await t.mutation(changeEmail, {
      oldEmail: "owner@example.com",
      newEmail: " Corrected@Example.com ",
    }),
  ).toEqual({ userId, email: "corrected@example.com" });
  expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
    userId,
    secret: "existing-password-hash",
    providerAccountId: "corrected@example.com",
  });
  expect(await user.query(api.auth.current, {})).toMatchObject({
    subject: userId,
    email: "corrected@example.com",
  });
  expect(await user.query(api.teams.getMembers, { teamId: team.teamId })).toMatchObject([
    { userEmail: "corrected@example.com", role: "owner" },
  ]);
  await t.run((ctx) => ctx.db.insert("users", { email: "taken@example.com" }));
  await expect(
    t.mutation(changeEmail, { oldEmail: "corrected@example.com", newEmail: "taken@example.com" }),
  ).rejects.toThrow("already belongs");
  expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
    providerAccountId: "corrected@example.com",
  });
});
