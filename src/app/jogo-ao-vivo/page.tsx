"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, MapPin, Pause,
  Pencil, Play, RefreshCw, Share2, Timer, Trophy, Trash2, X,
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
} from "@/lib/live-match";

const INITIAL_FIXTURE = {
  competition: "CD II DIVISÃO | SUB 17 FUTSAL",
  roundLabel: "",
  opponent: "",
  matchDate: "",
  kickoffTime: "",
  venue: "",
};

type LivePlayer = {
  id: string;
  full_name: string;
  display_name: string;
  sort_order: number;
  active: boolean;
};
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
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [competition, setCompetition] = useState(INITIAL_FIXTURE.competition);
  const [roundLabel, setRoundLabel] = useState(INITIAL_FIXTURE.roundLabel);
  const analysedTeam = "AMPortela";
  const [opponent, setOpponent] = useState(INITIAL_FIXTURE.opponent);
  const [isHome, setIsHome] = useState(true);
  const [matchDate, setMatchDate] = useState(INITIAL_FIXTURE.matchDate);
  const [kickoffTime, setKickoffTime] = useState(INITIAL_FIXTURE.kickoffTime);
  const [venue, setVenue] = useState(INITIAL_FIXTURE.venue);
  const [rosterPlayers, setRosterPlayers] = useState<LivePlayer[]>([]);
  const [lowerRosterPlayers, setLowerRosterPlayers] = useState<LivePlayer[]>([]);
  const [showLowerRoster, setShowLowerRoster] = useState(false);
  const [loadingLowerRoster, setLoadingLowerRoster] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  const isPortelaSenior = competition.trim().toUpperCase() === "CD II DIV SENIORES MASCULINOS";
  const isJuniores = competition.trim().toUpperCase() === "CD II DIVISÃO | SUB 19 FUTSAL";
  const isJuvenis = competition.trim().toUpperCase() === "CD II DIVISÃO | SUB 17 FUTSAL";
  const lowerRosterCompetition = isPortelaSenior
    ? "CD II DIVISÃO | SUB 19 FUTSAL"
    : isJuniores
      ? "CD II DIVISÃO | SUB 17 FUTSAL"
      : isJuvenis
        ? "CD I DIVISÃO | SUB 15 FUTSAL"
        : "";
  const primaryRosterLabel = isPortelaSenior
    ? "Seniores Masculinos"
    : isJuniores
      ? "Juniores Sub-19"
      : isJuvenis
        ? "Juvenis Sub-17"
        : "Iniciados Sub-15";
  const lowerRosterLabel = isPortelaSenior
    ? "Juniores Sub-19"
    : isJuniores
      ? "Juvenis Sub-17"
      : "Iniciados Sub-15";
  const visibleRosterCount = rosterPlayers.length + (showLowerRoster ? lowerRosterPlayers.length : 0);

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
      setEditingNames(false);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadRoster() {
      if (!supabase) return;
      setError("");
      try {
        const { data, error: rosterError } = await supabase.rpc("list_public_live_roster", {
          p_competition: competition.trim(),
        });
        if (rosterError) throw rosterError;
        if (cancelled) return;
        const roster = Array.isArray(data) ? data as LivePlayer[] : [];
        setRosterPlayers(roster);
        // Only the Juvenis roster has exactly twelve players; preselect that complete squad.
        // Other squads have more options, so choose twelve for each fixture.
        setSelectedPlayerIds(roster.length === 12 ? roster.map((player) => player.id) : []);
      } catch (rosterError) {
        if (!cancelled) {
          setRosterPlayers([]);
          setSelectedPlayerIds([]);
          setError(getErrorMessage(rosterError));
        }
      }
    }
    void loadRoster();
    return () => { cancelled = true; };
  }, [competition, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadLowerRoster() {
      setLowerRosterPlayers([]);
      if (!supabase || !showLowerRoster || !lowerRosterCompetition) {
        setLoadingLowerRoster(false);
        return;
      }
      setLoadingLowerRoster(true);
      try {
        const { data, error: rosterError } = await supabase.rpc("list_public_live_roster", {
          p_competition: lowerRosterCompetition,
        });
        if (rosterError) throw rosterError;
        if (!cancelled) setLowerRosterPlayers(Array.isArray(data) ? data as LivePlayer[] : []);
      } catch (rosterError) {
        if (!cancelled) {
          setLowerRosterPlayers([]);
          setError(getErrorMessage(rosterError));
        }
      } finally {
        if (!cancelled) setLoadingLowerRoster(false);
      }
    }
    void loadLowerRoster();
    return () => { cancelled = true; };
  }, [competition, lowerRosterCompetition, showLowerRoster, supabase]);

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
    if (selectedPlayerIds.length < 1 || selectedPlayerIds.length > 12) {
      setError("Seleciona entre 1 e 12 jogadores para este jogo.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc("create_public_live_match", {
        p_competition: competition.trim(),
        p_round_label: roundLabel.trim(),
        p_amportela: analysedTeam.trim(),
        p_opponent: opponent.trim(),
        p_analyzed_team: analysedTeam.trim(),
        p_played_at: matchDate,
        p_kickoff_time: kickoffTime,
        p_venue: venue.trim(),
        p_player_ids: selectedPlayerIds,
        p_is_home: isHome,
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

  async function savePlayerDisplayName(player: LivePlayer) {
    if (!supabase || !activeMatch) return;
    const displayName = player.display_name.trim();
    if (!displayName || displayName.length > 40) {
      setError("O nome apresentado deve ter entre 1 e 40 caracteres.");
      await loadMatchData(activeMatch.id);
      return;
    }
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("set_public_live_player_name", {
        p_match_id: activeMatch.id,
        p_player_id: player.id,
        p_display_name: displayName,
      });
      if (rpcError) throw rpcError;
      setMessage("Nome atualizado.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
      await loadMatchData(activeMatch.id);
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

  async function deleteScheduledMatch(match: LiveMatch) {
    if (!supabase || deletingMatchId) return;
    const fixtureName = `${match.home_team} vs ${match.away_team}`;
    const confirmed = window.confirm(
      `Eliminar definitivamente o jogo agendado ${fixtureName}? Esta ação só é permitida antes de iniciar o cronómetro.`
    );
    if (!confirmed) return;

    setDeletingMatchId(match.id);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc("delete_public_scheduled_match", {
        p_match_id: match.id,
      });
      if (rpcError) throw rpcError;
      if (data !== true) throw new Error("Não foi possível confirmar a remoção do jogo.");
      setMatches((current) => current.filter((item) => item.id !== match.id));
      setMessage("Jogo agendado removido.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
      await refreshMatches();
    } finally {
      setDeletingMatchId(null);
    }
  }

  function renderRosterOption(player: LivePlayer) {
    const checked = selectedPlayerIds.includes(player.id);
    const atLimit = selectedPlayerIds.length >= 12 && !checked;
    return (
      <label key={player.id} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px] ${checked ? "border-[#3b8b60] bg-[#10291c] text-white" : "border-[#263646] bg-[#101923] text-[#c1ccd6]"} ${atLimit ? "opacity-45" : ""}`}>
        <input
          type="checkbox"
          className="accent-emerald-500"
          checked={checked}
          disabled={atLimit || saving}
          onChange={(event) => setSelectedPlayerIds((current) =>
            event.target.checked
              ? current.length < 12 ? [...current, player.id] : current
              : current.filter((id) => id !== player.id)
          )}
        />
        <span className="min-w-0 truncate" title={player.full_name}>{player.display_name}</span>
      </label>
    );
  }

  return (
    <main className={`mx-auto flex w-full max-w-5xl flex-col gap-2 px-2 py-2 sm:px-5 sm:py-3 ${activeMatch ? "h-[100svh] overflow-hidden" : "min-h-screen"}`}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#35d07f1c] text-[#35d07f]">
            <Timer size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold">Jogo ao vivo</h1>
            <p className="muted text-[10px]">Área pública · sem autenticação</p>
          </div>
        </div>
        <Link href="/" className="btn !px-2 !py-1.5 text-[10px]"><ArrowLeft size={14} />SportAnalist</Link>
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
                    <select
                      className="field mt-1"
                      value={competition}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCompetition(value);
                        // Clear the previous competition's roster immediately while the new one loads.
                        setRosterPlayers([]);
                        setLowerRosterPlayers([]);
                        setShowLowerRoster(false);
                        setSelectedPlayerIds([]);
                      }}
                      required
                    >
                      <option value="CD I DIVISÃO | SUB 15 FUTSAL">CD I DIVISÃO | SUB 15 FUTSAL · Iniciados</option>
                      <option value="CD II DIVISÃO | SUB 17 FUTSAL">CD II DIVISÃO | SUB 17 FUTSAL · Juvenis</option>
                      <option value="CD II DIVISÃO | SUB 19 FUTSAL">CD II DIVISÃO | SUB 19 FUTSAL · Juniores</option>
                      <option value="CD II DIV SENIORES MASCULINOS">CD II DIV SENIORES MASCULINOS</option>
                    </select>
                  </label>
                  <label className="text-xs text-[#a8b8c7]">
                    Equipa analisada
                    <input className="field mt-1" value={analysedTeam} readOnly aria-readonly="true" />
                  </label>
                  <label className="text-xs text-[#a8b8c7]">
                    Adversário
                    <input className="field mt-1" value={opponent} onChange={(event) => setOpponent(event.target.value)} required maxLength={100} />
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#315b47] bg-[#10251a] px-3 py-2.5 text-xs text-white">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-emerald-500"
                      checked={isHome}
                      onChange={(event) => setIsHome(event.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">AMPortela joga em casa</span>
                      <span className="muted mt-0.5 block text-[10px]">
                        {isHome
                          ? "AMPortela será identificada como equipa da casa."
                          : "AMPortela será identificada como equipa visitante."}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-[#263646] bg-[#101923] px-3 py-2 text-[10px] sm:col-span-2">
                    <span className="muted">Identificação:</span>
                    <strong className="text-white">{isHome ? "AMPortela" : (opponent.trim() || "Adversário")} vs {isHome ? (opponent.trim() || "Adversário") : "AMPortela"}</strong>
                  </div>
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
                  <div className="grid gap-2 rounded-xl border border-[#263646] bg-[#0b131c] p-3 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-white">Convocatória · até 12 jogadores</p>
                        <p className="muted text-[10px]">Plantel AMPortela · {primaryRosterLabel}</p>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${selectedPlayerIds.length === 12 ? "bg-[#123d28] text-[#91efb0]" : "bg-[#432d16] text-[#ffd08a]"}`}>
                        {selectedPlayerIds.length}/12 selecionados
                      </span>
                    </div>
                    {lowerRosterCompetition && (
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#315b47] bg-[#10251a] px-2.5 py-2 text-[10px] text-white">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-500"
                          checked={showLowerRoster}
                          disabled={saving}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setShowLowerRoster(checked);
                            if (!checked) {
                              const lowerIds = new Set(lowerRosterPlayers.map((player) => player.id));
                              setSelectedPlayerIds((current) => current.filter((id) => !lowerIds.has(id)));
                            }
                          }}
                        />
                        <span>
                          <span className="block font-semibold">Mostrar plantel do escalão inferior</span>
                          <span className="muted block text-[9px]">Permitir convocar jogadores de {lowerRosterLabel}</span>
                        </span>
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                      {rosterPlayers.map(renderRosterOption)}
                      {showLowerRoster && (
                        <>
                          <div className="col-span-full mt-1 border-t border-[#263646] pt-2 text-[10px] font-semibold text-[#8de9ad]">
                            Plantel inferior · {lowerRosterLabel}
                          </div>
                          {lowerRosterPlayers.map(renderRosterOption)}
                          {loadingLowerRoster && <p className="col-span-full muted text-[10px]">A carregar plantel de {lowerRosterLabel}…</p>}
                          {!loadingLowerRoster && lowerRosterPlayers.length === 0 && (
                            <p className="col-span-full text-[10px] text-amber-300">Não foi possível carregar o plantel inferior. Confirma se executaste a migração 0012.</p>
                          )}
                        </>
                      )}
                    </div>
                    {rosterPlayers.length === 0 ? (
                      <p className="text-[10px] text-amber-300">Não foi possível carregar o plantel. Confirma se executaste a migração 0012.</p>
                    ) : (
                      <p className="muted text-[10px]">Disponíveis: {visibleRosterCount}. Só os jogadores selecionados serão incluídos no jogo.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                    <p className="muted text-[10px]">A lista pública apresenta nomes e tempos de jogo; não inclui datas de nascimento nem fotografias.</p>
                    <button className="btn btn-primary w-full !py-3 text-sm sm:w-auto" disabled={saving || selectedPlayerIds.length < 1 || selectedPlayerIds.length > 12 || visibleRosterCount < 1}>
                      <Trophy size={15} />{saving ? "A criar jogo…" : "Criar jogo e abrir cronómetro"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Jogos por iniciar</h2>
                  <button type="button" onClick={() => void refreshMatches()} className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                    <RefreshCw size={13} />Atualizar
                  </button>
                </div>
                {matches.length === 0 ? (
                  <p className="muted text-xs">Não existem jogos agendados disponíveis. Os jogos iniciados deixam de aparecer nesta lista.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matches.map((match) => (
                      <div key={match.id} className="flex min-w-0 gap-2">
                        <button type="button" onClick={() => selectMatch(match)}
                          className="min-w-0 flex-1 rounded-xl border border-[#263646] bg-[#0b131c] p-3 text-left transition hover:border-[#47637b]">
                          <p className="text-[10px] text-[#85e9ac]">{match.competition}</p>
                          <p className="mt-1 text-sm font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                          <p className="muted mt-1 text-[10px]">{match.round_label} · {formatMatchDate(match.played_at)} · {match.kickoff_time?.slice(0, 5) ?? ""}</p>
                          <p className="mt-2 text-[10px] text-[#79e9aa]">Agendado · Abrir cronómetro</p>
                        </button>
                        <button
                          type="button"
                          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-rose-900/70 bg-rose-950/30 text-rose-300 transition hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Remover jogo ${match.home_team} vs ${match.away_team}`}
                          title="Remover jogo agendado"
                          disabled={deletingMatchId !== null}
                          onClick={() => void deleteScheduledMatch(match)}
                        >
                          {deletingMatchId === match.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeMatch && (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <section className="panel grid shrink-0 gap-2 p-2 sm:p-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#75e8a4]">{activeMatch.competition}</p>
                  <h2 className="mt-1 text-lg font-bold leading-tight">{activeMatch.home_team} <span className="muted font-normal">vs</span> {activeMatch.away_team}</h2>
                  <p className="muted mt-1 text-xs">{activeMatch.round_label} · {formatMatchDate(activeMatch.played_at)} · {activeMatch.kickoff_time?.slice(0, 5)}</p>
                  <p className="muted mt-1 flex items-center gap-1 text-xs"><MapPin size={12} />{activeMatch.venue}</p>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="rounded-xl border border-[#315a45] bg-[#0b1e16] px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#8ee8ae]">Tempo de jogo</p>
                    <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">{formatDuration(elapsedSeconds)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {clock?.status === "running" ? (
                      <button type="button" className="btn !min-h-10 !px-2 !py-2 text-[10px]" disabled={saving} onClick={() => void controlClock("pause")}>
                        <Pause size={13} />Pausar
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary !min-h-10 !px-2 !py-2 text-[10px]" disabled={saving || clock?.status === "finished"} onClick={() => void controlClock("start")}>
                        <Play size={13} />{clock?.status === "paused" ? "Retomar" : "Iniciar"}
                      </button>
                    )}
                    <button type="button" className="btn !min-h-10 !px-2 !py-2 text-[10px] text-rose-200" disabled={saving || clock?.status === "finished"} onClick={() => {
                      if (window.confirm("Terminar o jogo e fechar todos os tempos em campo?")) void controlClock("finish");
                    }}>
                      <CheckCircle2 size={13} />Terminar
                    </button>
                    <span className="col-span-2 text-center text-[9px] text-[#a7c6b3]">{onCourtCount}/5 em campo · {clock?.status === "running" ? "A contar" : clock?.status === "finished" ? "Terminado" : clock?.status === "paused" ? "Em pausa" : "Pronto"}</span>
                  </div>
                </div>
              </section>

              <section className="panel grid min-h-0 flex-1 content-start gap-1.5 p-2 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold">Plantel · minutos em campo</h2>
                    <p className="muted text-[9px]">{onCourtCount}/5 em campo · {players.length}/12 jogadores · nomes editáveis</p>
                  </div>
                  <button type="button" className="btn !min-h-8 !px-2 !py-1 text-[9px]" onClick={() => setEditingNames((current) => !current)}>
                    <Pencil size={11} />{editingNames ? "Concluir nomes" : "Editar nomes"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                  {players.map((player) => {
                    const activeStint = stints.some((stint) => stint.player_id === player.id && stint.ended_second === null);
                    const totalSeconds = playerCourtSeconds(stints, player.id, elapsedSeconds);
                    const disablingEntry = !activeStint && onCourtCount >= 5;
                    const cardColors = activeStint
                      ? "border-[#49bd78] bg-[#155c36] hover:bg-[#1b7043]"
                      : "border-[#e5a04b] bg-[#935012] hover:bg-[#a85e16]";
                    const cardDisabled = saving || busyPlayerId !== null || clock?.status === "finished" || disablingEntry;
                    return editingNames ? (
                      <div key={player.id} className={`min-w-0 rounded-lg border px-1.5 py-1 ${activeStint ? "border-[#49bd78] bg-[#155c36]" : "border-[#e5a04b] bg-[#935012]"}`}>
                        <input
                          aria-label={`Nome curto de ${player.full_name}`}
                          className="w-full min-w-0 truncate border-0 bg-transparent p-0 text-[10px] font-semibold leading-4 text-white outline-none placeholder:text-white/60 focus:ring-0"
                          value={player.display_name}
                          maxLength={40}
                          onChange={(event) => setPlayers((current) => current.map((item) =>
                            item.id === player.id ? { ...item, display_name: event.target.value } : item
                          ))}
                          onBlur={() => void savePlayerDisplayName(player)}
                          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        />
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-0.5 font-mono text-[9px] text-white/90">
                            <Clock3 size={10} />{formatDuration(totalSeconds)}
                          </span>
                          <span className="text-[8px] font-bold text-white/90">{activeStint ? "CAMPO" : "BANCO"}</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={player.id}
                        type="button"
                        className={`w-full min-w-0 rounded-lg border px-1.5 py-1 text-left text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-60 ${cardColors}`}
                        disabled={cardDisabled}
                        aria-pressed={activeStint}
                        aria-label={`${player.display_name}, ${activeStint ? "em campo" : "no banco"}, ${formatDuration(totalSeconds)}. ${activeStint ? "Retirar do campo" : "Colocar em campo"}`}
                        onClick={() => void togglePlayer(player, activeStint)}
                      >
                        <span className="flex min-w-0 items-center justify-between gap-1">
                          <span className="truncate text-[10px] font-semibold leading-4" title={player.full_name}>{player.display_name}</span>
                          <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[8px] font-bold text-white/90">
                            {busyPlayerId === player.id ? "…" : activeStint ? "CAMPO" : "BANCO"}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-0.5 font-mono text-[9px] text-white/90">
                          <Clock3 size={10} />{formatDuration(totalSeconds)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="flex shrink-0 items-center gap-1.5 border-t border-[#263646] pt-1.5">
                <Share2 size={12} className="shrink-0 text-[#79e9aa]" />
                <input className="field min-w-0 flex-1 !py-1 text-[9px]" value={publicUrl} readOnly aria-label="Link público do jogo" />
                <button type="button" className="btn !min-h-7 !px-2 !py-1 text-[9px]" onClick={() => void copyPublicLink()}><Copy size={11} />Copiar</button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="btn !min-h-7 !px-2 !py-1 text-[9px]"><ExternalLink size={11} /></a>
              </div>
            </section>
          )}
        </>
      )}

      {loading && <p className="muted text-center text-xs">A carregar dados…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
      {message && <div role="status" className="flex items-center justify-between gap-2 rounded-lg border border-[#315b47] bg-[#112820] p-3 text-xs text-[#9aeab6]">{message}<button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem"><X size={13} /></button></div>}

      <footer className={`muted mt-auto border-t border-[#263646] pt-2 text-center text-[9px] ${activeMatch ? "hidden" : ""}`}>
        SportAnalist · Área pública de jogo ao vivo · Sem autenticação
      </footer>
    </main>
  );
}
