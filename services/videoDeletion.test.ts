import { expect, test } from "bun:test";
import { reclaimVideoFiles } from "../convex/videoDeletion";

const files = { assetId: "encoded", s3Key: "videos/original.mp4", multipartUploadId: "upload" };

test("normal deletion removes both stores and aborts multipart before deleting original", async () => {
  const calls: string[] = [];
  const remaining = await reclaimVideoFiles(files, {
    deleteAsset: async (id) => {
      calls.push(`asset:${id}`);
    },
    abortMultipart: async (key, id) => {
      calls.push(`abort:${key}:${id}`);
    },
    deleteOriginal: async (key) => {
      calls.push(`original:${key}`);
    },
  });
  expect(remaining).toEqual({});
  expect(calls).toContain("asset:encoded");
  expect(calls.indexOf("abort:videos/original.mp4:upload")).toBeLessThan(
    calls.indexOf("original:videos/original.mp4"),
  );
});
test("offline encoder does not prevent reclaiming original storage", async () => {
  let deleted = false;
  const remaining = await reclaimVideoFiles(files, {
    deleteAsset: async () => {
      throw new Error("offline");
    },
    abortMultipart: async () => {},
    deleteOriginal: async () => {
      deleted = true;
    },
  });
  expect(deleted).toBe(true);
  expect(remaining).toEqual({ assetId: "encoded" });
});
test("failed multipart cancellation still deletes original and retains both for retry", async () => {
  let deleted = false;
  const remaining = await reclaimVideoFiles(files, {
    deleteAsset: async () => {},
    abortMultipart: async () => {
      throw new Error("storage offline");
    },
    deleteOriginal: async () => {
      deleted = true;
    },
  });
  expect(deleted).toBe(true);
  expect(remaining).toEqual({ s3Key: files.s3Key, multipartUploadId: files.multipartUploadId });
});
test("original deletion failures retain cancellation and late-PUT recheck metadata", async () => {
  const remaining = await reclaimVideoFiles(
    { ...files, recheckOriginal: true },
    {
      deleteAsset: async () => {},
      abortMultipart: async () => {},
      deleteOriginal: async () => {
        throw new Error("storage offline");
      },
    },
  );
  expect(remaining).toEqual({
    s3Key: files.s3Key,
    multipartUploadId: files.multipartUploadId,
    recheckOriginal: true,
  });
});
