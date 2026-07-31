# 539 Predictor Lab Railway Deployment

This project is ready to be connected from a GitHub repository to Railway.

## Railway settings

The repository includes `railway.toml`:

- Build command: `npm run build`
- Start command: `npm run start`
- Health check path: `/`

Railway can deploy from a GitHub repository. After the repo is connected, new commits to the selected branch trigger a new build and deployment.

## Data storage

The app uses Cloudflare D1 when a `DB` binding exists. On Railway it falls back
to a JSON data file, so member accounts, saved predictions, orders, and daily
draw imports can still be stored.

For durable Railway storage, attach a Railway Volume and set one of these:

- `RAILWAY_VOLUME_MOUNT_PATH`: Railway sets this when a volume is mounted.
- `LOTTO539_DATA_PATH`: optional full file path, such as
  `/data/lotto539-store.json`.

Useful optional variables:

- `DRAW_SYNC_TOKEN`: protects `/api/draws` when posting crawler updates.
- `YOUTUBE_LIVE_SOURCE_URL`: defaults to
  `https://www.youtube.com/@48ilottery48/streams`.
- `YOUTUBE_LIVE_VIDEO_ID`: manual fallback video id for the live player.

## Required deployment flow

1. Push this repository to GitHub.
2. In Railway, create a new project and choose the GitHub repository.
3. Confirm the build and start commands from `railway.toml`.
4. Deploy latest commit.
5. Generate a public domain in Railway networking settings.
