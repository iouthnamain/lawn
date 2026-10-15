/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestBackend } from "./test.setup";

const modules = import.meta.glob("./**/*.ts");

async function seedDashboardVideos() {
  const t = await createTestBackend(modules);
  const seeded = await t.run(async (ctx) => {
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
    const projectId = await ctx.db.insert("projects", { teamId, name: "Campaign" });
    const alphaId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.owner.id,
      uploaderName: "Owner",
      title: "alpha",
      visibility: "public",
      publicId: "alpha",
      status: "ready",
      workflowStatus: "review",
    });
    const retiredId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.owner.id,
      uploaderName: "Owner",
      title: "aardvark retired version",
      visibility: "public",
      publicId: "retired",
      status: "ready",
      workflowStatus: "review",
    });
    const gammaId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.owner.id,
      uploaderName: "Owner",
      title: "gamma",
      visibility: "public",
      publicId: "gamma",
      status: "ready",
      workflowStatus: "review",
    });
    await ctx.db.patch(retiredId, { supersededByVideoId: gammaId });
    const betaId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.owner.id,
      uploaderName: "Owner",
      title: "beta",
      visibility: "public",
      publicId: "beta",
      status: "ready",
      workflowStatus: "review",
    });
    const beta = await ctx.db.get(betaId);
    return {
      teamId,
      projectId,
      alphaId,
      retiredId,
      gammaId,
      betaId,
      newestHeadUploadedAt: beta!._creationTime,
    };
  });
  return { t, seeded };
}

test("video dashboard sorting defaults to newest heads only", async () => {
  const { t, seeded } = await seedDashboardVideos();
  const result = await t.withIdentity(t.users.owner.identity).query(api.videos.list, {
    projectId: seeded.projectId,
    paginationOpts: { cursor: null, numItems: 10 },
  });

  expect(result.page.map((video) => video._id)).toEqual([
    seeded.betaId,
    seeded.gammaId,
    seeded.alphaId,
  ]);
  expect(result.page.map((video) => video._id)).not.toContain(seeded.retiredId);
});

test("alphabetical video sorting stays correct across pages and excludes superseded versions", async () => {
  const { t, seeded } = await seedDashboardVideos();
  const authed = t.withIdentity(t.users.owner.identity);
  const first = await authed.query(api.videos.list, {
    projectId: seeded.projectId,
    sort: "alphabetical",
    paginationOpts: { cursor: null, numItems: 2 },
  });
  const second = await authed.query(api.videos.list, {
    projectId: seeded.projectId,
    sort: "alphabetical",
    paginationOpts: { cursor: first.continueCursor, numItems: 2 },
  });

  expect(first.isDone).toBe(false);
  expect([...first.page, ...second.page].map((video) => video.title)).toEqual([
    "alpha",
    "beta",
    "gamma",
  ]);
  expect([...first.page, ...second.page].map((video) => video._id)).not.toContain(seeded.retiredId);
});

test("folder recency uses its newest direct video without stored metadata", async () => {
  const { t, seeded } = await seedDashboardVideos();
  const projects = await t
    .withIdentity(t.users.owner.identity)
    .query(api.projects.list, { teamId: seeded.teamId });

  expect(projects).toHaveLength(1);
  expect(projects[0].lastUploadedAt).toBe(seeded.newestHeadUploadedAt);
});
