import { createHmac, timingSafeEqual } from "node:crypto";

export const ASSET_ID_PATTERN = /^[a-f0-9]{32}$/;
export const MEDIA_FILE_PATTERN = /^(?:index\.m3u8|poster\.jpg|segment\d{5}\.ts)$/;

type CapabilityScope = "playback" | "thumbnail";

export function signMediaCapability(
  secret: string,
  assetId: string,
  expires: number,
  scope: CapabilityScope = "playback",
) {
  if (!ASSET_ID_PATTERN.test(assetId) || !Number.isSafeInteger(expires))
    throw new Error("Invalid media capability");
  return `${scope}.${createHmac("sha256", secret).update(`${assetId}:${expires}:${scope}`).digest("hex")}`;
}

export function verifyMediaCapability({
  secret,
  assetId,
  expires,
  token,
  file,
  now = Math.floor(Date.now() / 1000),
}: {
  secret: string;
  assetId: string;
  expires: number;
  token: string;
  file: string;
  now?: number;
}) {
  if (
    !ASSET_ID_PATTERN.test(assetId) ||
    !MEDIA_FILE_PATTERN.test(file) ||
    !Number.isSafeInteger(expires) ||
    expires <= now
  )
    return false;
  const scope = token.split(".")[0];
  if (scope !== "playback" && scope !== "thumbnail") return false;
  if (scope === "thumbnail" && file !== "poster.jpg") return false;
  const expected = signMediaCapability(secret, assetId, expires, scope);
  const givenBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  return givenBytes.length === expectedBytes.length && timingSafeEqual(givenBytes, expectedBytes);
}

export function mediaUrl(
  publicUrl: string,
  secret: string,
  assetId: string,
  file: "index.m3u8" | "poster.jpg",
  lifetime = 3600,
) {
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const token = signMediaCapability(
    secret,
    assetId,
    expires,
    file === "poster.jpg" ? "thumbnail" : "playback",
  );
  return `${publicUrl.replace(/\/$/, "")}/media/${assetId}/${expires}/${token}/${file}`;
}
