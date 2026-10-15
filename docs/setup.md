# Develop against the local installation

Install Bun 1.4.x, Docker Compose, FFmpeg with FFprobe, and Tailscale. This checkout uses the persistent local stack described in [deployment](deployment.md).

Install dependencies with `bun install --frozen-lockfile`. Copy `.env.example` to `.env.local` only for a new checkout; preserve existing credentials on this installation. Configure the local backend URL and deployment admin key, plus browser-accessible Tailscale API and site URLs.

Run `bun run dev` to deploy backend changes and start Vite on loopback port 5298. The production app remains on port 5296. If testing browser uploads from a different origin, add that exact origin to SeaweedFS CORS configuration and restart storage. Local development needs access to the configured Tailscale endpoints.

Run these checks before updating production:

```bash
bun run typecheck
bun run lint
bun test
bun run test:convex
bun run build
```

Backend tests use real local auth user/session fixtures through `convex-test`. Media tests run FFmpeg, exercise signed segments, and verify the durable queue. The frontend retains the upstream design.

Use [account management](deployment.md#manage-accounts) to provision users. No hosted-service test keys are needed.
