"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Kept until all old deployments have dropped the webhook route.
export const processWebhook = internalAction({
  args: { rawBody: v.string(), signature: v.optional(v.string()) },
  returns: v.object({ status: v.number(), message: v.string() }),
  handler: async () => ({ status: 410, message: "External media webhooks are disabled" }),
});
