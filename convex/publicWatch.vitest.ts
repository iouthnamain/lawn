/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createVersionRecord } from "./videos";
import { createTestBackend } from "./test.setup";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seedPublicStack() {
  const t = await createTestBackend(modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: t.users.user_1.id,
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: t.users.user_1.id,
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "admin",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      title: "First cut",
      visibility: "public",
      publicId: "watch-v1",
      status: "ready",
      muxPlaybackId: "playback-v1",
      workflowStatus: "review",
    });
    return { teamId, projectId, v1 };
  });

  // v2 becomes the stack head. insertVersionRecord starts it at status
  // "uploading" and inherits the head's "public" visibility.
  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      publicId: "watch-v2",
    }),
  );

  return { t, ...seeded, v2 };
}

test("serves the latest ready version when the shared head is still processing", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  // The head (v2) is still processing, so both the head's and the older
  // version's public links should resolve to the ready v1 instead of failing.
  // getByPublicIdForDownload shares the resolver, so it must stay in lockstep.
  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result?.video?._id).toBe(v1);

    const download = await t.query(api.videos.getByPublicIdForDownload, { publicId });
    expect(download?.video?._id).toBe(v1);
  }

  // Sanity: v2 really is the not-ready head.
  const head = await t.run((ctx) => ctx.db.get(v2 as Id<"videos">));
  expect(head?.status).toBe("uploading");
});

test("each version link resolves to its own version once ready (browsing on)", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  await t.run(async (ctx) => {
    await ctx.db.patch(v2 as Id<"videos">, {
      status: "ready",
      muxPlaybackId: "playback-v2",
    });
  });

  const r1 = await t.query(api.videos.getByPublicId, { publicId: "watch-v1" });
  expect(r1?.video?._id).toBe(v1);
  expect(r1?.video?.versionNumber).toBe(1);

  const r2 = await t.query(api.videos.getByPublicId, { publicId: "watch-v2" });
  expect(r2?.video?._id).toBe(v2);
  expect(r2?.video?.versionNumber).toBe(2);
  expect(r2?.allowVersionBrowsing).toBe(true);

  // The switcher lists every public, ready version oldest-first.
  const versions = await t.query(api.videos.listPublicVersions, { publicId: "watch-v1" });
  expect(versions.map((version) => [version.versionNumber, version.isLatest])).toEqual([
    [1, false],
    [2, true],
  ]);
});

test("disabling version browsing collapses links to the latest version", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  await t.run(async (ctx) => {
    await ctx.db.patch(v2 as Id<"videos">, {
      status: "ready",
      muxPlaybackId: "playback-v2",
    });
  });

  await t.withIdentity(t.users.user_1.identity).mutation(api.videos.setPublicVersionBrowsing, {
    videoId: v1 as Id<"videos">,
    enabled: false,
  });

  // The flag is applied across every version in the stack.
  const flags = await t.run(async (ctx) => ({
    v1: (await ctx.db.get(v1 as Id<"videos">))?.allowPublicVersionBrowsing,
    v2: (await ctx.db.get(v2 as Id<"videos">))?.allowPublicVersionBrowsing,
  }));
  expect(flags.v1).toBe(false);
  expect(flags.v2).toBe(false);

  // With browsing off, every link resolves to the latest ready version...
  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result?.video?._id).toBe(v2);
    expect(result?.allowVersionBrowsing).toBe(false);
  }

  // ...and the switcher is empty.
  const versions = await t.query(api.videos.listPublicVersions, { publicId: "watch-v1" });
  expect(versions).toEqual([]);
});

