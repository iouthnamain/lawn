import { convexTest } from "convex-test";
import schema from "./schema";

/** Real local users and sessions keep role tests on the production auth path. */
export async function createTestBackend(modules: Record<string, () => Promise<unknown>>) {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    async function account(email: string, name: string) {
      const id = await ctx.db.insert("users", { email, name });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id,
        expirationTime: Date.now() + 24 * 60 * 60 * 1000,
      });
      return { id, identity: { subject: `${id}|${sessionId}` } };
    }
    return {
      owner: await account("owner@example.com", "Owner"),
      user_1: await account("user@example.com", "User"),
      stranger: await account("stranger@example.com", "Stranger"),
      viewer: await account("viewer@example.com", "Viewer"),
      member: await account("member@example.com", "Member"),
      outsider: await account("outsider@example.com", "Outsider"),
    };
  });
  return Object.assign(t, { users });
}
