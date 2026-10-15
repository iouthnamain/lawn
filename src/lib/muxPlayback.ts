export type MuxPlaybackRecovery = {
  scopeKey: string;
  playbackId: string;
  url: string;
  posterUrl: string;
  revision: number;
};

export function selectMuxPlaybackSource({
  scopeKey,
  playbackId,
  recovery,
}: {
  scopeKey: string;
  playbackId: string | null | undefined;
  recovery: MuxPlaybackRecovery | null;
}) {
  if (!playbackId) return null;

  if (recovery?.scopeKey === scopeKey && recovery.playbackId === playbackId) {
    return {
      url: recovery.url,
      posterUrl: recovery.posterUrl,
      revision: recovery.revision,
    };
  }

  return null;
}

let hlsRuntimePromise: Promise<typeof import("hls.js")> | null = null;

export function prefetchMuxPlaybackManifest(playbackId: string) {
  void playbackId;
  // An asset ID cannot grant playback. Authorized sessions supply signed URLs.
}

export function loadHlsRuntime() {
  if (typeof window === "undefined") return null;
  if (hlsRuntimePromise) return hlsRuntimePromise;

  hlsRuntimePromise = import("hls.js").catch((error) => {
    hlsRuntimePromise = null;
    throw error;
  });
  return hlsRuntimePromise;
}

export function prefetchHlsRuntime() {
  loadHlsRuntime()?.catch(() => {
    // Best effort only; if this fails, the player will lazy-load on demand.
  });
}
