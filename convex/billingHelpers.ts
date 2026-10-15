import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const storageBudget = Number(process.env.LAWN_STORAGE_LIMIT_GIB ?? "400") * 1024 ** 3;
if (!Number.isFinite(storageBudget) || storageBudget <= 0) {
  throw new Error("LAWN_STORAGE_LIMIT_GIB must be a positive number");
}
export const TEAM_PLAN_STORAGE_LIMIT_BYTES = { basic: storageBudget, pro: storageBudget };
type BillingCtx = QueryCtx | MutationCtx;

export async function getTeamSubscriptionState(ctx: BillingCtx, teamId: Id<"teams">) {
  const team = await ctx.db.get(teamId);
  if (!team) throw new Error("Team not found");
  return { team, subscription: null, plan: "pro" as const, hasActiveSubscription: true };
}

export async function getTeamStorageUsedBytes(ctx: BillingCtx, teamId: Id<"teams">) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_team", (q) => q.eq("teamId", teamId));
  let total = 0;
  for await (const project of projects) {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", project._id));
    for await (const video of videos) total += Math.max(0, video.fileSize ?? 0);
  }
  return total;
}

export async function assertTeamHasActiveSubscription(ctx: BillingCtx, teamId: Id<"teams">) {
  return getTeamSubscriptionState(ctx, teamId);
}

export async function assertTeamCanStoreBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
  incomingBytes: number,
) {
  const state = await getTeamSubscriptionState(ctx, teamId);
  // One shared disk budget covers every team, including failed originals and pending uploads.
  let allocated = 0;
  for await (const video of ctx.db.query("videos")) {
    allocated += Math.max(0, video.fileSize ?? 0);
  }
  const storageUsedBytes = await getTeamStorageUsedBytes(ctx, teamId);
  if (allocated + Math.max(0, incomingBytes) > storageBudget) {
    throw new ConvexError(
      "The self-hosted storage budget is full. Delete old videos or ask the operator to increase it.",
    );
  }
  return { ...state, storageUsedBytes, storageLimitBytes: storageBudget };
}
