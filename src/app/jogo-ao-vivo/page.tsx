"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, MapPin, Pause,
  Play, RefreshCw, Share2, Timer, Trophy, Users, X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock-store";
import {
  formatDuration,
  liveElapsedSeconds,
  playerCourtSeconds,
  type LiveClock,
  type LiveMatch,
  type PlayerStint,
  type SquadPlayer,
} from "@/lib/live-match";

const INITIAL_FIXTURE = {
  competition: "CD II DIVISÃO | SUB 17 FUTSAL",
  roundLabel: "Jornada 7",
  analysedTeam: "Associação Marista",
  opponent: "Portela",
  matchDate: "2026-11-21",
  kickoffTime: "17:00",
  venue: "Pavilhão Externato Marista Lisboa",
};

type LivePlayer = SquadPlayer & { active: boolean };
type PublicMatchData = {
  match: LiveMatch;
  clock: LiveClock;
  players: LivePlayer[];
  stints: PlayerStint[];
};

function formatMatchDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`));
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Ocorreu um erro inesperado. Tenta novamente.";
}

export default function LiveMatchManagementPage() {
  const supabase = useMemo(() => getSupabase(), []);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState<LiveMatch | null>(null);
  const [clock, setClock] = useState<LiveClock | null>(null);
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [stints, setStints] = useState<PlayerStint[]>([]);
  const [now] = [useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot)];
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [competition, setCompetition] = useState(INITIAL_FIXTURE.competition);
  const [roundLabel, setRoundLabel] = useState(INITIAL_FIXTURE.roundLabel);
  const [analysedTeam, setAnalysedTeam] = useState(INITIAL_FIXTURE.analysedTeam);
  const [opponent, setOpponent] = useState(INITIAL_FIXTURE.opponent);
  const [matchDate, setMatchDate] = useState(INITIAL_FIXTURE.matchDate);
  const [kickoffTime, setKickoffTime] = useState(INITIAL_FIXTURE.kickoffTime);
  const [venue, setVenue] = useState(INITIAL_FIXTURE.venue);

  const elapsedSeconds = liveElapsedSeconds(clock, now);
  const onCourtCount = stints.filter((stint) => stint.ended_second === null).length;
  const publicUrl = activeMatch && typeof window !== "undefined"
    ? `${window.location.origin}/jogo-ao-vivo/${activeMatch.id}`
    : "";

  const refreshMatches = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc("list_public_live_matches");
    if (rpcError) throw rpcError;
    setMatches(Array.isArray(data) ? data as LiveMatch[] : []);
  }, [supabase]);

  const loadMatchData = useCallback(async (matchId: string) => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("get_public_live_match", { p_match_id: matchId });
      if (rpcError) throw rpcError;
      if (!data?.match) throw new Error("Jogo não encontrado.");
      const result = data as PublicMatchData;
      setActiveMatch(result.match);
      setClock(result.clock);
      setPlayers(result.players ?? []);
      setStints(result.stints ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    async function initialise() {
      if (!supabase) {
        setError("A ligação à base de dados não está configurada.");
        return;
      }
      setLoading(true);
      try {
        const { data, error: rpcError } = await supabase.rpc("list_public_live_matches");
        if (rpcError) throw rpcError;
        if (!cancelled) setMatches(Array.isArray(data) ? data as LiveMatch[] : []);
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialise();
    return () => { cancelled = true; };
  }, [supabase]);

  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc("create_public_live_match", {
        p_competition: competition.trim(),
        p_round_label: roundLabel.trim(),
        p_home_team: analysedTeam.trim(),
        p_away_team: opponent.trim(),
        p_analyzed_team: analysedTeam.trim(),
        p_played_at: matchDate,
        p_kickoff_time: kickoffTime,
        p_venue: venue.trim(),
      });
      if (rpcError) throw rpcError;
      if (typeof data !== "string") throw new Error("A base de dados não devolveu o identificador do jogo.");
      await refreshMatches();
      await loadMatchData(data);
      setMessage("Jogo criado. O cronómetro e a gestão do plantel estão disponíveis sem iniciar sessão.");
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function refreshMatch() {
    if (!activeMatch) return;
    await loadMatchData(activeMatch.id);
    await refreshMatches();
  }

  async function controlClock(action: "start" | "pause" | "finish") {
    if (!activeMatch || !supabase || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const rpcName = action === "start"
        ? "start_public_live_clock"
        : action === "pause" ? "pause_public_live_clock" : "finish_public_live_clock";
      const { data, error: rpcError } = await supabase.rpc(rpcName, { p_match_id: activeMatch.id });
      if (rpcError) throw rpcError;
      setClock(data as LiveClock);
      if (action === "finish") {
        await loadMatchData(activeMatch.id);
        await refreshMatches();
        setMessage("Jogo terminado. Todos os tempos em campo foram fechados.");
      } else if (action === "start") {
        setActiveMatch({ ...activeMatch, live_status: "live" });
        await refreshMatches();
      }
    } catch (clockError) {
      setError(getErrorMessage(clockError));
    } finally {
      setSaving(false);
    }
  }

  async function togglePlayer(player: LivePlayer, isOnCourt: boolean) {
    if (!activeMatch || !supabase || busyPlayerId || saving || clock?.status === "finished") return;
    setBusyPlayerId(player.id);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("set_public_live_player", {
        p_match_id: activeMatch.id,
        p_player_id: player.id,
        p_is_on_court: !isOnCourt,
      });
      if (rpcError) throw rpcError;
      await loadMatchData(activeMatch.id);
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage("Link público copiado.");
    } catch {
      setError("Não foi possível copiar automaticamente. Seleciona e copia o endereço apresentado.");
    }
  }

  function selectMatch(match: LiveMatch) {
    setMessage("");
    setError("");
    void loadMatchData(match.id);
  }

  function closeActiveMatch() {
    setActiveMatch(null);
    setClock(null);
    setPlayers([]);
    setStints([]);
    setMessage("");
    setError("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]">
            <Timer size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Jogo ao vivo · Sub-17</h1>
            <p className="muted text-xs">Área pública · sem necessidade de conta ou autenticação</p>
          </div>
        </div>
        <Link href="/" className="btn !px-3 !py-2 text-xs"><ArrowLeft size={14} />SportAnalist</Link>
      </header>

      {!supabase ? (
        <section className="panel p-4 text-sm text-amber-300">
          A ligação à base de dados não está configurada. Contacta o responsável pela aplicação.
        </section>
      ) : (
        <>
          {!activeMatch && (
            <>
              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Trophy size={18} className="text-[#72e9a2]" />
                  <div>
                    <h2 className="text-sm font-semibold">Criar jogo</h2>
                    <p className="muted text-[10px]">Não é necessário iniciar sessão. Preenche os dados e cria a ficha pública.</p>
                  </div>
                </div>
                <form onSubmit={(event) => void createMatch(event)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs text-[#a8b8c7] sm:col-span-2">
                    Competição
                    <input className="field mt-1" value={competition} onChange={(event) => setCompetition(event.target.value)} required maxLength={180} />
                  </label>
                  <label className="text-xs text-[#a8b8c7]">
                    Equipa analisada
                    <input className="field mt-1" value={analysedTeam} onChange={(event) => setAnalysedTeam(event.target.value)} required maxLength={100} />
                  </label>
                  <label className="text-xs text-[#a8b8c7]">
                    Adversário
                    <input className="field mt-1" value={opponent} onChange={(event) => setOpponent(event.target.value)} required maxLength={100} />
                  </label>
                  <label className="text-xs text-[#a8b8c7]">
                    Jornada
                    <input className="field mt-1" value={roundLabel} onChange={(event) => setRoundLabel(event.target.value)} maxLength={80} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-[#a8b8c7]">
                      Data
                      <input type="date" className="field mt-1" value={matchDate} onChange={(event) => setMatchDate(event.target.value)} required />
                    </label>
                    <label className="text-xs text-[#a8b8c7]">
                      Hora
                      <input type="time" className="field mt-1" value={kickoffTime} onChange={(event) => setKickoffTime(event.target.value)} required />
                    </label>
                  </div>
                  <label className="text-xs text-[#a8b8c7] sm:col-span-2">
                    Local
                    <input className="field mt-1" value={venue} onChange={(event) => setVenue(event.target.value)} required maxLength={240} />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                    <p className="muted text-[10px]">A lista pública apresenta nomes e tempos de jogo; não inclui datas de nascimento nem fotografias.</p>
                    <button className="btn btn-primary w-full !py-3 text-sm sm:w-auto" disabled={saving}>
                      <Trophy size={15} />{saving ? "A criar jogo…" : "Criar jogo e abrir cronómetro"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Jogos disponíveis</h2>
                  <button type="button" onClick={() => void refreshMatches()} className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                    <RefreshCw size={13} />Atualizar
                  </button>
                </div>
                {matches.length === 0 ? (
                  <p className="muted text-xs">Ainda não existem jogos criados nesta área.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matches.map((match) => (
                      <button key={match.id} type="button" onClick={() => selectMatch(match)}
                        className="rounded-xl border border-[#263646] bg-[#0b131c] p-3 text-left transition hover:border-[#47637b]">
                        <p className="text-[10px] text-[#85e9ac]">{match.competition}</p>
                        <p className="mt-1 text-sm font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                        <p className="muted mt-1 text-[10px]">{match.round_label} · {formatMatchDate(match.played_at)} · {match.kickoff_time?.slice(0, 5) ?? ""}</p>
                        <p className="mt-2 text-[10px] text-[#79e9aa]">{match.live_status === "live" ? "Em jogo" : match.live_status === "finished" ? "Terminado" : "Agendado"} · Abrir cronómetro</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeMatch && (
            <section className="grid gap-3">
              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#75e8a4]">{activeMatch.competition}</p>
                    <h2 className="mt-1 text-lg font-bold leading-tight">{activeMatch.home_team} <span className="muted font-normal">vs</span> {activeMatch.away_team}</h2>
                    <p className="muted mt-1 text-xs">{activeMatch.round_label} · {formatMatchDate(activeMatch.played_at)} · {activeMatch.kickoff_time?.slice(0, 5)}</p>
                    <p className="muted mt-1 flex items-center gap-1 text-xs"><MapPin size={12} />{activeMatch.venue}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void refreshMatch()} className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                      <RefreshCw size={13} />Atualizar
                    </button>
                    <button type="button" onClick={closeActiveMatch} className="btn !px-2.5 !py-2 text-xs">
                      <X size={13} />Jogos
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#315a45] bg-[#0b1e16] p-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#8ee8ae]">Tempo de jogo</p>
                  <p className="mt-1 font-mono text-5xl font-bold tabular-nums tracking-tight text-white sm:text-6xl">{formatDuration(elapsedSeconds)}</p>
                  <p className="mt-2 text-[10px] text-[#a7c6b3]">
                    {clock?.status === "running" ? "Cronómetro a contar" :
                      clock?.status === "finished" ? "Jogo terminado" :
                      clock?.status === "paused" ? "Cronómetro em pausa" : "Pronto a iniciar"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {clock?.status === "running" ? (
                    <button type="button" className="btn !py-3 text-sm" disabled={saving} onClick={() => void controlClock("pause")}>
                      <Pause size={16} />Pausar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary !py-3 text-sm" disabled={saving || clock?.status === "finished"} onClick={() => void controlClock("start")}>
                      <Play size={16} />{clock?.status === "paused" ? "Retomar" : "Iniciar jogo"}
                    </button>
                  )}
                  <button type="button" className="btn !py-3 text-sm text-rose-200" disabled={saving || clock?.status === "finished"} onClick={() => {
                    if (window.confirm("Terminar o jogo e fechar todos os tempos em campo?")) void controlClock("finish");
                  }}>
                    <CheckCircle2 size={16} />Terminar
                  </button>
                  <span className="muted col-span-2 flex items-center justify-center text-[10px] sm:col-span-1">
                    {onCourtCount}/5 jogadores em campo
                  </span>
                </div>
              </section>

              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Jogadores em campo</h2>
                    <p className="muted mt-0.5 text-[10px]">Toca em Entrar ou Sair para registar cada substituição.</p>
                  </div>
                  <span className="rounded-full border border-[#315b47] bg-[#112820] px-2.5 py-1 text-[10px] text-[#79e9aa]">{onCourtCount} / 5</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {players.map((player) => {
                    const activeStint = stints.some((stint) => stint.player_id === player.id && stint.ended_second === null);
                    const totalSeconds = playerCourtSeconds(stints, player.id, elapsedSeconds);
                    const disablingEntry = !activeStint && onCourtCount >= 5;
                    return (
                      <div key={player.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 ${activeStint ? "border-[#3c8b60] bg-[#10291c]" : "border-[#263646] bg-[#0b131c]"}`}>
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${activeStint ? "bg-[#35d07f] text-[#062012]" : "bg-[#1b2a38] text-[#9eb0c0]"}`}>
                          <Users size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-xs font-semibold leading-snug">{player.full_name}</p>
                          <p className="muted mt-1 flex items-center gap-1 font-mono text-[10px]">
                            <Clock3 size={11} />{formatDuration(totalSeconds)}
                            {activeStint && <span className="ml-1 text-[#79e9aa]">· Em campo</span>}
                          </p>
                        </div>
                        <button type="button"
                          className={`min-h-11 min-w-[76px] rounded-lg px-3 text-xs font-bold ${activeStint ? "border border-[#9a5b4d] bg-[#39201b] text-[#ffb39d]" : "border border-[#315b47] bg-[#112820] text-[#79e9aa]"}`}
                          disabled={saving || busyPlayerId !== null || clock?.status === "finished" || disablingEntry}
                          onClick={() => void togglePlayer(player, activeStint)}>
                          {busyPlayerId === player.id ? "…" : activeStint ? "Sair" : "Entrar"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="muted text-[10px]">O máximo de cinco jogadores em campo é validado pela base de dados. A pausa do cronómetro interrompe a contagem sem retirar os jogadores.</p>
              </section>

              <section className="panel grid gap-2 p-3 sm:p-4">
                <div className="flex items-center gap-2"><Share2 size={17} className="text-[#79e9aa]" /><h2 className="text-sm font-semibold">Página pública do jogo</h2></div>
                <p className="muted text-[10px]">Esta ficha é pública e pode ser consultada por qualquer pessoa. O mesmo link abre uma página de consulta sem os controlos de operação.</p>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <input className="field min-w-0 flex-1 text-xs" value={publicUrl} readOnly aria-label="Link público do jogo" />
                  <button type="button" className="btn btn-primary !py-2 text-xs" onClick={() => void copyPublicLink()}><Copy size={13} />Copiar link</button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="btn !py-2 text-xs"><ExternalLink size={13} />Abrir</a>
                </div>
              </section>
            </section>
          )}
        </>
      )}

      {loading && <p className="muted text-center text-xs">A carregar dados…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
      {message && <div role="status" className="flex items-center justify-between gap-2 rounded-lg border border-[#315b47] bg-[#112820] p-3 text-xs text-[#9aeab6]">{message}<button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem"><X size={13} /></button></div>}

      <footer className="muted mt-auto border-t border-[#263646] pt-3 text-center text-[10px]">
        SportAnalist · Área pública de jogo ao vivo · Sem autenticação
      </footer>
    </main>
  );
}
