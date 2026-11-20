export type SquadPlayer = {
  id: string;
  fpf_player_id: string;
  full_name: string;
  sort_order: number;
};

export const ASSOCIACAO_MARISTA_SUB17_SQUAD = [
  { fpf_player_id: "2007016", full_name: "Afonso Silva Gomes Cidade Costa", sort_order: 10 },
  { fpf_player_id: "1957910", full_name: "Daniel Dias Ferreira", sort_order: 20 },
  { fpf_player_id: "2050057", full_name: "Duarte Caldeira Fernandes Nunes Ferreira", sort_order: 30 },
  { fpf_player_id: "1979810", full_name: "Duarte Geraldo Ribeiro", sort_order: 40 },
  { fpf_player_id: "1899081", full_name: "Francisco Maria Tovar Rei Ribeiro Dias", sort_order: 50 },
  { fpf_player_id: "2041159", full_name: "Guilherme De Almeida Rodrigues Vasconcelos Relvas", sort_order: 60 },
  { fpf_player_id: "2042079", full_name: "João Maria Espada Feio Vieira Gonçalves", sort_order: 70 },
  { fpf_player_id: "2046130", full_name: "João Pedro Ferreira Fernandes", sort_order: 80 },
  { fpf_player_id: "2049081", full_name: "Lourenço Costa Pinto Coelho", sort_order: 90 },
  { fpf_player_id: "1953488", full_name: "Sebastião Tomé Baptista", sort_order: 100 },
  { fpf_player_id: "2042148", full_name: "Simão Cardoso Da Silva", sort_order: 110 },
] as const;

export type LiveMatch = {
  id: string;
  competition: string;
  round_label: string | null;
  home_team: string;
  away_team: string;
  analyzed_team: string;
  played_at: string;
  kickoff_time: string | null;
  venue: string | null;
  live_status: "scheduled" | "live" | "finished";
};

export type LiveClock = {
  elapsed_seconds: number;
  started_at: string | null;
  status: "scheduled" | "running" | "paused" | "finished";
};

export type PlayerStint = {
  id: string;
  match_id: string;
  player_id: string;
  started_second: number;
  ended_second: number | null;
  created_at?: string;
};

export function liveElapsedSeconds(clock: LiveClock | null, nowMs = Date.now()): number {
  if (!clock) return 0;
  const additional = clock.status === "running" && clock.started_at
    ? Math.max(0, Math.floor((nowMs - new Date(clock.started_at).getTime()) / 1000))
    : 0;
  return clock.elapsed_seconds + additional;
}

export function playerCourtSeconds(
  stints: readonly PlayerStint[],
  playerId: string,
  elapsedSeconds: number,
): number {
  return stints
    .filter((stint) => stint.player_id === playerId)
    .reduce((total, stint) => total + Math.max(0, (stint.ended_second ?? elapsedSeconds) - stint.started_second), 0);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
