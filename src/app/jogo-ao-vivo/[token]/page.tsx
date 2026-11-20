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
      const { data: result, error: rpcError } = await supabase.rpc("get_public_live_match", { p_share_token: token });
      if (cancelled) return;
      if (rpcError || !result?.match) {
        setError("Este link não é válido ou a partilha foi desativada pelo responsável.");
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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6">
      <header className="flex items-center gap-3 border-b border-[#263646] pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]">
          <Timer size={24} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold">SportAnalist · Jogo ao vivo</h1>
          <p className="muted text-[10px]">Acompanhamento público dos tempos de utilização</p>
        </div>
        <span className="ml-auto rounded-full border border-[#365846] bg-[#12241b] px-2 py-1 text-[9px] text-[#9aeab6]">Público</span>
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
          <section className="panel grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#75e8a4]">{data.match.competition}</p>
                <h2 className="mt-1 text-xl font-bold leading-tight">{data.match.home_team} <span className="muted font-normal">vs</span> {data.match.away_team}</h2>
                <p className="muted mt-1 text-xs">{data.match.round_label}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${data.clock.status === "running" ? "bg-[#112820] text-[#79e9aa]" : data.clock.status === "finished" ? "bg-[#1b2a38] text-[#aebdca]" : "bg-[#322719] text-[#f1c58d]"}`}>
                {data.clock.status === "running" ? "Em jogo" : data.clock.status === "finished" ? "Terminado" : data.clock.status === "paused" ? "Em pausa" : "Agendado"}
              </span>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <p className="muted flex items-center gap-2"><CalendarDays size={14} />{formatMatchDate(data.match.played_at)} · {data.match.kickoff_time?.slice(0, 5)}</p>
              <p className="muted flex items-center gap-2"><MapPin size={14} />{data.match.venue}</p>
            </div>
            <div className="rounded-2xl border border-[#315a45] bg-[#0b1e16] p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#8ee8ae]">Tempo decorrido</p>
              <p className="mt-1 font-mono text-5xl font-bold tabular-nums tracking-tight text-white sm:text-6xl">{formatDuration(elapsedSeconds)}</p>
              <p className="mt-2 text-[10px] text-[#a7c6b3]">{activePlayers} jogadores em campo</p>
            </div>
          </section>

          <section className="panel grid gap-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Tempo de jogo por jogador</h2>
                <p className="muted mt-0.5 text-[10px]">Atualização automática a cada 10 segundos</p>
              </div>
              <span className="muted inline-flex items-center gap-1 text-[10px]"><Users size={13} />{data.players.length} jogadores</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.players.map((player) => {
                const onCourt = data.stints.some((stint) => stint.player_id === player.id && stint.ended_second === null);
                const seconds = playerCourtSeconds(data.stints, player.id, elapsedSeconds);
                return (
                  <div key={player.id} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${onCourt ? "border-[#3c8b60] bg-[#10291c]" : "border-[#263646] bg-[#0b131c]"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-semibold leading-snug">{player.full_name}</p>
                      <p className="muted mt-1 flex items-center gap-1 font-mono text-[11px]">
                        <Clock3 size={12} />{formatDuration(seconds)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] ${onCourt ? "bg-[#173d2a] text-[#8af0ad]" : "bg-[#1a2733] text-[#9eb0c0]"}`}>
                      {onCourt ? "Em campo" : "No banco"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <footer className="muted mt-auto border-t border-[#263646] pt-3 text-center text-[10px]">
        SportAnalist · Página pública de jogo · Dados atualizados automaticamente
      </footer>
    </main>
  );
}
