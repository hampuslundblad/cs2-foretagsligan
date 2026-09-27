import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Request } from "express";
import { createDataStore } from "./data-store.js";

interface DemoPlayer {
  steam_id?: string;
  [key: string]: unknown;
}

interface DemoParseResult {
  players?: DemoPlayer[];
}

interface FaceitPlayer {
  player_id: string;
  nickname: string;
  avatar?: string;
  games?: {
    cs2?: {
      faceit_elo?: number;
      skill_level?: number;
    };
  };
}

interface FaceitStats {
  lifetime?: Record<string, string>;
}

interface FaceitResolveRequest {
  steam_id: string;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.ADMIN_SERVER_PORT ?? 4000);
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const DATA_DIR = path.resolve(currentDirectory, "../../public/data");
const PARSER_SCRIPT = path.resolve(currentDirectory, "../../parser/parse_demo.py");
const DEMO_DIR = path.resolve(currentDirectory, "../../demos");
const PARSED_DEMOS_FILE = "parsed-demos.json";
const dataStore = createDataStore(DATA_DIR);
const dataFiles = new Set([
  "divisions.json",
  "teams.json",
  "players.json",
  "meta.json",
  PARSED_DEMOS_FILE,
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseDemo(demoPath: string): Promise<DemoParseResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [PARSER_SCRIPT, demoPath]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data;
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `parser exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as DemoParseResult);
      } catch {
        reject(new Error("parser returned invalid JSON"));
      }
    });
  });
}

function readParsedDemos(): string[] {
  const parsedDemosPath = path.join(DATA_DIR, PARSED_DEMOS_FILE);
  if (!fs.existsSync(parsedDemosPath)) {
    dataStore.writeJson(PARSED_DEMOS_FILE, []);
    return [];
  }

  const parsedDemos = dataStore.readJson(PARSED_DEMOS_FILE);
  if (
    !Array.isArray(parsedDemos) ||
    !parsedDemos.every((filename): filename is string => typeof filename === "string")
  ) {
    throw new Error(`${PARSED_DEMOS_FILE} must contain an array of filenames`);
  }
  return parsedDemos;
}

app.get("/api/data/:file", (req, res) => {
  const { file } = req.params;
  if (!dataFiles.has(file)) {
    return res.status(404).end();
  }

  try {
    return res.json(file === "players.json" ? dataStore.getPlayers() : dataStore.readJson(file));
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

app.put("/api/data/:file", (req, res) => {
  const { file } = req.params;
  if (!dataFiles.has(file)) {
    return res.status(404).end();
  }

  try {
    if (file === "players.json") {
      dataStore.savePlayers(req.body);
    } else {
      dataStore.writeJson(file, req.body);
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error) });
  }
});

app.post("/api/data/touch-meta", (_req, res) => {
  dataStore.writeJson("meta.json", { last_updated: new Date().toISOString() });
  res.json({ ok: true });
});

app.post("/api/parse-demos", async (_req, res) => {
  try {
    fs.mkdirSync(DEMO_DIR, { recursive: true });
    const parsedDemos = readParsedDemos();
    const parsedDemoSet = new Set(parsedDemos);
    const demoFiles = fs
      .readdirSync(DEMO_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".dem")
      .map((entry) => entry.name)
      .sort();
    const newDemoFiles = demoFiles.filter((filename) => !parsedDemoSet.has(filename));
    const players = new Map<string, DemoPlayer>();
    const parsed: string[] = [];
    const errors: { filename: string; error: string }[] = [];

    for (const filename of newDemoFiles) {
      try {
        const result = await parseDemo(path.join(DEMO_DIR, filename));
        for (const player of result.players ?? []) {
          if (player.steam_id && !players.has(player.steam_id)) {
            players.set(player.steam_id, player);
          }
        }
        parsed.push(filename);
      } catch (error) {
        errors.push({ filename, error: errorMessage(error) });
      }
    }

    if (parsed.length > 0) {
      dataStore.writeJson(PARSED_DEMOS_FILE, [...parsedDemos, ...parsed].sort());
    }

    return res.json({
      parsed,
      skipped: demoFiles.filter((filename) => parsedDemoSet.has(filename)),
      errors,
      players: [...players.values()],
    });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

const FACEIT_BASE = "https://open.faceit.com/data/v4";

async function faceitFetch<T>(pathAndQuery: string): Promise<T> {
  const response = await fetch(`${FACEIT_BASE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`FACEIT API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

app.post(
  "/api/faceit/resolve",
  async (req: Request<{}, unknown, FaceitResolveRequest>, res) => {
    const { steam_id } = req.body;
    if (!FACEIT_API_KEY) {
      return res.status(500).json({ error: "FACEIT_API_KEY not set in admin/.env" });
    }

    try {
      const player = await faceitFetch<FaceitPlayer>(
        `/players?game=cs2&game_player_id=${encodeURIComponent(steam_id)}`,
      );
      const stats = await faceitFetch<FaceitStats>(
        `/players/${player.player_id}/stats/cs2`,
      ).catch(() => null);
      const lifetime = stats?.lifetime || {};

      return res.json({
        steam_id,
        faceit_id: player.player_id,
        nickname: player.nickname,
        avatar: player.avatar || null,
        elo: player.games?.cs2?.faceit_elo ?? null,
        level: player.games?.cs2?.skill_level ?? null,
        kd: lifetime["Average K/D Ratio"] ? Number(lifetime["Average K/D Ratio"]) : null,
        winrate_pct: lifetime["Win Rate %"] ? Number(lifetime["Win Rate %"]) : null,
        unresolved: false,
      });
    } catch (error) {
      return res.json({ steam_id, unresolved: true, error: errorMessage(error) });
    }
  },
);

app.listen(PORT, "localhost", () => {
  console.log(`Admin server running at http://localhost:${PORT}`);
  if (!FACEIT_API_KEY) {
    console.warn("Warning: FACEIT_API_KEY not set (see admin/.env.example)");
  }
});
