#!/usr/bin/env python3
"""Fetch tournament matches involving Accenture AB into accenture-ab-matches.json."""

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TOURNAMENT_ID = "2560854090247290879"
TEAM_NAME = "Accenture AB"
PAGE_SIZE = 128
OUTPUT_PATH = Path(__file__).with_name("accenture-ab-matches.json")
API_URL = "https://play.toornament.com/api/matches"


def fetch_page(offset: int) -> dict:
    query = urlencode(
        {
            "tournament_ids": TOURNAMENT_ID,
            "offset": offset,
            "limit": PAGE_SIZE,
        }
    )
    request = Request(
        f"{API_URL}?{query}",
        headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def involves_team(match: dict) -> bool:
    return any(
        (opponent.get("participant") or {}).get("name", "").strip().casefold()
        == TEAM_NAME.casefold()
        for opponent in match.get("opponents", [])
    )


def main() -> None:
    offset = 0
    total = None
    matches = []
    matching_matches = []

    while total is None or offset < total:
        page = fetch_page(offset)
        page_range = page.get("range")
        items = page.get("items")
        if not isinstance(page_range, dict) or not isinstance(items, list):
            raise ValueError("Unexpected response from Toornament match API")
        if page_range.get("offset") != offset or not isinstance(
            page_range.get("total"), int
        ):
            raise ValueError(f"Unexpected pagination data at offset {offset}")
        if total is None:
            total = page_range["total"]
        elif page_range["total"] != total:
            raise ValueError("Tournament match count changed while fetching pages")
        if not items and offset < total:
            raise ValueError(f"Toornament returned no matches at offset {offset}")

        matches.extend(items)
        matching_matches.extend(match for match in items if involves_team(match))
        offset += len(items)

    output = {
        "source": f"https://play.toornament.com/en_US/tournaments/{TOURNAMENT_ID}/matches/",
        "tournament_id": TOURNAMENT_ID,
        "participant_name": TEAM_NAME,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "total_tournament_matches": len(matches),
        "matching_matches": len(matching_matches),
        "matches": matching_matches,
    }
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Saved {len(matching_matches)} of {len(matches)} matches to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
