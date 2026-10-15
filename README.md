# lawn

Video review platform for creative teams. Built by Theo.

## Self-hosted fork

This fork replaces hosted authentication with local Convex Auth password accounts, S3 storage with SeaweedFS, and video processing with FFmpeg. Subscriptions are removed from the application workflow. Team roles, invitations, versions, comments, share controls, and signed media access remain.

The installation lives at `~/mnt/labb-data/apps/lawn` on the 1 TB drive labeled `labb-data`. Database metadata uses an 8 GiB ext4 image on that drive; originals and generated media use its remaining capacity. Systemd starts the stack after both filesystems mount. The app is available privately through Tailscale HTTPS 8443; its exact URL and bootstrap credentials are stored in ignored local environment files.

Read [deployment and account management](docs/deployment.md) for service commands, private ports, updates, backups, and storage limits. Read [development setup](docs/setup.md) for local changes and checks.

### Changes recorded on 2026-10-15

- Forked [pingdotgg/lawn](https://github.com/pingdotgg/lawn) to [iouthnamain/lawn](https://github.com/iouthnamain/lawn), with an `upstream` remote.
- Installed Bun dependencies and FFmpeg; pinned local Convex and SeaweedFS Docker images.
- Replaced Clerk with operator-provisioned password accounts. Normalized session identities to stable users and revoked sessions on password reset.
- Removed Stripe runtime dependencies and checkout flows. Added a shared 400 GiB original-upload budget.
- Replaced Mux processing with a durable FFmpeg queue, HLS, posters, and signed access on every media request. Added media deletion with retry.
- Added persistent services and private Tailscale routes while preserving the existing HTTPS 443 application.

Two architectures were compared. Convex Auth keeps users and authorization in the existing database. Better Auth would add a separate authentication database and token bridge. The selected design keeps heavy media on NTFS and transactional databases on ext4.

### Verification

Type checking, lint, the production build, 109 Bun tests, and 62 Convex tests pass. Live checks cover local sign-in, S3 uploads, multipart completion and CORS, FFmpeg processing, signed HLS segments and posters, original downloads, private-access denial, and deletion of originals and encoded files. Browser checks cover playback, seeking, mobile settings, and persistence across a complete service restart.

Tailscale Serve exposes all required endpoints privately. A peer responds to Tailscale ping; an HTTP check from that server remains unverified because SSH authentication is unavailable. Backups are documented but a full restore to another machine has not been tested.

## Upstream project

## IMPORTANT NOTICE

I am, effectively, not accepting PRs at this time. This may change in the future. My preferred "PR" method is to describe problems in the issues tab and give me detailed prompts I can quickly copy/paste into my agent of choice.

## ...why did you build this?

I got tired of Frame.io slowly regressing. I wanted something simple, fast and reliable.

I don't know how much time I'll have to maintain this long term, so I decided to open source it. I have no idea where this project is going long term.

My team is using lawn every day already. We intend to continue, and we intend to keep adding things we need throughout.

## Docs

- [Setup](docs/setup.md)
- [Deployment](docs/deployment.md)
- [Philosophy](docs/philosophy.md)
