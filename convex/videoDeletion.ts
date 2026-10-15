export type VideoFilesToDelete = {
  assetId?: string;
  s3Key?: string;
  multipartUploadId?: string;
  recheckOriginal?: boolean;
};

type DeletionOperations = {
  deleteAsset: (assetId: string) => Promise<unknown>;
  abortMultipart: (key: string, uploadId: string) => Promise<unknown>;
  deleteOriginal: (key: string) => Promise<unknown>;
};

/** Reclaim independent stores even when one is offline. Return only work to retry. */
export async function reclaimVideoFiles(
  files: VideoFilesToDelete,
  operations: DeletionOperations,
): Promise<VideoFilesToDelete> {
  const results = await Promise.allSettled([
    files.assetId ? operations.deleteAsset(files.assetId) : Promise.resolve(),
    (async () => {
      if (!files.s3Key) return;
      const errors: unknown[] = [];
      if (files.multipartUploadId) {
        try {
          await operations.abortMultipart(files.s3Key, files.multipartUploadId);
        } catch (error) {
          errors.push(error);
        }
      }
      // Delete after aborting so an upload that completed during cancellation is removed too.
      try {
        await operations.deleteOriginal(files.s3Key);
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "Original storage cleanup failed");
    })(),
  ]);
  return {
    ...(results[0].status === "rejected" ? { assetId: files.assetId } : {}),
    ...(results[1].status === "rejected"
      ? {
          s3Key: files.s3Key,
          multipartUploadId: files.multipartUploadId,
          recheckOriginal: files.recheckOriginal,
        }
      : {}),
  };
}
