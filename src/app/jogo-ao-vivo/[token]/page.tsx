"use client";

import { use, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarDays, Clock3, MapPin, ShieldAlert, Timer, Users } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock-store";
import {
  formatDuration,
  liveElapsedSeconds,
  playerCourtSeconds,
  type LiveClock,
  type LiveMatch,
  type PlayerStint,
} from "@/lib/live-match";

type PublicSquadPlayer = {
  id: string;
  full_name: string;
  display_name: string;
  sort_order: number;
};

type PublicLiveMatch = {
  match: LiveMatch;
  clock: LiveClock;
  players: PublicSquadPlayer[];
  stints: PlayerStint[];
};

function formatMatchDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`));
}

export default function PublicLiveMatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => getSupabase(), []);
  const [data, setData] = useState<PublicLiveMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const elapsedSeconds = liveElapsedSeconds(data?.clock ?? null, now);
  const activePlayers = data?.stints.filter((stint) => stint.ended_second === null).length ?? 0;

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!supabase) {
        setError("A página pública não está configurada.");
        setLoading(false);
        return;
      }
      const { data: result, error: rpcError } = await supabase.rpc("get_public_live_match", { p_match_id: token });
      if (cancelled) return;
      if (rpcError || !result?.match) {
        setError("Este jogo não existe ou está indisponível.");
        setData(null);
      } else {
        setError("");
        setData(result as PublicLiveMatch);
      }
      setLoading(false);
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [supabase, token]);

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-4xl flex-col gap-2 overflow-hidden px-2 py-2 sm:px-5 sm:py-3">
      <header className="flex shrink-0 items-center gap-2 border-b border-[#263646] pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#35d07f1c] text-[#35d07f]">
          <Timer size={19} />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold">SportAnalist · Jogo ao vivo</h1>
          <p className="muted text-[9px]">Tempos de utilização do plantel</p>
        </div>
        <span className="ml-auto rounded-full border border-[#365846] bg-[#12241b] px-2 py-1 text-[8px] text-[#9aeab6]">Público</span>
      </header>

      {loading ? (
        <section className="panel flex min-h-40 items-center justify-center p-5 text-sm text-[#9eb0c0]">A carregar jogo…</section>
      ) : error || !data ? (
        <section className="panel flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert size={32} className="text-amber-300" />
          <h2 className="text-lg font-semibold">Jogo indisponível</h2>
          <p className="muted text-sm">{error}</p>
        </section>
      ) : (
        <>
          <section className="panel grid shrink-0 gap-2 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#75e8a4]">{data.match.competition}</p>
                <h2 className="mt-1 text-base font-bold leading-tight">{data.match.home_team} <span className="muted font-normal">vs</span> {data.match.away_team}</h2>
                <p className="muted mt-1 text-xs">{data.match.round_label}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${data.clock.status === "running" ? "bg-[#112820] text-[#79e9aa]" : data.clock.status === "finished" ? "bg-[#1b2a38] text-[#aebdca]" : "bg-[#322719] text-[#f1c58d]"}`}>
                {data.clock.status === "running" ? "Em jogo" : data.clock.status === "finished" ? "Terminado" : data.clock.status === "paused" ? "Em pausa" : "Agendado"}
              </span>
            </div>
            <div className="grid gap-1 text-[10px] sm:grid-cols-2">
              <p className="muted flex items-center gap-2"><CalendarDays size={14} />{formatMatchDate(data.match.played_at)} · {data.match.kickoff_time?.slice(0, 5)}</p>
              <p className="muted flex items-center gap-2"><MapPin size={14} />{data.match.venue}</p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[#315a45] bg-[#0b1e16] px-3 py-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#8ee8ae]">Tempo decorrido</p>
                <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">{formatDuration(elapsedSeconds)}</p>
              </div>
              <p className="text-[9px] text-[#a7c6b3]">{activePlayers}/5 em campo</p>
            </div>
          </section>

          <section className="panel grid min-h-0 flex-1 content-start gap-1.5 p-2">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold">Tempo por jogador</h2>
              <span className="muted inline-flex items-center gap-1 text-[9px]"><Users size={11} />{data.players.length}/12 jogadores · atualização automática</span>
            </div>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
              {data.players.map((player) => {
                const onCourt = data.stints.some((stint) => stint.player_id === player.id && stint.ended_second === null);
                const seconds = playerCourtSeconds(data.stints, player.id, elapsedSeconds);
                return (
                  <div key={player.id} className={`min-w-0 rounded-lg border px-1.5 py-1.5 text-white ${onCourt ? "border-[#49bd78] bg-[#155c36]" : "border-[#e5a04b] bg-[#935012]"}`}>
                    <div className="flex min-w-0 items-center justify-between gap-1">
                      <p className="truncate text-[10px] font-semibold leading-4" title={player.full_name}>{player.display_name}</p>
                      <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[8px] font-bold text-white/90">
                        {onCourt ? "CAMPO" : "BANCO"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-white/90">
                      <Clock3 size={10} />{formatDuration(seconds)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <footer className="hidden">
        SportAnalist · Página pública de jogo · Dados atualizados automaticamente
      </footer>
    </main>
  );
}
