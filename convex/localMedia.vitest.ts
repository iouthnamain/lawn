/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { deleteVideoAndDependents, deleteVideoAndDependentsBatch } from "./videos";
import { createTestBackend } from "./test.setup";

const modules = import.meta.glob("./**/*.ts");

test("deleting a video schedules encoded media reclamation after the transaction", async () => {
  vi.useFakeTimers();
  try {
    const t = await createTestBackend(modules);
    const assetId = "a".repeat(32);
    const videoId = await t.run(async (ctx) => {
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
        role: "admin",
      });
      const projectId = await ctx.db.insert("projects", { teamId, name: "Videos" });
      return ctx.db.insert("videos", {
        projectId,
        title: "Clip",
        uploadedByClerkId: t.users.owner.id,
        uploaderName: "Owner",
        visibility: "private",
        publicId: "private-clip",
        status: "ready",
        workflowStatus: "review",
        muxAssetId: assetId,
        s3Key: "videos/original.mp4",
        s3MultipartUploadId: "multipart-session",
      });
    });
    await t.withIdentity(t.users.owner.identity).mutation(api.videos.remove, { videoId });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe("videoActions:deleteLocalMediaAsset");
    expect(jobs[0].args).toEqual([
      { assetId, s3Key: "videos/original.mp4", multipartUploadId: "multipart-session" },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("stack deletion carries media cleanup in its existing scheduler slot", async () => {
  vi.useFakeTimers();
  try {
    const t = await createTestBackend(modules);
    const assetId = "b".repeat(32);
    const videoId = await t.run(async (ctx) => {
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
        role: "admin",
      });
      const projectId = await ctx.db.insert("projects", { teamId, name: "Videos" });
      return ctx.db.insert("videos", {
        projectId,
        title: "Clip",
        uploadedByClerkId: t.users.owner.id,
        uploaderName: "Owner",
        visibility: "private",
        publicId: "private-clip",
        status: "ready",
        workflowStatus: "review",
        muxAssetId: assetId,
        s3Key: "videos/original.mp4",
        s3MultipartUploadId: "multipart-session",
      });
    });
    await t.withIdentity(t.users.owner.identity).mutation(api.videos.removeStack, { videoId });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe("videos:continueVideoDelete");
    expect(jobs[0].args).toEqual([
      {
        videoId,
        muxAssetId: assetId,
        s3Key: "videos/original.mp4",
        s3MultipartUploadId: "multipart-session",
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("folder and team deletion helpers retain all file references for asynchronous cleanup", async () => {
  vi.useFakeTimers();
  try {
    const t = await createTestBackend(modules);
    await t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", {
        name: "Garden",
        slug: "garden",
        ownerClerkId: t.users.owner.id,
        plan: "basic",
      });
      const projectId = await ctx.db.insert("projects", { teamId, name: "Videos" });
      for (const method of ["team", "folder"]) {
        const videoId = await ctx.db.insert("videos", {
          projectId,
          title: method,
          uploadedByClerkId: t.users.owner.id,
          uploaderName: "Owner",
          visibility: "private",
          publicId: method,
          status: method === "team" ? "ready" : "uploading",
          workflowStatus: "review",
          s3Key: `videos/${method}.mp4`,
        });
        if (method === "team") await deleteVideoAndDependents(ctx, videoId);
        else expect((await deleteVideoAndDependentsBatch(ctx, videoId, 10)).done).toBe(true);
      }
    });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.args)).toEqual([
      [{ s3Key: "videos/team.mp4", recheckOriginal: true }],
      [{ s3Key: "videos/folder.mp4", recheckOriginal: true }],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
