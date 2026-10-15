# Run the self-hosted installation

This fork uses local Convex with Convex Auth, SeaweedFS S3, and FFmpeg. It does not require Clerk, Stripe, Mux, Chunkify, or Convex Cloud credentials. The original S3 environment names and stored `Clerk`/`Mux` column names remain for compatibility.

## Find the installation

The checkout is `~/mnt/labb-data/apps/lawn`. The `labb-data` link points to the mounted 1 TB drive. Private URLs and bootstrap credentials are in the ignored `.env.local` and `.env.selfhost` files.

The installation uses these paths relative to `apps`:

| Path                 | Contents                                                    |
| -------------------- | ----------------------------------------------------------- |
| `lawn`               | Fork, dependencies, production build, private configuration |
| `lawn-data/storage`  | S3 object volumes                                           |
| `lawn-data/media`    | Generated HLS, posters, temporary originals                 |
| `lawn-data/cache`    | Dependency cache and verification files                     |
| `lawn-data/logs`     | Build and verification evidence                             |
| `lawn-state.ext4`    | 8 GiB ext4 filesystem image on the data drive               |
| `lawn-state/convex`  | Convex database and backend files                           |
| `lawn-state/storage` | SeaweedFS LevelDB and master metadata                       |
| `lawn-state/media`   | Durable media queue                                         |

System binaries, Docker images, and bounded container logs remain on the system disk. All application database state and media use the data drive.

The drive retains NTFS. The ext4 image supplies Linux database locking and WAL behavior. Large media stays outside that bounded image. `/etc/fstab` mounts the physical drive by UUID. A systemd mount unit mounts the image before the services start. Missing mounts prevent service startup.

## Start and stop services

From the checkout, inspect the services:

```bash
sudo systemctl status lawn-stack lawn-media lawn-web
sudo journalctl -u lawn-media -u lawn-web -n 100
sudo ./deploy/stack.sh ps
```

Start the complete installation:

```bash
sudo systemctl start lawn-stack lawn-media lawn-web
```

Stop it before maintenance or removing the drive:

```bash
sudo systemctl stop lawn-web lawn-media lawn-stack
```

All three units are enabled at boot. The stack unit starts the pinned Docker images. The other units run Bun as the local user. The stack runs Compose in the foreground and restarts if a container exits. Containers use no independent restart policy, so systemd controls the mount lifecycle. To restart the whole installation, stop all three units and then start all three.

The backend uses host networking and binds to loopback. This lets it discover its own Tailscale auth issuer. Storage, the web server, and the media worker also expose their host ports on loopback. Internal SeaweedFS services stay inside Docker.

## Open the app through Tailscale

For the hostname in `.env.selfhost`, the private HTTPS ports are:

| Port | Purpose                           | Local target |
| ---- | --------------------------------- | ------------ |
| 8443 | App, signed media under `/media/` | 5296         |
| 8444 | Convex API and WebSocket          | 3210         |
| 8445 | Auth discovery and HTTP actions   | 3211         |
| 8446 | S3 upload and original download   | 8333         |

The existing HTTPS 443 service is preserved. Tailscale Serve is persistent and tailnet-only. Funnel is not enabled. Client servers need Tailscale access to all four ports. Existing tailnet ACLs still apply; this setup does not change account-wide ACLs.

Inspect the routes with `sudo tailscale serve status`. To recreate a route, run `sudo tailscale serve --bg --https=PORT http://127.0.0.1:TARGET`. Do not reset the whole Serve configuration because other applications use it.

## Manage accounts

Public registration is disabled. Provision accounts only for emails whose ownership you have checked, because team invitations match email addresses.

The bootstrap account's email and password are stored privately in `.env.local` as `LAWN_ADMIN_EMAIL` and `LAWN_ADMIN_PASSWORD`. Change the password after first use. Keep the stored bootstrap value synchronized if you want it as your recovery record.

Create a temporary file outside Git with this JSON, using a password of at least 12 characters:

```json
{ "email": "person@example.com", "password": "replace-with-a-strong-password", "name": "Person" }
```

Protect the file with mode 600, then run:

```bash
bun deploy/account.ts create < /path/to/private-account.json
```

To reset an existing account, supply JSON containing `email` and `password`:

```bash
bun deploy/account.ts resetPassword < /path/to/private-account.json
```

Delete the temporary file after use. The script sends the password through stdin rather than command arguments. Resetting a password invalidates existing sessions immediately. The Convex deployment admin key authorizes these internal operations; never give it to application users.

## Update the fork

The fork is [iouthnamain/lawn](https://github.com/iouthnamain/lawn). `upstream` points to [pingdotgg/lawn](https://github.com/pingdotgg/lawn). Local self-hosting changes have not been committed or pushed automatically.

Review the working tree and upstream changes before integrating them. Back up the installation, resolve changes locally, then run:

```bash
bun run selfhost:update
```

This installs the lockfile dependencies, checks types and lint, runs unit/backend tests, deploys to the configured local backend, builds the frontend, and restarts the app and worker. It does not fetch or merge changes. Docker updates are separate: review new image versions and update the pinned digests in `deploy/compose.yaml`.

To apply backend configuration changes:

```bash
bun x convex env set --force --from-file .env.convex.local
bun x convex deploy -y
```

Use single quotes around JSON values such as `JWKS` in dotenv files. Escaping JSON inside double quotes can preserve backslashes and break auth discovery. The backend manages `CONVEX_SITE_URL` from `CONVEX_SITE_ORIGIN`; do not override it through the CLI. Keep `CONVEX_DEPLOYMENT` unset. Use `convex deploy`, because `convex dev` rewrites the browser URL to loopback.

## Back up and restore

Choose a backup destination on another disk or machine. Stop all three services before copying. Copy the checkout's private config, `lawn-data`, and the complete mounted `lawn-state` tree with an archive tool that preserves ownership and permissions. Alternatively, unmount `lawn-state` after stopping services and copy `lawn-state.ext4` intact. Do not copy a live database image and assume it is consistent.

Secrets to preserve include `.env.local`, `.env.selfhost`, `.env.convex.local`, and `.seaweed-s3.json`. Protect backup access. Back up the systemd units and the drive's `/etc/fstab` entry too.

To restore, stop services, restore data and configuration, restore the physical and image mount configuration, verify both mounts, and start all three units. Verify login, one original download, and one encoded video. A full restore to another machine has not been exercised.

## Monitor capacity

Check both filesystems:

```bash
df -h ~/mnt/labb-data ~/mnt/labb-data/apps/lawn-state
```

The shared upload budget defaults to 400 GiB across all teams. Pending uploads and failed originals reserve space. Generated media needs additional space. Uploads support up to 50 GiB each. The worker processes one job at a time, uses two encoding threads, produces H.264/AAC up to 720p, and limits each encoding job to six hours. Output files and upload reservations can consume space until cleanup completes.

The quota scans existing video records within the mutation, making concurrent reservations transactional. Very large libraries can reach Convex transaction read limits; add aggregate accounting before operating at that scale.

If the 8 GiB metadata image fills, stop all services and unmount it. Back it up, enlarge the image file, run `e2fsck -f` and `resize2fs` on the unmounted image, then mount it and start the services. Never shrink or format the existing image. The physical disk must have enough free space for expansion.

Signed playback and posters expire after one hour. The app refreshes them every 45 minutes. Each HLS segment checks the capability too. Anyone holding a valid signed URL can use it until expiry, even after a share is revoked. Deleting the video reclaims originals and encoded assets asynchronously with retries, and aborts unfinished multipart uploads. A follow-up cleanup after signed upload expiry catches late uploads.
