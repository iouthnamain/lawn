import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireTeamAccess } from "./auth";
import { getTeamStorageUsedBytes, TEAM_PLAN_STORAGE_LIMIT_BYTES } from "./billingHelpers";

export const getTeamBilling = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const { membership } = await requireTeamAccess(ctx, teamId);
    return {
      plan: "pro" as const,
      monthlyPriceUsd: 0,
      storageLimitBytes: TEAM_PLAN_STORAGE_LIMIT_BYTES.pro,
      storageUsedBytes: await getTeamStorageUsedBytes(ctx, teamId),
      hasActiveSubscription: true,
      subscriptionStatus: "selfhost",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      role: membership.role,
      canManageBilling: false,
    };
  },
});
