"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, MapPin,
  Pause, Play, RefreshCw, Share2, ShieldAlert, Timer, Trophy, Users, X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { CloudSetup } from "@/components/cloud-setup";
import type { AppRole } from "@/lib/types";
import {
  ASSOCIACAO_MARISTA_SUB17_SQUAD,
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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>("viewer");
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState<LiveMatch | null>(null);
  const [clock, setClock] = useState<LiveClock | null>(null);
  const [stints, setStints] = useState<PlayerStint[]>([]);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
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

  const canEdit = Boolean(projectId && userId && (role === "admin" || role === "analyst"));
  const elapsedSeconds = liveElapsedSeconds(clock, now);
  const onCourtCount = stints.filter((stint) => stint.ended_second === null).length;
  const publicUrl = shareToken && typeof window !== "undefined"
    ? `${window.location.origin}/jogo-ao-vivo/${shareToken}`
    : "";

  const handleWorkspaceReady = useCallback((id: string, uid: string, memberRole: AppRole) => {
    setProjectId(id);
    setUserId(uid);
    setRole(memberRole);
  }, []);

  const handleSignOut = useCallback(() => {
    setProjectId(null);
    setUserId(null);
    setRole("viewer");
    setPlayers([]);
    setMatches([]);
    setActiveMatch(null);
    setClock(null);
    setStints([]);
    setShareToken(null);
  }, []);

  const loadMatches = useCallback(async (targetProject: string) => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("matches")
      .select("id, competition, round_label, home_team, away_team, analyzed_team, played_at, kickoff_time, venue, live_status")
      .eq("project_id", targetProject)
      .not("competition", "is", null)
      .order("played_at", { ascending: false })
      .limit(30);
    if (queryError) throw queryError;
    setMatches((data ?? []) as LiveMatch[]);
  }, [supabase]);

  const loadMatchData = useCallback(async (match: LiveMatch, createShare = true) => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const [clockResult, stintsResult, tokenResult] = await Promise.all([
        supabase.from("live_match_clocks")
          .select("elapsed_seconds, started_at, status")
          .eq("match_id", match.id)
          .single(),
        supabase.from("match_player_stints")
          .select("id, match_id, player_id, started_second, ended_second, created_at")
          .eq("match_id", match.id)
          .order("started_second", { ascending: true }),
        supabase.rpc("get_match_share_token", { target_match: match.id }),
      ]);
      if (clockResult.error) throw clockResult.error;
      if (stintsResult.error) throw stintsResult.error;
      setActiveMatch(match);
      setClock(clockResult.data as LiveClock);
      setStints((stintsResult.data ?? []) as PlayerStint[]);
      let token = typeof tokenResult.data === "string" ? tokenResult.data : null;
      if (!token && createShare) {
        const { data, error: createError } = await supabase.rpc("create_match_share", { target_match: match.id });
        if (!createError && typeof data === "string") token = data;
      }
      setShareToken(token);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!supabase || !projectId || !canEdit) return;
    let cancelled = false;
    async function initialise() {
      setLoading(true);
      setError("");
      try {
        const playerRows = ASSOCIACAO_MARISTA_SUB17_SQUAD.map((player) => ({
          project_id: projectId,
          ...player,
          active: true,
        }));
        const { error: seedError } = await supabase.from("squad_players")
          .upsert(playerRows, { onConflict: "project_id,fpf_player_id" });
        if (seedError) throw seedError;

        const [playersResult, matchesResult] = await Promise.all([
          supabase.from("squad_players")
            .select("id, fpf_player_id, full_name, sort_order")
            .eq("project_id", projectId)
            .eq("active", true)
            .order("sort_order"),
          supabase.from("matches")
            .select("id, competition, round_label, home_team, away_team, analyzed_team, played_at, kickoff_time, venue, live_status")
            .eq("project_id", projectId)
            .not("competition", "is", null)
            .order("played_at", { ascending: false })
            .limit(30),
        ]);
        if (playersResult.error) throw playersResult.error;
        if (matchesResult.error) throw matchesResult.error;
        if (cancelled) return;
        setPlayers((playersResult.data ?? []) as SquadPlayer[]);
        setMatches((matchesResult.data ?? []) as LiveMatch[]);
      } catch (initialiseError) {
        if (!cancelled) setError(getErrorMessage(initialiseError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialise();
    return () => { cancelled = true; };
  }, [supabase, projectId, canEdit]);

  async function createMatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !projectId || !userId || !canEdit) return;
    if (!competition.trim() || !analysedTeam.trim() || !opponent.trim() || !matchDate || !kickoffTime || !venue.trim()) {
      setError("Preenche a competição, as duas equipas, a data, a hora e o local.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: insertError } = await supabase.from("matches").insert({
        project_id: projectId,
        home_team: analysedTeam.trim(),
        away_team: opponent.trim(),
        analyzed_team: analysedTeam.trim(),
        youtube_url: "",
        played_at: matchDate,
        kickoff_time: kickoffTime,
        competition: competition.trim(),
        round_label: roundLabel.trim() || null,
        venue: venue.trim(),
        live_status: "scheduled",
        created_by: userId,
      }).select("id, competition, round_label, home_team, away_team, analyzed_team, played_at, kickoff_time, venue, live_status").single();
      if (insertError || !data) throw insertError ?? new Error("Não foi possível criar o jogo.");

      const newMatch = data as LiveMatch;
      const { data: token, error: shareError } = await supabase.rpc("create_match_share", { target_match: newMatch.id });
      if (shareError) throw shareError;

      setMatches((current) => [newMatch, ...current.filter((match) => match.id !== newMatch.id)]);
      await loadMatchData(newMatch, false);
      setShareToken(typeof token === "string" ? token : null);
      setMessage("Jogo criado. A ficha pública já está disponível para partilhar.");
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function refreshMatch() {
    if (!activeMatch || !supabase) return;
    await loadMatchData(activeMatch, false);
  }

  async function controlClock(action: "start" | "pause" | "finish") {
    if (!activeMatch || !supabase || !canEdit || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const rpcName = action === "start"
        ? "start_live_match_clock"
        : action === "pause" ? "pause_live_match_clock" : "finish_live_match_clock";
      const { data, error: rpcError } = await supabase.rpc(rpcName, { target_match: activeMatch.id });
      if (rpcError) throw rpcError;
      setClock(data as LiveClock);
      if (action === "finish") {
        setActiveMatch({ ...activeMatch, live_status: "finished" });
        await loadMatchData({ ...activeMatch, live_status: "finished" }, false);
        setMessage("Jogo terminado. Todos os tempos em aberto foram fechados.");
      } else if (action === "start") {
        setActiveMatch({ ...activeMatch, live_status: "live" });
      }
    } catch (clockError) {
      setError(getErrorMessage(clockError));
    } finally {
      setSaving(false);
    }
  }

  async function togglePlayer(player: SquadPlayer, isOnCourt: boolean) {
    if (!activeMatch || !supabase || !canEdit || busyPlayerId || clock?.status === "finished") return;
    setBusyPlayerId(player.id);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("set_live_match_player", {
        target_match: activeMatch.id,
        target_player: player.id,
        is_on_court: !isOnCourt,
      });
      if (rpcError) throw rpcError;
      await refreshMatch();
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
    void loadMatchData(match);
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
            <p className="muted text-xs">Cronómetro e tempo de utilização dos jogadores</p>
          </div>
        </div>
        <Link href="/" className="btn !px-3 !py-2 text-xs"><ArrowLeft size={14} />SportAnalist</Link>
      </header>

      {supabase ? (
        <CloudSetup supabase={supabase} onWorkspaceReady={handleWorkspaceReady} onSignOut={handleSignOut} />
      ) : (
        <section className="panel p-4 text-sm text-amber-300">
          Supabase não está configurado. Configura a ligação à base de dados para criar jogos e guardar tempos.
        </section>
      )}

      {projectId && canEdit && (
        <section className="panel grid gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-[#72e9a2]" />
            <div>
              <h2 className="text-sm font-semibold">Criar jogo</h2>
              <p className="muted text-[10px]">Os campos estão pré-preenchidos com o próximo jogo indicado.</p>
            </div>
          </div>
          <form onSubmit={(event) => void createMatch(event)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-[#a8b8c7] sm:col-span-2">
              Competição
              <input className="field mt-1" value={competition} onChange={(event) => setCompetition(event.target.value)} required />
            </label>
            <label className="text-xs text-[#a8b8c7]">
              Equipa analisada
              <input className="field mt-1" value={analysedTeam} onChange={(event) => setAnalysedTeam(event.target.value)} required />
            </label>
            <label className="text-xs text-[#a8b8c7]">
              Adversário
              <input className="field mt-1" value={opponent} onChange={(event) => setOpponent(event.target.value)} required />
            </label>
            <label className="text-xs text-[#a8b8c7]">
              Jornada
              <input className="field mt-1" value={roundLabel} onChange={(event) => setRoundLabel(event.target.value)} />
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
              <input className="field mt-1" value={venue} onChange={(event) => setVenue(event.target.value)} required />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="muted text-[10px]">A ficha pública terá apenas nomes e tempos de jogo; não inclui fotografias nem datas de nascimento.</p>
              <button className="btn btn-primary w-full !py-3 text-sm sm:w-auto" disabled={saving}>
                <Trophy size={15} />{saving ? "A criar jogo…" : "Criar jogo e abrir cronómetro"}
              </button>
            </div>
          </form>
        </section>
      )}

      {projectId && canEdit && (
        <section className="panel grid gap-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Jogos do plantel</h2>
            <span className="muted text-[10px]">{matches.length} jogos</span>
          </div>
          {matches.length === 0 ? (
            <p className="muted text-xs">Ainda não existem jogos nesta área.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((match) => (
                <button key={match.id} type="button" onClick={() => selectMatch(match)}
                  className={`rounded-xl border p-3 text-left transition ${activeMatch?.id === match.id ? "border-[#35d07f] bg-[#35d07f12]" : "border-[#263646] bg-[#0b131c] hover:border-[#47637b]"}`}>
                  <p className="text-[10px] text-[#85e9ac]">{match.competition}</p>
                  <p className="mt-1 text-sm font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                  <p className="muted mt-1 text-[10px]">{match.round_label} · {formatMatchDate(match.played_at)} · {match.kickoff_time?.slice(0, 5) ?? ""}</p>
                </button>
              ))}
            </div>
          )}
        </section>
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
              <button type="button" onClick={() => void refreshMatch()} className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                <RefreshCw size={13} />Atualizar
              </button>
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
                      {player.sort_order / 10}
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
                    <a href={`https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/${player.fpf_player_id}`}
                      target="_blank" rel="noreferrer" aria-label={`Ficha FPF de ${player.full_name}`}
                      className="px-1 text-[#8197aa] hover:text-white">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                );
              })}
            </div>
            <p className="muted text-[10px]">O máximo de cinco jogadores em campo é validado também pela base de dados. A pausa do cronómetro interrompe a contagem sem retirar os jogadores.</p>
          </section>

          {publicUrl && (
            <section className="panel grid gap-2 p-3 sm:p-4">
              <div className="flex items-center gap-2"><Share2 size={17} className="text-[#79e9aa]" /><h2 className="text-sm font-semibold">Página pública do jogo</h2></div>
              <p className="muted text-[10px]">Qualquer pessoa com o link pode consultar o cronómetro e os tempos individuais. A edição continua reservada aos analistas.</p>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <input className="field min-w-0 flex-1 text-xs" value={publicUrl} readOnly aria-label="Link público do jogo" />
                <button type="button" className="btn btn-primary !py-2 text-xs" onClick={() => void copyPublicLink()}><Copy size={13} />Copiar link</button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="btn !py-2 text-xs"><ExternalLink size={13} />Abrir</a>
              </div>
            </section>
          )}
        </section>
      )}

      {loading && <p className="muted text-center text-xs">A carregar dados…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
      {message && <div role="status" className="flex items-center justify-between gap-2 rounded-lg border border-[#315b47] bg-[#112820] p-3 text-xs text-[#9aeab6]">{message}<button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem"><X size={13} /></button></div>}

      <footer className="muted mt-auto border-t border-[#263646] pt-3 text-center text-[10px]">
        SportAnalist · Cronometragem de jogadores · Sub-17
      </footer>
    </main>
  );
}
