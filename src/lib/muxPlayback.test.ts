import assert from "node:assert/strict";
import test from "node:test";
import { loadHlsRuntime, selectMuxPlaybackSource, type MuxPlaybackRecovery } from "./muxPlayback";

const recovery: MuxPlaybackRecovery = {
  scopeKey: "video-a",
  playbackId: "playback-a",
  url: "https://lawn.example/media/asset/123/playback.signature/index.m3u8",
  posterUrl: "https://lawn.example/media/asset/123/thumbnail.signature/poster.jpg",
  revision: 2,
};
test("waits for an authorized media session", () => {
  assert.equal(
    selectMuxPlaybackSource({ scopeKey: "video-a", playbackId: "playback-a", recovery: null }),
    null,
  );
});
test("uses the matching authorized source", () => {
  assert.deepEqual(
    selectMuxPlaybackSource({ scopeKey: "video-a", playbackId: "playback-a", recovery }),
    {
      url: recovery.url,
      posterUrl: recovery.posterUrl,
      revision: 2,
    },
  );
});
test("does not reuse capabilities across routes or replaced assets", () => {
  assert.equal(
    selectMuxPlaybackSource({ scopeKey: "video-b", playbackId: "playback-a", recovery }),
    null,
  );
  assert.equal(
    selectMuxPlaybackSource({ scopeKey: "video-a", playbackId: "playback-b", recovery }),
    null,
  );
  assert.equal(selectMuxPlaybackSource({ scopeKey: "video-a", playbackId: null, recovery }), null);
});
test("does not import the HLS browser runtime during SSR", () =>
  assert.equal(loadHlsRuntime(), null));
