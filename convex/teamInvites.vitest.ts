/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestBackend } from "./test.setup";

const modules = import.meta.glob("./**/*.ts");

test("team owners can invite new members and identify existing members", async () => {
  const t = await createTestBackend(modules);
  const teamId = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: t.users.owner.id,
      plan: "basic",
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: t.users.owner.id,
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "owner",
    });

    return teamId;
  });

  const owner = t.withIdentity(t.users.owner.identity);

  const token = await owner.mutation(api.teams.inviteMember, {
    teamId,
    email: "invitee@example.com",
    role: "member",
  });

  expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
  expect(await owner.query(api.teams.getInvites, { teamId })).toMatchObject([
    {
      email: "invitee@example.com",
      invitedByName: "Owner",
      role: "member",
      token,
    },
  ]);

  await expect(
    owner.mutation(api.teams.inviteMember, {
      teamId,
      email: " OWNER@example.com ",
      role: "member",
    }),
  ).rejects.toMatchObject({
    data: "This person is already a member of this team.",
  });
});
