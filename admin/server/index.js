// Local-only admin server. Never deployed to GitHub Pages.
// Responsibilities:
//   - Run the Python demo parser and return extracted SteamIDs
//   - Query the FACEIT API (key stays server-side, from .env)
//   - Read/write the shared /public/data/*.json files
//
// Run with: npm run server (from /admin), listens on localhost only.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.ADMIN_SERVER_PORT || 4000;
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const DATA_DIR = path.resolve(__dirname, "../../public/data");
const PARSER_SCRIPT = path.resolve(__dirname, "../../parser/parse_demo.py");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
}

function writeJson(file, data) {
  fs.writeFileSync(
    path.join(DATA_DIR, file),
    JSON.stringify(data, null, 2) + "\n"
  );
}

// --- Data file endpoints -----------------------------------------------

app.get("/api/data/:file", (req, res) => {
  const allowed = ["divisions.json", "teams.json", "players.json", "meta.json"];
  if (!allowed.includes(req.params.file)) return res.status(404).end();
  res.json(readJson(req.params.file));
});

app.put("/api/data/:file", (req, res) => {
  const allowed = ["divisions.json", "teams.json", "players.json", "meta.json"];
  if (!allowed.includes(req.params.file)) return res.status(404).end();
  writeJson(req.params.file, req.body);
  res.json({ ok: true });
});

app.post("/api/data/touch-meta", (req, res) => {
  writeJson("meta.json", { last_updated: new Date().toISOString() });
  res.json({ ok: true });
});

// --- Demo parser ---------------------------------------------------------

app.post("/api/parse-demo", (req, res) => {
  const { path: demoPath } = req.body;
  if (!demoPath) return res.status(400).json({ error: "path is required" });

  const proc = spawn("python3", [PARSER_SCRIPT, demoPath]);
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));
  proc.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: stderr || "parser failed" });
    }
    try {
      res.json(JSON.parse(stdout));
    } catch (e) {
      res.status(500).json({ error: "invalid parser output", raw: stdout });
    }
  });
});

// --- FACEIT lookups --------------------------------------------------------

const FACEIT_BASE = "https://open.faceit.com/data/v4";

async function faceitFetch(pathAndQuery) {
  const resp = await fetch(`${FACEIT_BASE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
  });
  if (!resp.ok) {
    throw new Error(`FACEIT API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

app.post("/api/faceit/resolve", async (req, res) => {
  const { steam_id } = req.body;
  if (!FACEIT_API_KEY) {
    return res.status(500).json({ error: "FACEIT_API_KEY not set in admin/.env" });
  }
  try {
    const player = await faceitFetch(
      `/players?game=cs2&game_player_id=${encodeURIComponent(steam_id)}`
    );
    const stats = await faceitFetch(`/players/${player.player_id}/stats/cs2`).catch(
      () => null
    );

    const lifetime = stats?.lifetime || {};
    res.json({
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
  } catch (err) {
    res.json({ steam_id, unresolved: true, error: String(err.message || err) });
  }
});

app.listen(PORT, "localhost", () => {
  console.log(`Admin server running at http://localhost:${PORT}`);
  if (!FACEIT_API_KEY) {
    console.warn("Warning: FACEIT_API_KEY not set (see admin/.env.example)");
  }
});
