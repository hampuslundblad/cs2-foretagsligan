# CS2 Företagsligan

Static league dashboard for a CS2 company league, hosted on GitHub Pages.
Player/team/division data is gathered **locally** (never in the browser) via
a demo parser + the FACEIT API, then committed as JSON and published as a
static site.

## Architecture

```
.dem files
   │  (Python + awpy)
   ▼
SteamID64s ──► admin/ (local-only Express + React tool)
                 │   - runs parser
                 │   - resolves SteamID → FACEIT stats (key stays local)
                 │   - assign players to teams / divisions
                 ▼
        public/data/*.json  (divisions.json, teams.json, players.json, meta.json)
                 │
                 │  git commit && git push (manual)
                 ▼
        GitHub Actions → vite build → GitHub Pages (public, read-only)
```

## Repo layout

- `src/` — public Vite + React site (built & deployed by CI)
- `public/data/` — the committed JSON data consumed by the public site
- `admin/` — local-only admin tool (parser runner + FACEIT fetch + data editor).
  **Never built or deployed** — excluded from the CI workflow.
- `parser/` — Python `.dem` parser (uses [awpy](https://github.com/pnxenopoulos/awpy))
- `.github/workflows/deploy.yml` — builds `src/` and publishes to GitHub Pages

## One-time setup

```bash
# Public site
npm install

# Admin tool
cd admin
npm install
cp .env.example .env   # then fill in FACEIT_API_KEY

# Parser
cd ../parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Enable GitHub Pages: repo Settings → Pages → Source: **GitHub Actions**.

If your GitHub Pages repo name isn't `cs2-foretagsligan`, update the `base`
path in `vite.config.ts`.

## Updating data (manual workflow)

1. `cd admin && npm run start` — launches the local admin UI (Vite) + its
   Express server (parser + FACEIT calls) together.
2. In the admin UI: import a `.dem` file, resolve FACEIT stats, assign new
   players to teams.
3. Click **Save & Publish** in the admin UI (writes `public/data/*.json`).
4. From the repo root: `git add public/data && git commit -m "Update player data" && git push`
5. GitHub Actions rebuilds and redeploys the public site automatically.

## Editing divisions / teams

Divisions rarely change — edit `public/data/divisions.json` directly.
Team rosters are fixed per season; create/edit teams in
`public/data/teams.json` (team → division mapping + player list), then use
the admin UI to assign individual players to a team.

## Security notes

- `FACEIT_API_KEY` lives only in `admin/.env`, which is gitignored, and is
  only ever used by the local Express server (`admin/server`). It is never
  bundled into the public site.
- The public site only ever reads static JSON — no API keys, no live calls,
  no CORS concerns.
