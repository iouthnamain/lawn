"use node";

// The stored Mux field names remain compatible with existing video records.
// Encoding and delivery are handled entirely by the local media service.
import { mediaUrl, ASSET_ID_PATTERN } from "../services/mediaCapabilities";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export type LocalAsset = {
  id: string;
  passthrough: string;
  status: "preparing" | "ready" | "errored";
  duration?: number;
  playback_ids: Array<{ id: string; policy: "signed" }>;
  errors?: { messages: string[] };
};

function parseAsset(value: unknown): LocalAsset {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !ASSET_ID_PATTERN.test(value.id) ||
    !("passthrough" in value) ||
    typeof value.passthrough !== "string" ||
    !("status" in value) ||
    !["preparing", "ready", "errored"].includes(String(value.status))
  )
    throw new Error("Invalid response from local media service");
  const status = value.status;
  if (status !== "preparing" && status !== "ready" && status !== "errored")
    throw new Error("Invalid media status");
  const duration =
    "duration" in value && typeof value.duration === "number" && Number.isFinite(value.duration)
      ? value.duration
      : undefined;
  let messages: string[] = [];
  if (
    "errors" in value &&
    value.errors &&
    typeof value.errors === "object" &&
    "messages" in value.errors &&
    Array.isArray(value.errors.messages)
  )
    messages = value.errors.messages.filter((item): item is string => typeof item === "string");
  return {
    id: value.id,
    passthrough: value.passthrough,
    status,
    duration,
    playback_ids: status === "ready" ? [{ id: value.id, policy: "signed" }] : [],
    errors: messages.length ? { messages } : undefined,
  };
}
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${requireEnv("LAWN_MEDIA_URL").replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv("LAWN_MEDIA_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && !(method === "DELETE" && response.status === 404))
    throw new Error(`Local media service returned HTTP ${response.status}`);
  return response;
}
function assetPath(id: string) {
  if (!ASSET_ID_PATTERN.test(id)) throw new Error("Invalid local asset ID");
  return `/assets/${id}`;
}
export async function createMuxAssetFromInputUrl(videoId: string, inputUrl: string) {
  return parseAsset(await (await request("/assets", "POST", { videoId, inputUrl })).json());
}
export async function getMuxAsset(assetId: string) {
  return parseAsset(await (await request(assetPath(assetId))).json());
}
export async function deleteMuxAsset(assetId: string) {
  await request(assetPath(assetId), "DELETE");
}
export function buildMuxPlaybackUrl(playbackId: string): string {
  return mediaUrl(
    requireEnv("LAWN_PUBLIC_URL"),
    requireEnv("LAWN_MEDIA_SECRET"),
    playbackId,
    "index.m3u8",
  );
}
export function buildMuxThumbnailUrl(playbackId: string): string {
  return mediaUrl(
    requireEnv("LAWN_PUBLIC_URL"),
    requireEnv("LAWN_MEDIA_SECRET"),
    playbackId,
    "poster.jpg",
  );
}
