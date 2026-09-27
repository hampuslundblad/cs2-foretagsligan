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
  const [fetchFaceitData, setFetchFaceitData] = useState(
    () => localStorage.getItem("fetch-faceit-data") !== "false"
  );
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    getJson<Division[]>("divisions.json").then(setDivisions);
    getJson<TeamsFile>("teams.json").then(setTeams);
    getJson<PlayersFile>("players.json").then(setPlayers);
  }, []);

  function toggleFaceitFetching(enabled: boolean) {
    setFetchFaceitData(enabled);
    localStorage.setItem("fetch-faceit-data", String(enabled));
  }

  async function runParser() {
    setStatus("Parsing new demos...");
    const res = await fetch(`${API}/parse-demos`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.error) {
      setStatus(`Parser error: ${data.error}`);
      return;
    }
    if (data.parsed.length === 0 && data.errors.length === 0) {
      setStatus("No new demos to parse.");
      return;
    }

    setStatus(
      fetchFaceitData
        ? `Found ${data.players.length} players. Resolving FACEIT data...`
        : `Found ${data.players.length} players. FACEIT lookup is disabled.`
    );

    const updatedPlayers: PlayersFile = { ...players };
    for (const p of data.players as { steam_id: string; nickname: string }[]) {
      if (!updatedPlayers[p.steam_id]) {
        updatedPlayers[p.steam_id] = { nickname: p.nickname };
      }
      if (!fetchFaceitData || updatedPlayers[p.steam_id].faceit) continue;

      const resolveRes = await fetch(`${API}/faceit/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steam_id: p.steam_id }),
      });
      const resolved = await resolveRes.json();
      updatedPlayers[p.steam_id] = {
        ...updatedPlayers[p.steam_id],
        faceit: {
          faceit_id: resolved.faceit_id ?? null,
          avatar: resolved.avatar ?? null,
          elo: resolved.elo ?? null,
          level: resolved.level ?? null,
          kd: resolved.kd ?? null,
          winrate_pct: resolved.winrate_pct ?? null,
          unresolved: !!resolved.unresolved,
        },
      };
    }
    setPlayers(updatedPlayers);
    if (data.errors.length > 0) {
      const failedDemos = data.errors.map((error: { filename: string }) => error.filename).join(", ");
      setStatus(`Parsed ${data.parsed.length} demo(s), but failed: ${failedDemos}.`);
      return;
    }
    setStatus(`Parsed ${data.parsed.length} demo(s). Review below, then click Save & Publish.`);
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
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CS2 Foretagsligan</p>
          <h1>League control room</h1>
          <p className="admin-intro">
            Manage match data, player profiles, and team assignments from your
            local workspace.
          </p>
        </div>
        <span className="local-badge">Local only</span>
      </header>

      <div className="admin-grid">
        <section className="admin-card import-card">
          <div className="card-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Import demos</h2>
              <p>Bring the latest match data into the league.</p>
            </div>
          </div>
          <p className="card-copy">
            Place <code>.dem</code> files in <code>demos/</code>. Processed
            files are tracked in <code>public/data/parsed-demos.json</code>.
          </p>
          <label className="faceit-toggle">
            <input
              type="checkbox"
              checked={fetchFaceitData}
              onChange={(event) => toggleFaceitFetching(event.target.checked)}
            />
            <span>Fetch FACEIT data for newly imported players</span>
          </label>
          <button className="button button-primary" onClick={runParser}>
            Parse demos
          </button>
        </section>

        <section className="admin-card divisions-card">
          <div className="card-heading">
            <span className="step-number">02</span>
            <div>
              <h2>Divisions</h2>
              <p>Current team placement by division.</p>
            </div>
          </div>
          <ul className="division-list">
            {divisions.map((d) => {
              const divisionTeams = Object.values(teams)
                .filter((t) => t.division_id === d.id)
                .map((t) => t.name);

              return (
                <li key={d.id}>
                  <strong>{d.name}</strong>
                  <span>{divisionTeams.join(", ") || "No teams assigned"}</span>
                </li>
              );
            })}
          </ul>
          <p className="card-note">Edit divisions directly in teams.json for now.</p>
        </section>
      </div>

      <section className="admin-card players-card">
        <div className="card-heading">
          <span className="step-number">03</span>
          <div>
            <h2>Players &amp; team assignment</h2>
            <p>Review imported profiles and assign each player to a roster.</p>
          </div>
          <span className="player-count">{Object.keys(players).length} players</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nickname</th>
                <th>Elo</th>
                <th>Level</th>
                <th>K/D</th>
                <th>Win rate</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(players).map(([steamId, p]) => (
                <tr
                  key={steamId}
                  className={p.faceit?.unresolved ? "is-unresolved" : undefined}
                >
                  <td>
                    <span className="player-name">{p.nickname}</span>
                    {p.faceit?.unresolved && (
                      <span className="unresolved-label">Unresolved</span>
                    )}
                  </td>
                  <td>{p.faceit?.elo ?? "—"}</td>
                  <td>{p.faceit?.level ?? "—"}</td>
                  <td>{p.faceit?.kd ?? "—"}</td>
                  <td>{p.faceit?.winrate_pct ?? "—"}</td>
                  <td>
                    <select
                      aria-label={`Assign ${p.nickname} to a team`}
                      value={teamOf(steamId)}
                      onChange={(e) => assignTeam(steamId, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {Object.entries(teams).map(([id, t]) => (
                        <option key={id} value={id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {Object.keys(players).length === 0 && (
                <tr>
                  <td className="empty-state" colSpan={6}>
                    No players imported yet. Parse a demo to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="save-bar">
        <div>
          <h2>Ready to publish?</h2>
          <p>{status || "Changes remain local until you save and publish them."}</p>
        </div>
        <button className="button button-primary" onClick={saveAll}>
          Save &amp; publish
        </button>
      </footer>
    </main>
  );
}