test("setVisibility toggles every version in the stack and gates the public URL", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  await t.run(async (ctx) => {
    await ctx.db.patch(v2 as Id<"videos">, {
      status: "ready",
      muxPlaybackId: "playback-v2",
    });
  });

  await t
    .withIdentity(t.users.user_1.identity)
    .mutation(api.videos.setVisibility, { videoId: v2 as Id<"videos">, visibility: "private" });

  const afterPrivate = await t.run(async (ctx) => ({
    v1: await ctx.db.get(v1 as Id<"videos">),
    v2: await ctx.db.get(v2 as Id<"videos">),
  }));
  expect(afterPrivate.v1?.visibility).toBe("private");
  expect(afterPrivate.v2?.visibility).toBe("private");

  // Private disables the public watch link for every version in the stack.
  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result).toBeNull();
  }

  await t
    .withIdentity(t.users.user_1.identity)
    .mutation(api.videos.setVisibility, { videoId: v1 as Id<"videos">, visibility: "public" });

  const afterPublic = await t.run(async (ctx) => ({
    v1: await ctx.db.get(v1 as Id<"videos">),
    v2: await ctx.db.get(v2 as Id<"videos">),
  }));
  expect(afterPublic.v1?.visibility).toBe("public");
  expect(afterPublic.v2?.visibility).toBe("public");
});

test("reports processing when a public video has no ready version yet", async () => {
  const t = await createTestBackend(modules);
  await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: t.users.user_1.id,
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", { teamId, name: "Campaign" });
    await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      title: "Fresh upload",
      visibility: "public",
      publicId: "processing-v1",
      status: "processing",
      workflowStatus: "review",
    });
  });

  const result = await t.query(api.videos.getByPublicId, { publicId: "processing-v1" });
  expect(result?.processing).toBe(true);
  expect(result?.video).toBeNull();
  expect(result?.title).toBe("Fresh upload");
});

test("is unavailable when the only public version failed", async () => {
  const t = await createTestBackend(modules);
  await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: t.users.user_1.id,
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", { teamId, name: "Campaign" });
    await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      title: "Broken upload",
      visibility: "public",
      publicId: "failed-v1",
      status: "failed",
      workflowStatus: "review",
    });
  });

  const result = await t.query(api.videos.getByPublicId, { publicId: "failed-v1" });
  expect(result).toBeNull();
});

test("returns null for an unknown public id", async () => {
  const { t } = await seedPublicStack();
  const result = await t.query(api.videos.getByPublicId, { publicId: "does-not-exist" });
  expect(result).toBeNull();
});

test("dashboard aliases resolve public ids throughout the upload lifecycle", async () => {
  const { t, projectId } = await seedPublicStack();

  for (const status of ["uploading", "processing", "ready", "failed"] as const) {
    const videoId = await t.run((ctx) =>
      ctx.db.insert("videos", {
        projectId,
        uploadedByClerkId: t.users.user_1.id,
        uploaderName: "Owner",
        title: `${status} video`,
        visibility: "public",
        publicId: `alias-${status}`,
        status,
        workflowStatus: "review",
      }),
    );

    await expect(t.query(api.videos.getPublicIdByVideoId, { videoId })).resolves.toBe(
      `alias-${status}`,
    );
  }
});

test("dashboard aliases do not reveal private, missing, or malformed video ids", async () => {
  const { t, projectId } = await seedPublicStack();
  const privateVideoId = await t.run((ctx) =>
    ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      title: "Private video",
      visibility: "private",
      publicId: "private-alias",
      status: "ready",
      workflowStatus: "review",
    }),
  );
  const missingVideoId = await t.run(async (ctx) => {
    const videoId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: t.users.user_1.id,
      uploaderName: "Owner",
      title: "Deleted video",
      visibility: "public",
      publicId: "deleted-alias",
      status: "ready",
      workflowStatus: "review",
    });
    await ctx.db.delete(videoId);
    return videoId;
  });

  await expect(
    t.query(api.videos.getPublicIdByVideoId, { videoId: privateVideoId }),
  ).resolves.toBeNull();
  await expect(
    t.query(api.videos.getPublicIdByVideoId, { videoId: missingVideoId }),
  ).resolves.toBeNull();
  await expect(
    t.query(api.videos.getPublicIdByVideoId, { videoId: "not-a-convex-id" }),
  ).resolves.toBeNull();
});
