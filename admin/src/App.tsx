import { useEffect, useState } from "react";
import type {
  Division,
  TeamsFile,
  PlayersFile,
} from "../../src/types/data";
import "./index.css";

const API = "http://localhost:4000/api";

interface TournamentMatch {
  id: string;
  opponents: {
    participant?: { name?: string } | null;
    score: number | null;
  }[];
  stage: { name: string };
  round: { name: string; number: number };
  scheduledDatetime: string | null;
  status: string;
}

interface MatchesFile {
  participant_name: string;
  source: string;
  fetched_at: string;
  total_tournament_matches: number;
  matching_matches: number;
  matches: TournamentMatch[];
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${API}/data/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  return res.json();
}

async function getMatches(): Promise<MatchesFile> {
  const res = await fetch(`${API}/matches`);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Failed to load matches: ${res.status}`);
  }
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
  const [page, setPage] = useState<"dashboard" | "matches">("dashboard");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<TeamsFile>({});
  const [players, setPlayers] = useState<PlayersFile>({});
  const [matches, setMatches] = useState<MatchesFile | null>(null);
  const [matchesError, setMatchesError] = useState("");
  const [fetchFaceitData, setFetchFaceitData] = useState(
    () => localStorage.getItem("fetch-faceit-data") !== "false"
  );
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    getJson<Division[]>("divisions.json").then(setDivisions);
    getJson<TeamsFile>("teams.json").then(setTeams);
    getJson<PlayersFile>("players.json").then(setPlayers);
    getMatches().then(setMatches).catch((error: unknown) => {
      setMatchesError(error instanceof Error ? error.message : String(error));
    });
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

      <nav className="admin-nav" aria-label="Admin pages">
        <button
          className={`nav-button${page === "dashboard" ? " is-active" : ""}`}
          aria-current={page === "dashboard" ? "page" : undefined}
          onClick={() => setPage("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`nav-button${page === "matches" ? " is-active" : ""}`}
          aria-current={page === "matches" ? "page" : undefined}
          onClick={() => setPage("matches")}
        >
          Matches
          {matches && <span className="nav-count">{matches.matching_matches}</span>}
        </button>
      </nav>

      {page === "dashboard" ? (
        <>
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
        </>
      ) : (
        <section className="admin-card matches-card">
          <div className="card-heading matches-heading">
            <div>
              <p className="eyebrow">Accenture AB</p>
              <h2>Our matches</h2>
              <p>
                {matches
                  ? `${matches.matching_matches} matches · refreshed ${new Date(matches.fetched_at).toLocaleString()}`
                  : "Loading match schedule..."}
              </p>
            </div>
            {matches && (
              <a
                className="source-link"
                href={matches.source}
                target="_blank"
                rel="noreferrer"
              >
                Open Toornament
              </a>
            )}
          </div>
          {matchesError ? (
            <p className="matches-error">
              Could not load matches: {matchesError}. Run{" "}
              <code>python fetch_accenture_matches.py</code> to generate the
              match data.
            </p>
          ) : matches ? (
            <div className="table-scroll">
              <table className="matches-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Division / round</th>
                    <th>Matchup</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.matches.map((match) => (
                    <tr key={match.id}>
                      <td>
                        {match.scheduledDatetime
                          ? new Date(match.scheduledDatetime).toLocaleString(
                              undefined,
                              { dateStyle: "medium", timeStyle: "short" },
                            )
                          : "Not scheduled"}
                      </td>
                      <td>
                        <strong>{match.stage.name}</strong>
                        <span className="match-round">
                          {match.round.name || `Round ${match.round.number}`}
                        </span>
                      </td>
                      <td className="matchup-cell">
                        <a
                          className="match-link"
                          href={`${matches.source}${match.id}/`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {match.opponents
                            .map((opponent) => {
                              const name = opponent.participant?.name ?? "TBD";
                              return opponent.score === null
                                ? name
                                : `${name} (${opponent.score})`;
                            })
                            .join(" vs ")}
                        </a>
                      </td>
                      <td>
                        <span className={`match-status status-${match.status}`}>
                          {match.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {matches.matches.length === 0 && (
                    <tr>
                      <td className="empty-state" colSpan={4}>
                        No matches found for {matches.participant_name}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
