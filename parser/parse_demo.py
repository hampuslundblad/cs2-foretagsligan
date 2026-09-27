"""Parse a CS2 .dem file and extract player SteamID64s + nicknames.

Usage:
    python parse_demo.py path/to/match.dem

Prints JSON to stdout:
    {"players": [{"steam_id": "76561198...", "nickname": "..."}]}

Requires: pip install -r requirements.txt (awpy)
"""

import json
import sys

from awpy import Demo


def parse_demo(path: str) -> dict:
    dem = Demo(path)
    dem.parse(player_props=["steamid", "name"])

    seen: dict[str, str] = {}
    # awpy exposes parsed rounds/ticks with player info; the exact frame to
    # source from can vary by awpy version, so this pulls from the parsed
    # "ticks" (or "kills" as a fallback) dataframe's player columns.
    df = getattr(dem, "ticks", None)
    if df is None or len(df) == 0:
        df = getattr(dem, "kills", None)

    if df is not None:
        for _, row in df.iterrows():
            steam_id = str(row.get("steamid") or row.get("attacker_steamid") or "")
            name = row.get("name") or row.get("attacker_name") or ""
            if steam_id and steam_id not in seen:
                seen[steam_id] = name

    return {
        "players": [
            {"steam_id": sid, "nickname": name} for sid, name in seen.items()
        ]
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python parse_demo.py <path-to-demo.dem>", file=sys.stderr)
        sys.exit(1)

    result = parse_demo(sys.argv[1])
    print(json.dumps(result, indent=2))
