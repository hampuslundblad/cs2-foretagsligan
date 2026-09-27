import { useEffect, useState } from "react";
import type { Division, TeamsFile, PlayersFile, Meta } from "./types/data";
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
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1>CS2 Företagsligan</h1>
      {meta.last_updated && (
        <p style={{ color: "#666", fontSize: 14 }}>
          Data last updated: {new Date(meta.last_updated).toLocaleString()}
        </p>
      )}

      {sortedDivisions.map((division) => {
        const divisionTeams = Object.entries(teams).filter(
          ([, t]) => t.division_id === division.id
        );
        return (
          <section key={division.id} style={{ marginBottom: 40 }}>
            <h2>{division.name}</h2>
            {divisionTeams.length === 0 && (
              <p style={{ color: "#999" }}>No teams assigned yet.</p>
            )}
            {divisionTeams.map(([teamId, team]) => (
              <div key={teamId} style={{ marginBottom: 24 }}>
                <h3>{team.name}</h3>
                <table width="100%" cellPadding={6}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
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
                            {p.avatar && (
                              <img
                                src={p.avatar}
                                alt=""
                                width={20}
                                height={20}
                                style={{ borderRadius: "50%", marginRight: 8, verticalAlign: "middle" }}
                              />
                            )}
                            {p.nickname}
                          </td>
                          <td>{p.elo ?? "-"}</td>
                          <td>{p.level ?? "-"}</td>
                          <td>{p.kd ?? "-"}</td>
                          <td>{p.winrate_pct ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
