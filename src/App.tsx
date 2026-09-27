import { useEffect, useState } from "react";
import type {
  Division,
  TeamsFile,
  PlayersFile,
  Meta,
} from "./types/data";
import "./index.css";

function useDataFile<T>(file: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return data;
}

export default function App() {
  const divisions = useDataFile<Division[]>("divisions.json", []);
  const teams = useDataFile<TeamsFile>("teams.json", {});
  const players = useDataFile<PlayersFile>("players.json", {});
  const meta = useDataFile<Meta>("meta.json", { last_updated: null });

  const sortedDivisions = [...divisions].sort((a, b) => a.order - b.order);

  return (
    <main className="public-app">
      <h1>CS2 Företagsligan</h1>
      {meta.last_updated && (
        <p className="last-updated">
          Data last updated: {new Date(meta.last_updated).toLocaleString()}
        </p>
      )}

      {sortedDivisions.map((division) => {
        const divisionTeams = Object.entries(teams).filter(
          ([, t]) => t.division_id === division.id
        );
        return (
          <section key={division.id} className="division">
            <h2>{division.name}</h2>
            {divisionTeams.length === 0 && (
              <p className="empty-message">No teams assigned yet.</p>
            )}
            {divisionTeams.map(([teamId, team]) => (
              <article key={teamId} className="team-card">
                <h3>{team.name}</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Elo</th>
                        <th>Level</th>
                        <th>K/D</th>
                        <th>Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.player_ids.map((steamId) => {
                        const p = players[steamId];
                        if (!p) return null;
                        return (
                          <tr key={steamId}>
                            <td>
                              {p.faceit?.avatar && (
                                <img
                                  src={p.faceit.avatar}
                                  alt=""
                                  width={20}
                                  height={20}
                                  className="player-avatar"
                                />
                              )}
                              {p.nickname}
                            </td>
                            <td>{p.faceit?.elo ?? "-"}</td>
                            <td>{p.faceit?.level ?? "-"}</td>
                            <td>{p.faceit?.kd ?? "-"}</td>
                            <td>{p.faceit?.winrate_pct ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </main>
  );
}
