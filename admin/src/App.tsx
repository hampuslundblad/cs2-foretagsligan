import { useEffect, useState } from "react";
import type {
  Division,
  TeamsFile,
  PlayersFile,
} from "../../src/types/data";
import "./index.css";

const API = "http://localhost:4000/api";

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${API}/data/${file}`);
  return res.json();
}

async function putJson(file: string, data: unknown) {
  await fetch(`${API}/data/${file}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export default function App() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<TeamsFile>({});
  const [players, setPlayers] = useState<PlayersFile>({});
  const [demoPath, setDemoPath] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    getJson<Division[]>("divisions.json").then(setDivisions);
    getJson<TeamsFile>("teams.json").then(setTeams);
    getJson<PlayersFile>("players.json").then(setPlayers);
  }, []);

  async function runParser() {
    setStatus("Parsing demo...");
    const res = await fetch(`${API}/parse-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: demoPath }),
    });
    const data = await res.json();
    if (data.error) {
      setStatus(`Parser error: ${data.error}`);
      return;
    }
    setStatus(`Found ${data.players.length} players. Resolving FACEIT data...`);

    const updated: PlayersFile = { ...players };
    for (const p of data.players as { steam_id: string; nickname: string }[]) {
      if (updated[p.steam_id]) continue; // already known, skip re-fetch
      const resolveRes = await fetch(`${API}/faceit/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steam_id: p.steam_id }),
      });
      const resolved = await resolveRes.json();
      updated[p.steam_id] = {
        faceit_id: resolved.faceit_id ?? null,
        nickname: resolved.nickname ?? p.nickname,
        avatar: resolved.avatar ?? null,
        elo: resolved.elo ?? null,
        level: resolved.level ?? null,
        kd: resolved.kd ?? null,
        winrate_pct: resolved.winrate_pct ?? null,
        unresolved: !!resolved.unresolved,
      };
    }
    setPlayers(updated);
    setStatus("Done. Review below, then click Save & Publish.");
  }

  async function saveAll() {
    await putJson("teams.json", teams);
    await putJson("players.json", players);
    await fetch(`${API}/data/touch-meta`, { method: "POST" });
    setStatus("Saved. Now commit & push /public/data to publish.");
  }

  function assignTeam(steamId: string, teamId: string) {
    setTeams((prev) => {
      const next: TeamsFile = { ...prev };
      // remove from any existing team, then add to target
      for (const id of Object.keys(next)) {
        next[id] = {
          ...next[id],
          player_ids: next[id].player_ids.filter((p) => p !== steamId),
        };
      }
      if (teamId && next[teamId]) {
        next[teamId] = {
          ...next[teamId],
          player_ids: [...next[teamId].player_ids, steamId],
        };
      }
      return next;
    });
  }

  function teamOf(steamId: string): string {
    return (
      Object.entries(teams).find(([, t]) => t.player_ids.includes(steamId))?.[0] ??
      ""
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 960 }}>
      <h1>CS2 Foretagsligan — Admin</h1>
      <p style={{ color: "#666" }}>
        Local-only tool. Nothing here is deployed to GitHub Pages.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2>1. Import a demo</h2>
        <input
          style={{ width: 400 }}
          placeholder="/path/to/match.dem"
          value={demoPath}
          onChange={(e) => setDemoPath(e.target.value)}
        />
        <button onClick={runParser} style={{ marginLeft: 8 }}>
          Parse + resolve FACEIT
        </button>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>2. Players &amp; team assignment</h2>
        <table width="100%" cellPadding={6}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Nickname</th>
              <th>Elo</th>
              <th>Level</th>
              <th>K/D</th>
              <th>Win%</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(players).map(([steamId, p]) => (
              <tr key={steamId} style={{ opacity: p.unresolved ? 0.5 : 1 }}>
                <td>{p.nickname}{p.unresolved && " ⚠️ unresolved"}</td>
                <td>{p.elo ?? "-"}</td>
                <td>{p.level ?? "-"}</td>
                <td>{p.kd ?? "-"}</td>
                <td>{p.winrate_pct ?? "-"}</td>
                <td>
                  <select
                    value={teamOf(steamId)}
                    onChange={(e) => assignTeam(steamId, e.target.value)}
                  >
                    <option value="">-- unassigned --</option>
                    {Object.entries(teams).map(([id, t]) => (
                      <option key={id} value={id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>3. Divisions (edit teams.json manually for now)</h2>
        <ul>
          {divisions.map((d) => (
            <li key={d.id}>
              {d.name} — teams:{" "}
              {Object.values(teams)
                .filter((t) => t.division_id === d.id)
                .map((t) => t.name)
                .join(", ") || "none"}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <button onClick={saveAll}>Save &amp; Publish (write JSON)</button>
        <p>{status}</p>
      </section>
    </div>
  );
}
