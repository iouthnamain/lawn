/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { assertTeamCanStoreBytes, TEAM_PLAN_STORAGE_LIMIT_BYTES } from "./billingHelpers";
import { createTestBackend } from "./test.setup";

const modules = import.meta.glob("./**/*.ts");

test("local storage policy requires team membership and no paid subscription", async () => {
  const t = await createTestBackend(modules);
  const owner = t.withIdentity(t.users.owner.identity);
  const { teamId } = await owner.mutation(api.teams.create, { name: "Garden" });
  const billing = await owner.query(api.billing.getTeamBilling, { teamId });
  expect(billing).toMatchObject({
    monthlyPriceUsd: 0,
    storageUsedBytes: 0,
    storageLimitBytes: TEAM_PLAN_STORAGE_LIMIT_BYTES.pro,
    subscriptionStatus: "selfhost",
    canManageBilling: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
  await expect(t.query(api.billing.getTeamBilling, { teamId })).rejects.toThrow(
    "Not authenticated",
  );
  await expect(
    t.withIdentity(t.users.outsider.identity).query(api.billing.getTeamBilling, { teamId }),
  ).rejects.toThrow("Not a team member");
  await expect(t.run((ctx) => assertTeamCanStoreBytes(ctx, teamId, 1))).resolves.toMatchObject({
    storageUsedBytes: 0,
  });
});

test("all teams share the disk budget including reserved uploads and failed originals", async () => {
  const t = await createTestBackend(modules);
  const first = await t
    .withIdentity(t.users.owner.identity)
    .mutation(api.teams.create, { name: "Garden" });
  const second = await t
    .withIdentity(t.users.stranger.identity)
    .mutation(api.teams.create, { name: "Orchard" });
  await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", { teamId: second.teamId, name: "Cuts" });
    for (const [status, fileSize] of [
      ["ready", TEAM_PLAN_STORAGE_LIMIT_BYTES.pro - 50],
      ["uploading", 10],
      ["failed", 20],
    ] as const) {
      await ctx.db.insert("videos", {
        projectId,
        uploadedByClerkId: t.users.stranger.id,
        uploaderName: "Stranger",
        title: status,
        publicId: `budget-${status}`,
        visibility: "private",
        status,
        workflowStatus: "review",
        fileSize,
      });
    }
  });
  await expect(
    t.run((ctx) => assertTeamCanStoreBytes(ctx, first.teamId, 20)),
  ).resolves.toMatchObject({ storageUsedBytes: 0 });
  await expect(t.run((ctx) => assertTeamCanStoreBytes(ctx, first.teamId, 21))).rejects.toThrow(
    "self-hosted storage budget is full",
  );
  const otherBilling = await t
    .withIdentity(t.users.stranger.identity)
    .query(api.billing.getTeamBilling, { teamId: second.teamId });
  expect(otherBilling.storageUsedBytes).toBe(TEAM_PLAN_STORAGE_LIMIT_BYTES.pro - 20);
});
