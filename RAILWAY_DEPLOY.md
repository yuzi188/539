# 539 Predictor Lab Railway Deployment

This project is ready to be connected from a GitHub repository to Railway.

## Railway settings

The repository includes `railway.toml`:

- Build command: `npm run build`
- Start command: `npm run start`
- Health check path: `/`

Railway can deploy from a GitHub repository. After the repo is connected, new commits to the selected branch trigger a new build and deployment.

## Important database note

The current app was originally built for Cloudflare D1. Member tables are protected with automatic table creation when D1 is available.

For a long-term Railway production deployment, choose one:

1. Keep Cloudflare Sites/D1 as the production hosting path.
2. Add a Railway database adapter and migrate the member/draw storage to Railway Postgres.
3. Run the app with a compatible D1/Worker runtime and accept that local file-backed state is not the same as a managed production database.

## Required deployment flow

1. Push this repository to GitHub.
2. In Railway, create a new project and choose the GitHub repository.
3. Confirm the build and start commands from `railway.toml`.
4. Deploy latest commit.
5. Generate a public domain in Railway networking settings.
