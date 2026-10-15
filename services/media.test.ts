import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaUrl, signMediaCapability, verifyMediaCapability } from "./mediaCapabilities";
import { MediaQueue } from "./mediaQueue";

const secret = "media-tests-only-01234567890123456789";
const assetId = "a".repeat(32);
test("capabilities reject tampering, expiration, traversal, and thumbnail privilege escalation", () => {
  const expires = 200;
  const token = signMediaCapability(secret, assetId, expires);
  const args = { secret, assetId, expires, token, file: "index.m3u8", now: 100 };
  expect(verifyMediaCapability(args)).toBe(true);
  expect(verifyMediaCapability({ ...args, file: "segment00001.ts" })).toBe(true);
  expect(verifyMediaCapability({ ...args, now: expires })).toBe(false);
  expect(verifyMediaCapability({ ...args, expires: 201 })).toBe(false);
  expect(verifyMediaCapability({ ...args, token: `${token.slice(0, -1)}X` })).toBe(false);
  expect(verifyMediaCapability({ ...args, assetId: "b".repeat(32) })).toBe(false);
  for (const file of [
    "../jobs.sqlite",
    "%2e%2e/source",
    "source",
    "/etc/passwd",
    "segment00001.ts/../source",
  ])
    expect(verifyMediaCapability({ ...args, file })).toBe(false);
  const thumbnail = signMediaCapability(secret, assetId, expires, "thumbnail");
  expect(verifyMediaCapability({ ...args, token: thumbnail, file: "poster.jpg" })).toBe(true);
  expect(verifyMediaCapability({ ...args, token: thumbnail })).toBe(false);
});
test("queue enqueues idempotently and recovers expired leases with bounded retries", () => {
  const queue = new MediaQueue(":memory:");
  try {
    const job = queue.enqueue("video-a", "https://storage.example/a");
    expect(queue.enqueue("video-a", "https://storage.example/b").id).toBe(job.id);
    expect(queue.claim(100, 10)?.attempts).toBe(1);
    expect(queue.claim(105, 10)).toBeNull();
    const retry = queue.claim(111, 10);
    expect(retry?.attempts).toBe(2);
    expect(queue.claim(122, 10)?.attempts).toBe(3);
    queue.recoverExhausted(133);
    expect(queue.get(job.id)?.status).toBe("errored");
    expect(queue.claim(134)).toBeNull();
    expect(queue.enqueue("video-a", "https://storage.example/new").status).toBe("queued");
    const again = queue.claim();
    if (!again) throw new Error("Expected retry");
    queue.ready(again.id, 2);
    expect(queue.enqueue("video-a", "https://storage.example/new").status).toBe("ready");
    queue.delete(job.id);
    expect(queue.get(job.id)).toBeNull();
  } finally {
    queue.close();
  }
});
test("persistent queue resumes work after reopening the database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lawn-queue-"));
  try {
    const queue = new MediaQueue(join(directory, "jobs.sqlite"));
    const id = queue.enqueue("video-a", "https://storage.example/a").id;
    queue.claim(100, 10);
    queue.close();
    const restored = new MediaQueue(join(directory, "jobs.sqlite"));
    expect(restored.claim(111)?.id).toBe(id);
    restored.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("real worker converts a video, enforces signed segments and posters, and deletes assets", async () => {
  const directory = await mkdtemp("/home/ina/mnt/labb-data/apps/lawn-data/media-test-");
  const original = join(directory, "original.mp4");
  const generate = Bun.spawn(
    [
      "ffmpeg",
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=15",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      original,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  expect(await generate.exited).toBe(0);
  const storage = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(Bun.file(original)),
  });
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port;
  reservation.stop(true);
  const origin = `http://127.0.0.1:${port}`;
  const worker = Bun.spawn([process.execPath, "run", "services/media.ts"], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      LAWN_MEDIA_PORT: String(port),
      LAWN_MEDIA_HOST: "127.0.0.1",
      LAWN_MEDIA_SECRET: secret,
      LAWN_MEDIA_DIR: join(directory, "media"),
      LAWN_MEDIA_DB: join(directory, "jobs.sqlite"),
      S3_PUBLIC_URL: storage.url.origin,
      LAWN_PUBLIC_URL: origin,
    },
  });
  const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
  try {
    let started = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fetch(origin + "/assets");
        started = true;
        break;
      } catch {
        await Bun.sleep(100);
      }
    }
    expect(started).toBe(true);
    expect((await fetch(origin + "/assets")).status).toBe(401);
    const denied = await fetch(origin + "/assets", {
      method: "POST",
      headers,
      body: JSON.stringify({ videoId: "test", inputUrl: "http://untrusted.example/video" }),
    });
    expect(denied.status).toBe(400);
    const response = await fetch(origin + "/assets", {
      method: "POST",
      headers,
      body: JSON.stringify({ videoId: "test", inputUrl: storage.url.origin + "/original.mp4" }),
    });
    expect(response.status).toBe(202);
    const asset = await response.json();
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(origin + "/assets/" + asset.id, { headers })).json();
      if (status.status === "errored") throw new Error(JSON.stringify(status));
      if (status.status === "ready") {
        expect(status.duration).toBeGreaterThan(1);
        ready = true;
        break;
      }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const manifestUrl = mediaUrl(origin, secret, asset.id, "index.m3u8");
    const manifest = await fetch(manifestUrl);
    expect(manifest.status).toBe(200);
    const text = await manifest.text();
    const segment = text.split("\n").find((line) => line.endsWith(".ts"));
    if (!segment) throw new Error("Missing HLS segment");
    expect(segment).toMatch(/^segment\d{5}\.ts$/);
    expect((await fetch(new URL(segment, manifestUrl))).status).toBe(200);
    expect(
      (
        await fetch(
          new URL(segment, manifestUrl).href.replace(/playback\.[a-f0-9]+/, "playback.invalid"),
        )
      ).status,
    ).toBe(403);
    expect((await fetch(mediaUrl(origin, secret, asset.id, "poster.jpg"))).status).toBe(200);
    expect(
      (
        await fetch(
          mediaUrl(origin, secret, asset.id, "poster.jpg").replace("poster.jpg", "index.m3u8"),
        )
      ).status,
    ).toBe(403);
    expect((await fetch(mediaUrl(origin, secret, asset.id, "index.m3u8", -1))).status).toBe(403);
    expect(
      (await fetch(origin + "/assets/" + asset.id, { headers, method: "DELETE" })).status,
    ).toBe(204);
    expect((await fetch(manifestUrl)).status).toBe(404);
  } finally {
    worker.kill("SIGTERM");
    await worker.exited;
    storage.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
