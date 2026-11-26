import type { ReactNode } from "react";

export type PublicMatchSheetData = {
  home_team: string;
  away_team: string;
  analyzed_team: string;
  age_group?: string | null;
  competition?: string | null;
  round_label?: string | null;
  played_at?: string | null;
  kickoff_time?: string | null;
  venue?: string | null;
  live_status?: "scheduled" | "live" | "finished" | string | null;
  analyzed_team_is_home?: boolean;
};

type Props = {
  match: PublicMatchSheetData;
  language: "pt" | "en";
};

function formatMatchDate(value: string | null | undefined, language: "pt" | "en") {
  if (!value) return null;
  const date = new Date(value.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "pt" ? "pt-PT" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatKickoff(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

export function PublicMatchSheet({ match, language }: Props) {
  const pt = language === "pt";
  const status = match.live_status === "live"
    ? (pt ? "Em direto" : "Live")
    : match.live_status === "finished"
      ? (pt ? "Terminado" : "Finished")
      : match.live_status === "scheduled"
        ? (pt ? "Agendado" : "Scheduled")
        : null;
  const analysedLocation = match.analyzed_team_is_home === undefined || match.analyzed_team_is_home === null
    ? match.analyzed_team
    : match.analyzed_team + " · " + (match.analyzed_team_is_home ? (pt ? "Casa" : "Home") : (pt ? "Fora" : "Away"));

  const fields: { label: string; value: ReactNode }[] = [
    { label: pt ? "Data" : "Date", value: formatMatchDate(match.played_at, language) },
    { label: pt ? "Hora" : "Kick-off", value: formatKickoff(match.kickoff_time) },
    { label: pt ? "Competição" : "Competition", value: match.competition },
    { label: pt ? "Jornada" : "Round", value: match.round_label },
    { label: pt ? "Escalão" : "Age group", value: match.age_group },
    { label: pt ? "Local" : "Venue", value: match.venue },
    { label: pt ? "Equipa analisada" : "Analysed team", value: analysedLocation },
    { label: pt ? "Estado" : "Status", value: status },
  ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "");

  return (
    <section className="panel min-w-0 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263646] pb-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#83e6a9]">{pt ? "Ficha do jogo" : "Match details"}</p>
          <h2 className="mt-1 text-base font-bold tracking-tight">
            {match.home_team} <span className="muted font-normal">vs</span> {match.away_team}
          </h2>
        </div>
        {status && <span className="rounded-full border border-[#315b47] bg-[#112820] px-2.5 py-1 text-[9px] font-semibold text-[#83e6a9]">{status}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 xl:grid-cols-4">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <p className="muted text-[9px]">{field.label}</p>
            <p className="mt-0.5 break-words text-[11px] font-medium text-[#e0e8ef]">{field.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
