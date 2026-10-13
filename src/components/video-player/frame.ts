/** Frame-accurate stepping math. Times are seconds; frame indexes start at 0. */

export const DEFAULT_FRAME_RATE = 30;

const COMMON_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120] as const;
const MIN_PLAUSIBLE_FRAME_RATE = 10;
const MAX_PLAUSIBLE_FRAME_RATE = 240;
/** Absorbs float error from `time * fps` round-trips on exact frame boundaries. */
const FRAME_EPSILON = 1e-6;

export function resolveFrameRate(candidate?: number | null): number {
  if (
    typeof candidate !== "number" ||
    !Number.isFinite(candidate) ||
    candidate < MIN_PLAUSIBLE_FRAME_RATE ||
    candidate > MAX_PLAUSIBLE_FRAME_RATE
  ) {
    return DEFAULT_FRAME_RATE;
  }
  let nearest: number | undefined;
  for (const rate of COMMON_FRAME_RATES) {
    if (nearest === undefined || Math.abs(candidate - rate) < Math.abs(candidate - nearest)) {
      nearest = rate;
    }
  }
  // Snap only near-misses (e.g. rates measured from presented frames); keep
  // plausible non-standard rates untouched.
  if (nearest !== undefined && Math.abs(candidate - nearest) <= nearest * 0.005) {
    return nearest;
  }
  return candidate;
}

export function frameIndexAtTime(timeSeconds: number, frameRate: number): number {
  const fps = resolveFrameRate(frameRate);
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) return 0;
  return Math.max(0, Math.floor(timeSeconds * fps + FRAME_EPSILON));
}

export function timeAtFrameIndex(frameIndex: number, frameRate: number): number {
  const fps = resolveFrameRate(frameRate);
  if (!Number.isFinite(frameIndex) || frameIndex <= 0) return 0;
  return frameIndex / fps;
}

/**
 * Time one or more frames from `currentTime`. The result always lands on a
 * frame boundary: from a mid-frame time, forward goes to the next frame and
 * back goes to the frame before the displayed one.
 */
export function steppedTime(
  currentTime: number,
  deltaFrames: number,
  frameRate: number,
  duration?: number,
): number {
  const fps = resolveFrameRate(frameRate);
  const start = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const targetFrame = Math.max(0, frameIndexAtTime(start, fps) + Math.round(deltaFrames));
  const stepped = targetFrame / fps;
  if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) {
    return Math.min(stepped, duration);
  }
  return stepped;
}

/** SMPTE-style `HH:MM:SS:FF` timecode for the frame displayed at `timeSeconds`. */
export function formatTimecode(timeSeconds: number, frameRate: number): string {
  const fps = resolveFrameRate(frameRate);
  const time = Number.isFinite(timeSeconds) && timeSeconds > 0 ? timeSeconds : 0;
  const totalSeconds = Math.floor(time);
  const nominalRate = Math.round(fps);
  const frame = Math.min(
    nominalRate - 1,
    Math.max(0, Math.floor((time - totalSeconds) * fps + FRAME_EPSILON)),
  );
  const pad = (value: number) => value.toString().padStart(2, "0");
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
}

type PresentedFrameSample = { mediaTime: number; presentedFrames: number };

/** Frame rate implied by two `requestVideoFrameCallback` samples, or null. */
export function estimateFrameRate(
  previous: PresentedFrameSample | null,
  current: PresentedFrameSample | null,
): number | null {
  if (!previous || !current) return null;
  const frameDelta = current.presentedFrames - previous.presentedFrames;
  const timeDelta = current.mediaTime - previous.mediaTime;
  if (frameDelta <= 0 || timeDelta <= 0) return null;
  const estimated = frameDelta / timeDelta;
  if (estimated < MIN_PLAUSIBLE_FRAME_RATE || estimated > MAX_PLAUSIBLE_FRAME_RATE) return null;
  return resolveFrameRate(estimated);
}
