import { mkdir, rm, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { ASSET_ID_PATTERN, verifyMediaCapability } from "./mediaCapabilities";
import { MediaQueue, type MediaJob } from "./mediaQueue";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const secret = required("LAWN_MEDIA_SECRET");
if (secret.length < 32) throw new Error("LAWN_MEDIA_SECRET must contain at least 32 characters");
const mediaDir = required("LAWN_MEDIA_DIR");
const dbPath = required("LAWN_MEDIA_DB");
const source = new URL(required("S3_PUBLIC_URL"));
const publicOrigin = new URL(required("LAWN_PUBLIC_URL")).origin;
await mkdir(mediaDir, { recursive: true, mode: 0o700 });
await mkdir(dirname(dbPath), { recursive: true, mode: 0o700 });
const queue = new MediaQueue(dbPath);
const maxInputBytes = Number(process.env.LAWN_MEDIA_MAX_INPUT_BYTES || 20 * 1024 ** 3);
const maxProcessMs = 6 * 60 * 60 * 1000;
let running: { id: string; controller: AbortController } | null = null;
let stopping = false;

function allowedInput(value: string) {
  const url = new URL(value);
  const prefix = source.pathname.replace(/\/$/, "");
  return (
    ["http:", "https:"].includes(url.protocol) &&
    url.origin === source.origin &&
    !url.username &&
    !url.password &&
    (prefix === "" || url.pathname.startsWith(`${prefix}/`))
  );
}
function serialize(job: MediaJob) {
  return {
    id: job.id,
    passthrough: job.videoId,
    status: job.status === "ready" ? "ready" : job.status === "errored" ? "errored" : "preparing",
    duration: job.duration ?? undefined,
    playback_ids: job.status === "ready" ? [{ id: job.id, policy: "signed" }] : [],
    errors: job.error ? { messages: [job.error] } : undefined,
  };
}
function authenticated(request: Request) {
  const provided = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
async function command(args: string[], signal: AbortSignal) {
  const child = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AV_LOG_FORCE_NOCOLOR: "1" },
  });
  const kill = () => child.kill("SIGKILL");
  signal.addEventListener("abort", kill, { once: true });
  if (signal.aborted) kill();
  // Drain stderr while encoding to avoid blocking on the pipe; retain a bounded tail.
  let stderr = "";
  const drain = (async () => {
    const reader = child.stderr.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        stderr = (stderr + new TextDecoder().decode(value)).slice(-4000);
      }
    } finally {
      reader.releaseLock();
    }
  })();
  try {
    const stdout = await new Response(child.stdout).text();
    const code = await child.exited;
    await drain;
    if (code !== 0) throw new Error(`Media encoder failed (${code}): ${stderr}`);
    return stdout;
  } finally {
    signal.removeEventListener("abort", kill);
  }
}
async function processJob(job: MediaJob, signal: AbortSignal) {
  if (!allowedInput(job.inputUrl))
    throw new Error("Original URL is outside the configured storage");
  const temporary = join(mediaDir, `${job.id}.working`);
  const destination = join(mediaDir, job.id);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { mode: 0o700 });
  try {
    const response = await fetch(job.inputUrl, { signal, redirect: "error" });
    if (!response.ok || !response.body) throw new Error(`Storage returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > maxInputBytes)
      throw new Error("Original exceeds encoder limit");
    const input = join(temporary, "source");
    const writer = Bun.file(input).writer();
    let bytes = 0;
    try {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxInputBytes) throw new Error("Original exceeds encoder limit");
          writer.write(value);
          await writer.flush();
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    } finally {
      await writer.end();
    }
    const probe: unknown = JSON.parse(
      await command(
        [
          "ffprobe",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,matroska,webm",
          "-show_entries",
          "format=duration",
          "-of",
          "json",
          input,
        ],
        signal,
      ),
    );
    if (
      !probe ||
      typeof probe !== "object" ||
      !("format" in probe) ||
      !probe.format ||
      typeof probe.format !== "object" ||
      !("duration" in probe.format)
    )
      throw new Error("Original has no duration");
    const duration = Number(probe.format.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid video duration");
    await command(
      [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-sc_threshold",
        "0",
        "-force_key_frames",
        "expr:gte(t,n_forced*4)",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        join(temporary, "segment%05d.ts"),
        join(temporary, "index.m3u8"),
      ],
      signal,
    );
    await command(
      [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm",
        "-i",
        input,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-threads",
        "1",
        join(temporary, "poster.jpg"),
      ],
      signal,
    );
    await rm(input, { force: true });
    if (signal.aborted || !queue.get(job.id)) throw new Error("Asset cancelled");
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
    queue.ready(job.id, duration);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
async function tick() {
  if (running || stopping) return;
  queue.recoverExhausted();
  const job = queue.claim();
  if (!job) return;
  const controller = new AbortController();
  running = { id: job.id, controller };
  const lease = setInterval(() => queue.renew(job.id), 20_000);
  const deadline = setTimeout(() => controller.abort(), maxProcessMs);
  try {
    await processJob(job, controller.signal);
  } catch (error) {
    queue.fail(job, error instanceof Error ? error.message : "Media processing failed");
    console.error(
      JSON.stringify({ event: "media_job_failed", assetId: job.id, attempt: job.attempts }),
    );
  } finally {
    clearInterval(lease);
    clearTimeout(deadline);
    running = null;
  }
}
const server = Bun.serve({
  hostname: process.env.LAWN_MEDIA_HOST || "127.0.0.1",
  port: Number(process.env.LAWN_MEDIA_PORT || 5299),
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": publicOrigin,
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      Vary: "Origin",
    };
    if (url.pathname.startsWith("/media/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
      const parts = url.pathname.split("/");
      const [, , assetId, expiry, token, file] = parts;
      if (
        parts.length !== 6 ||
        !assetId ||
        !token ||
        !file ||
        !verifyMediaCapability({ secret, assetId, expires: Number(expiry), token, file })
      )
        return new Response("Forbidden", { status: 403, headers: cors });
      if (queue.get(assetId)?.status !== "ready")
        return new Response("Not found", { status: 404, headers: cors });
      const content = Bun.file(join(mediaDir, assetId, file));
      if (!(await content.exists()))
        return new Response("Not found", { status: 404, headers: cors });
      return new Response(request.method === "HEAD" ? null : content, {
        headers: {
          ...cors,
          "Content-Type": file.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : file.endsWith(".ts")
              ? "video/mp2t"
              : "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": String(content.size),
        },
      });
    }
    if (!authenticated(request)) return new Response("Unauthorized", { status: 401 });
    if (request.method === "POST" && url.pathname === "/assets") {
      try {
        const data: unknown = await request.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("videoId" in data) ||
          typeof data.videoId !== "string" ||
          !data.videoId ||
          data.videoId.length > 128 ||
          !("inputUrl" in data) ||
          typeof data.inputUrl !== "string" ||
          !allowedInput(data.inputUrl)
        )
          return new Response("Invalid asset", { status: 400 });
        return Response.json(serialize(queue.enqueue(data.videoId, data.inputUrl)), {
          status: 202,
        });
      } catch {
        return new Response("Invalid asset", { status: 400 });
      }
    }
    const assetId = url.pathname.match(/^\/assets\/([a-f0-9]{32})$/)?.[1];
    if (!assetId || !ASSET_ID_PATTERN.test(assetId))
      return new Response("Not found", { status: 404 });
    const job = queue.get(assetId);
    if (!job) return new Response("Not found", { status: 404 });
    if (request.method === "GET") return Response.json(serialize(job));
    if (request.method === "DELETE") {
      if (running?.id === assetId) running.controller.abort();
      queue.delete(assetId);
      await rm(join(mediaDir, assetId), { recursive: true, force: true });
      return new Response(null, { status: 204 });
    }
    return new Response("Method not allowed", { status: 405 });
  },
});
const timer = setInterval(() => {
  void tick();
}, 1000);
void tick();
for (const signal of ["SIGTERM", "SIGINT"] satisfies NodeJS.Signals[])
  process.on(signal, () => {
    stopping = true;
    clearInterval(timer);
    running?.controller.abort();
    server.stop(true);
  });
console.info(JSON.stringify({ event: "media_service_started", port: server.port }));
