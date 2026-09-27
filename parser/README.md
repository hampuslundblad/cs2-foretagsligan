# Demo parser

Parses CS2 `.dem` files to extract player SteamID64s and in-demo nicknames,
using [awpy](https://github.com/pnxenopoulos/awpy) (wraps demoinfocs-golang).

Invoked by the local admin app (`/admin`), but can also be run standalone:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python parse_demo.py /path/to/match.dem
```

For batch imports through the admin UI, place demo files in the repository's
gitignored `demos/` directory and click **Parse demos**. Parsed filenames are
recorded in `public/data/parsed-demos.json`, so they are not parsed again.

Outputs JSON to stdout:

```json
{
  "players": [
    { "steam_id": "76561198000000001", "nickname": "playerA" }
  ]
}
```

Team/division assignment is NOT done here — rosters are fixed per season and
assigned manually in the admin UI, since league demos don't reliably carry
team identity.
