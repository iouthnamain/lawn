import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

export type MediaJob = {
  id: string;
  videoId: string;
  inputUrl: string;
  status: "queued" | "processing" | "ready" | "errored";
  attempts: number;
  leaseUntil: number;
  duration: number | null;
  error: string | null;
};

export class MediaQueue {
  readonly db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, videoId TEXT NOT NULL UNIQUE, inputUrl TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
        leaseUntil INTEGER NOT NULL DEFAULT 0, duration REAL, error TEXT
      )`);
  }
  get(id: string) {
    return this.db.query<MediaJob, [string]>("SELECT * FROM jobs WHERE id=?").get(id);
  }
  enqueue(videoId: string, inputUrl: string) {
    const id = createHash("sha256").update(videoId).digest("hex").slice(0, 32);
    this.db
      .query(
        `INSERT INTO jobs(id,videoId,inputUrl) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET inputUrl=excluded.inputUrl,
      status=CASE WHEN jobs.status='errored' THEN 'queued' ELSE jobs.status END,
      attempts=CASE WHEN jobs.status='errored' THEN 0 ELSE jobs.attempts END,
      error=CASE WHEN jobs.status='errored' THEN NULL ELSE jobs.error END`,
      )
      .run(id, videoId, inputUrl);
    const job = this.get(id);
    if (!job) throw new Error("Enqueued asset is missing");
    return job;
  }
  claim(now = Date.now(), leaseMs = 60_000) {
    return this.db
      .query<MediaJob, [number, number]>(
        `UPDATE jobs SET status='processing', attempts=attempts+1, leaseUntil=?
      WHERE id=(SELECT id FROM jobs WHERE (status='queued' OR (status='processing' AND leaseUntil<?)) AND attempts<3 ORDER BY rowid LIMIT 1)
      RETURNING *`,
      )
      .get(now + leaseMs, now);
  }
  renew(id: string) {
    this.db
      .query("UPDATE jobs SET leaseUntil=? WHERE id=? AND status='processing'")
      .run(Date.now() + 60_000, id);
  }
  ready(id: string, duration: number) {
    this.db
      .query("UPDATE jobs SET status='ready',duration=?,error=NULL,leaseUntil=0 WHERE id=?")
      .run(duration, id);
  }
  fail(job: MediaJob, error: string) {
    this.db
      .query("UPDATE jobs SET status=?,error=?,leaseUntil=0 WHERE id=?")
      .run(job.attempts >= 3 ? "errored" : "queued", error.slice(0, 1000), job.id);
  }
  recoverExhausted(now = Date.now()) {
    this.db
      .query(
        "UPDATE jobs SET status='errored',error='Worker interrupted repeatedly',leaseUntil=0 WHERE status='processing' AND leaseUntil<? AND attempts>=3",
      )
      .run(now);
  }
  delete(id: string) {
    this.db.query("DELETE FROM jobs WHERE id=?").run(id);
  }
  close() {
    this.db.close();
  }
}
