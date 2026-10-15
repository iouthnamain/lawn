import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { query, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Accounts are provisioned by the operator. Unverified email signup
        // would let someone claim the email on another person's team invite.
        if (params.flow !== "signIn") {
          throw new ConvexError("Account registration is managed by your Lawn operator.");
        }
        if (typeof params.email !== "string") {
          throw new ConvexError("Enter your email address.");
        }
        return { email: params.email.trim().toLowerCase() };
      },
    }),
  ],
});

export type AppUser = {
  subject: Id<"users">;
  email: string;
  name: string;
  pictureUrl?: string;
};

export function identityName(user: AppUser): string {
  return user.name || user.email;
}

export function identityEmail(user: AppUser): string {
  return user.email;
}

export function identityAvatarUrl(user: AppUser): string | undefined {
  return user.pictureUrl;
}

export async function getUser(ctx: QueryCtx | MutationCtx): Promise<AppUser | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  const userId = ctx.db.normalizeId("users", authUserId);
  if (!userId) return null;
  const authSessionId = await getAuthSessionId(ctx);
  if (!authSessionId) return null;
  const sessionId = ctx.db.normalizeId("authSessions", authSessionId);
  if (!sessionId) return null;
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId || session.expirationTime <= Date.now()) return null;
  const user = await ctx.db.get(userId);
  if (!user?.email) return null;
  return {
    subject: user._id,
    email: user.email,
    name: user.name ?? user.email,
    pictureUrl: user.image,
  };
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<AppUser> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Not authenticated");
  return user;
}

export const current = query({
  args: {},
  handler: async (ctx): Promise<AppUser | null> => getUser(ctx),
});

export async function getIdentity(ctx: ActionCtx): Promise<AppUser> {
  const user: AppUser | null = await ctx.runQuery(api.auth.current, {});
  if (!user) throw new ConvexError("Not authenticated");
  return user;
}

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

export async function requireTeamAccess(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) => q.eq("teamId", teamId).eq("userClerkId", user.subject))
    .unique();

  if (!membership) {
    throw new ConvexError("Not a team member");
  }

  if (requiredRole && ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
    throw new ConvexError(`Requires ${requiredRole} role or higher`);
  }

  return { user, membership };
}

export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new ConvexError("Project not found");
  }

  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", project.teamId).eq("userClerkId", user.subject),
    )
    .unique();

  if (!membership) {
    throw new ConvexError("Not a team member");
  }

  if (requiredRole && ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
    throw new ConvexError(`Requires ${requiredRole} role or higher`);
  }

  return { user, membership, project };
}

export async function requireVideoAccess(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const video = await ctx.db.get(videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  const project = await ctx.db.get(video.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", project.teamId).eq("userClerkId", user.subject),
    )
    .unique();

  if (!membership) {
    throw new ConvexError("Not a team member");
  }

  if (requiredRole && ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
    throw new ConvexError(`Requires ${requiredRole} role or higher`);
  }

  return { user, membership, project, video };
}
