import assert from "node:assert/strict";
import test from "node:test";
import { buildMuxPlaybackUrl, buildMuxThumbnailUrl } from "../../convex/mux";
import { verifyMediaCapability } from "../../services/mediaCapabilities";

test("server playback and poster URLs carry independently scoped media capabilities", () => {
  const originalPublic = process.env.LAWN_PUBLIC_URL;
  const originalSecret = process.env.LAWN_MEDIA_SECRET;
  process.env.LAWN_PUBLIC_URL = "https://lawn.example";
  process.env.LAWN_MEDIA_SECRET = "test-only-secret-not-a-real-secret";
  const id = "a".repeat(32);
  try {
    for (const build of [buildMuxPlaybackUrl, buildMuxThumbnailUrl]) {
      const url = new URL(build(id));
      const [, , assetId, expiry, token, file] = url.pathname.split("/");
      assert.equal(url.origin, "https://lawn.example");
      assert.equal(
        verifyMediaCapability({
          secret: process.env.LAWN_MEDIA_SECRET,
          assetId,
          expires: Number(expiry),
          token,
          file,
        }),
        true,
      );
    }
  } finally {
    if (originalPublic === undefined) delete process.env.LAWN_PUBLIC_URL;
    else process.env.LAWN_PUBLIC_URL = originalPublic;
    if (originalSecret === undefined) delete process.env.LAWN_MEDIA_SECRET;
    else process.env.LAWN_MEDIA_SECRET = originalSecret;
  }
});
