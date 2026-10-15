import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internalMutation } from "./functions";

function normalizeEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new ConvexError("Enter a valid email address.");
  }
  return normalizedEmail;
}

function credentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (password.length < 12) {
    throw new ConvexError("Use a password with at least 12 characters.");
  }
  return { id: normalizedEmail, secret: password };
}

// Internal actions are callable by the authenticated Convex deployment CLI,
// never by the public application API.
export const create = internalAction({
  args: { email: v.string(), password: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const account = credentials(args.email, args.password);
    const { user } = await createAccount(ctx, {
      provider: "password",
      account,
      profile: { email: account.id, name: args.name.trim() || account.id },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });
    return { userId: user._id, email: user.email };
  },
});

export const resetPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const account = credentials(args.email, args.password);
    await modifyAccountCredentials(ctx, { provider: "password", account });
    const existing = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: account.id },
    });
    if (!existing) throw new ConvexError("Account not found.");
    const { user } = existing;
    await invalidateSessions(ctx, { userId: user._id });
    return { userId: user._id, email: user.email };
  },
});

// Keep the user ID, password hash, and memberships when correcting a login address.
export const changeEmail = internalMutation({
  args: { oldEmail: v.string(), newEmail: v.string() },
  handler: async (ctx, args) => {
    const oldEmail = normalizeEmail(args.oldEmail);
    const newEmail = normalizeEmail(args.newEmail);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", oldEmail),
      )
      .unique();
    if (!account) throw new ConvexError("Account not found.");
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", newEmail))
      .unique();
    if (existing && existing._id !== account.userId)
      throw new ConvexError("Email already belongs to another account.");
    const targetAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", newEmail),
      )
      .unique();
    if (targetAccount && targetAccount._id !== account._id)
      throw new ConvexError("Email already belongs to another account.");
    await ctx.db.patch(account._id, { providerAccountId: newEmail });
    await ctx.db.patch(account.userId, { email: newEmail });
    for await (const membership of ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", account.userId))) {
      await ctx.db.patch(membership._id, { userEmail: newEmail });
    }
    return { userId: account.userId, email: newEmail };
  },
});
