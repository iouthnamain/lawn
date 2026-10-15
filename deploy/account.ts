export {};

// Feed JSON on stdin so account passwords never enter shell history or argv.
const mode = process.argv[2];
if (mode !== "create" && mode !== "resetPassword")
  throw new Error("Usage: bun deploy/account.ts create|resetPassword < private-account.json");
const data: unknown = JSON.parse(await Bun.stdin.text());
if (
  !data ||
  typeof data !== "object" ||
  !("email" in data) ||
  typeof data.email !== "string" ||
  !("password" in data) ||
  typeof data.password !== "string"
)
  throw new Error("Expected email and password");
if (mode === "create" && (!("name" in data) || typeof data.name !== "string"))
  throw new Error("Expected name");
const response = await fetch(`${process.env.CONVEX_SELF_HOSTED_URL}/api/action`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Convex ${process.env.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
  },
  body: JSON.stringify({ path: `localAccounts:${mode}`, args: data, format: "json" }),
});
const result: unknown = await response.json();
if (
  !response.ok ||
  !result ||
  typeof result !== "object" ||
  !("status" in result) ||
  result.status !== "success"
)
  throw new Error("Account operation failed. Check backend logs.");
console.log(`Account ${mode} succeeded.`);
