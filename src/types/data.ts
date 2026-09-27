// Shared data shapes for /public/data/*.json.
// Used by both the public site (src/) and the local admin app (admin/).

export interface Division {
  id: string;
  name: string;
  order: number;
}

export interface Team {
  name: string;
  division_id: string;
  player_ids: string[]; // SteamID64
}

export type TeamsFile = Record<string, Team>; // keyed by team id

export interface Player {
  faceit_id: string | null;
  nickname: string;
  avatar: string | null;
  elo: number | null;
  level: number | null;
  kd: number | null;
  winrate_pct: number | null;
  unresolved?: boolean; // true if FACEIT lookup failed for this SteamID
}

export type PlayersFile = Record<string, Player>; // keyed by SteamID64

export interface Meta {
  last_updated: string | null; // ISO timestamp, set by admin app on export
}
