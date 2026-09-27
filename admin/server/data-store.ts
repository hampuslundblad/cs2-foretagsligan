import fs from "node:fs";
import path from "node:path";
import type { FaceitProfile, Player, PlayersFile } from "../../src/types/data.js";

let temporaryFileCounter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function normalizePlayer(player: unknown): Player {
  if (!isRecord(player)) {
    throw new Error("Player must be an object");
  }
  if (typeof player.nickname !== "string" || player.nickname.trim() === "") {
    throw new Error("Player nickname must be a non-empty string");
  }

  const normalized: Player = { nickname: player.nickname };
  const { faceit } = player;

  if (faceit !== undefined) {
    if (!isRecord(faceit)) {
      throw new Error("Player FACEIT data must be an object");
    }
    if (
      !isNullableString(faceit.faceit_id) ||
      !isNullableString(faceit.avatar) ||
      !isNullableNumber(faceit.elo) ||
      !isNullableNumber(faceit.level) ||
      !isNullableNumber(faceit.kd) ||
      !isNullableNumber(faceit.winrate_pct) ||
      (faceit.unresolved !== undefined && typeof faceit.unresolved !== "boolean")
    ) {
      throw new Error("Player FACEIT data has invalid field values");
    }

    const normalizedFaceit: FaceitProfile = {
      faceit_id: faceit.faceit_id ?? null,
      avatar: faceit.avatar ?? null,
      elo: faceit.elo ?? null,
      level: faceit.level ?? null,
      kd: faceit.kd ?? null,
      winrate_pct: faceit.winrate_pct ?? null,
    };
    if (faceit.unresolved !== undefined) {
      normalizedFaceit.unresolved = faceit.unresolved;
    }
    normalized.faceit = normalizedFaceit;
  }

  return normalized;
}

export function normalizePlayers(players: unknown): PlayersFile {
  if (!isRecord(players)) {
    throw new Error("players.json must contain an object keyed by SteamID64");
  }

  return Object.fromEntries(
    Object.entries(players).map(([steamId, player]) => {
      if (!/^\d+$/.test(steamId)) {
        throw new Error(`Invalid SteamID64: ${steamId}`);
      }
      return [steamId, normalizePlayer(player)];
    }),
  );
}

export function createDataStore(dataDir: string) {
  function filePath(file: string) {
    return path.join(dataDir, file);
  }

  function readJson(file: string): unknown {
    return JSON.parse(fs.readFileSync(filePath(file), "utf-8"));
  }

  function writeJson(file: string, data: unknown) {
    const destination = filePath(file);
    const temporary = `${destination}.${process.pid}.${temporaryFileCounter++}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(temporary, destination);
  }

  return {
    readJson,
    writeJson,
    getPlayers(): PlayersFile {
      return normalizePlayers(readJson("players.json"));
    },
    savePlayers(players: unknown) {
      writeJson("players.json", normalizePlayers(players));
    },
  };
}
