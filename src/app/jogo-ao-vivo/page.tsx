"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Clock3, Copy, Download, ExternalLink, MapPin, Pause,
  Pencil, Play, RefreshCw, Share2, Timer, Trophy, Trash2, X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock-store";
import {
  formatDuration,
  liveElapsedSeconds,
  playerCourtSeconds,
  playerCourtSecondsInRange,
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

function getMaxCalledPlayers(competition: string): number {
  const normalized = competition.trim().toUpperCase();
  if (normalized === "CD II DIV SENIORES MASCULINOS") return 14;
  if (
    normalized === "CD | SUB 11 FUTSAL"
    || normalized === "FOOTLOURES | FUTSAL | 2026 | SUB 11"
    || normalized === "ENCONTROS MINI FUTSAL - TRAQUINAS"
  ) return 15;
  return 12;
}

type ReportRow = { playerId: string; displayName: string; seconds: number };
type ReportSection = { title: string; durationSeconds: number; rows: ReportRow[] };
type ReportStage = "halftime" | "finished" | null;

function buildReportSection(
  title: string,
  players: LivePlayer[],
  stints: PlayerStint[],
  periodStart: number,
  periodEnd: number,
): ReportSection {
  const rows = players.map((player) => ({
    playerId: player.id,
    displayName: player.display_name || player.full_name,
    seconds: playerCourtSecondsInRange(stints, player.id, periodStart, periodEnd),
  })).sort((a, b) => b.seconds - a.seconds || a.displayName.localeCompare(b.displayName, "pt-PT"));
  return { title, durationSeconds: Math.max(0, periodEnd - periodStart), rows };
}

function renderReportPng(match: LiveMatch, sections: ReportSection[]): string {
  const canvas = document.createElement("canvas");
  const width = 1200;
  const rowHeight = 44;
  const height = 190 + sections.reduce((sum, section) => sum + 104 + section.rows.length * rowHeight, 0)
    + Math.max(0, sections.length - 1) * 28;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível gerar a imagem do relatório.");

  context.fillStyle = "#f4f7f9";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#102033";
  context.fillRect(0, 0, width, 150);
  context.fillStyle = "#8ee8ae";
  context.font = "bold 22px Arial";
  context.fillText("SPORTANALIST · RELATÓRIO DE TEMPOS", 48, 48);
  context.fillStyle = "#ffffff";
  context.font = "bold 30px Arial";
  context.fillText(`${match.home_team} vs ${match.away_team}`, 48, 91);
  context.font = "18px Arial";
  context.fillStyle = "#d5e1e9";
  context.fillText(`${match.competition} · ${formatMatchDate(match.played_at)} · ${match.kickoff_time?.slice(0, 5) ?? ""}`, 48, 125);

  let y = 174;
  sections.forEach((section, sectionIndex) => {
    context.fillStyle = "#102033";
    context.font = "bold 26px Arial";
    context.fillText(section.title, 48, y);
    context.textAlign = "right";
    context.font = "bold 18px Arial";
    context.fillText(`Duração: ${formatDuration(section.durationSeconds)}`, width - 48, y);
    context.textAlign = "left";
    y += 26;
    context.fillStyle = "#1d8050";
    context.fillRect(48, y, width - 96, 42);
    context.fillStyle = "#ffffff";
    context.font = "bold 16px Arial";
    context.fillText("POS.", 68, y + 27);
    context.fillText("JOGADOR", 160, y + 27);
    context.textAlign = "right";
    context.fillText("TEMPO EM CAMPO", width - 68, y + 27);
    context.textAlign = "left";
    y += 42;

    section.rows.forEach((row, rowIndex) => {
      context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#e8eef2";
      context.fillRect(48, y, width - 96, rowHeight);
      context.fillStyle = "#23384a";
      context.font = "17px Arial";
      context.fillText(String(rowIndex + 1), 68, y + 28);
      const name = row.displayName.length > 55 ? `${row.displayName.slice(0, 52)}…` : row.displayName;
      context.fillText(name, 160, y + 28);
      context.textAlign = "right";
      context.font = "bold 17px Arial";
      context.fillText(formatDuration(row.seconds), width - 68, y + 28);
      context.textAlign = "left";
      y += rowHeight;
    });
    if (sectionIndex < sections.length - 1) y += 28;
  });
  return canvas.toDataURL("image/png");
}

function downloadReportCsv(match: LiveMatch, sections: ReportSection[]) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = ["Parte;Posição;Jogador;Tempo;Segundos"];
  sections.forEach((section) => section.rows.forEach((row, index) => {
    lines.push([
      quote(section.title), String(index + 1), quote(row.displayName),
      quote(formatDuration(row.seconds)), String(row.seconds),
    ].join(";"));
  }));
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stem = `${match.played_at}-${match.home_team}-${match.away_team}`.replace(/[^a-z0-9_-]+/gi, "-");
  anchor.href = url;
  anchor.download = `relatorio-tempos-${stem}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [pendingClockAction, setPendingClockAction] = useState<"start" | "pause" | "finish" | null>(null);
  const [reportStage, setReportStage] = useState<ReportStage>(null);
  const [halfTimeImage, setHalfTimeImage] = useState<string | null>(null);
  const [fullReportImage, setFullReportImage] = useState<string | null>(null);
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

  const normalizedCompetition = competition.trim().toUpperCase();
  const isPortelaSenior = normalizedCompetition === "CD II DIV SENIORES MASCULINOS";
  const isJuniores = normalizedCompetition === "CD II DIVISÃO | SUB 19 FUTSAL";
  const isJuvenis = normalizedCompetition === "CD II DIVISÃO | SUB 17 FUTSAL";
  const isIniciados = normalizedCompetition === "CD I DIVISÃO | SUB 15 FUTSAL";
  const isInfantis = normalizedCompetition === "CD II DIVISÃO | SUB 13 FUTSAL";
  const isBenjamins = normalizedCompetition === "CD | SUB 11 FUTSAL"
    || normalizedCompetition === "FOOTLOURES | FUTSAL | 2026 | SUB 11";
  const isTraquinas = normalizedCompetition === "ENCONTROS MINI FUTSAL - TRAQUINAS";
  const maxCalledPlayers = getMaxCalledPlayers(competition);
  const lowerRosterCompetition = isPortelaSenior
    ? "CD II DIVISÃO | SUB 19 FUTSAL"
    : isJuniores
      ? "CD II DIVISÃO | SUB 17 FUTSAL"
      : isJuvenis
        ? "CD I DIVISÃO | SUB 15 FUTSAL"
        : isIniciados
          ? "CD II DIVISÃO | SUB 13 FUTSAL"
          : isInfantis
            ? "CD | SUB 11 FUTSAL"
            : isBenjamins
              ? "ENCONTROS MINI FUTSAL - TRAQUINAS"
              : "";
  const primaryRosterLabel = isPortelaSenior
    ? "Seniores Masculinos"
    : isJuniores
      ? "Juniores Sub-19"
      : isJuvenis
        ? "Juvenis Sub-17"
        : isIniciados
          ? "Iniciados Sub-15"
          : isInfantis
            ? "Infantis Sub-13"
            : isBenjamins
              ? "Benjamins Sub-11"
              : "Traquinas";
  const lowerRosterLabel = isPortelaSenior
    ? "Juniores Sub-19"
    : isJuniores
      ? "Juvenis Sub-17"
      : isJuvenis
        ? "Iniciados Sub-15"
        : isIniciados
          ? "Infantis Sub-13"
          : isInfantis
            ? "Benjamins Sub-11"
            : "Traquinas";
  const visibleRosterCount = rosterPlayers.length + (showLowerRoster ? lowerRosterPlayers.length : 0);

  const elapsedSeconds = liveElapsedSeconds(clock, now);
  const onCourtCount = stints.filter((stint) => stint.ended_second === null).length;
  const reportSections = useMemo<ReportSection[]>(() => {
    if (!clock || !reportStage) return [];
    if (reportStage === "halftime" && clock.first_half_seconds !== null) {
      return [buildReportSection("1ª Parte", players, stints, 0, clock.first_half_seconds)];
    }
    if (reportStage === "finished") {
      const finalSeconds = clock.elapsed_seconds;
      const firstHalfSeconds = clock.first_half_seconds ?? finalSeconds;
      return [
        buildReportSection("1ª Parte", players, stints, 0, firstHalfSeconds),
        buildReportSection("2ª Parte", players, stints, firstHalfSeconds, finalSeconds),
        buildReportSection("Tempo total do jogo", players, stints, 0, finalSeconds),
      ];
    }
    return [];
  }, [clock, players, reportStage, stints]);
  const publicUrl = activeMatch && typeof window !== "undefined"
    ? `${window.location.origin}/jogo-ao-vivo/${activeMatch.id}`
    : "";
  const scheduledMatches = matches.filter((match) => match.live_status === "scheduled");
  const liveMatches = matches.filter((match) => match.live_status === "live");
  const finishedMatches = matches.filter((match) => match.live_status === "finished");

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
      const nextReportStage = result.clock.status === "finished"
        ? "finished"
        : result.clock.first_half_seconds !== null ? "halftime" : null;
      setReportStage(nextReportStage);
      if (nextReportStage === "halftime" && result.clock.first_half_seconds !== null) {
        const firstHalf = buildReportSection("1ª Parte", result.players ?? [], result.stints ?? [], 0, result.clock.first_half_seconds);
        setHalfTimeImage(renderReportPng(result.match, [firstHalf]));
        setFullReportImage(null);
      } else if (nextReportStage === "finished") {
        const finalSeconds = result.clock.elapsed_seconds;
        const firstHalfSeconds = result.clock.first_half_seconds ?? finalSeconds;
        const sections = [
          buildReportSection("1ª Parte", result.players ?? [], result.stints ?? [], 0, firstHalfSeconds),
          buildReportSection("2ª Parte", result.players ?? [], result.stints ?? [], firstHalfSeconds, finalSeconds),
          buildReportSection("Tempo total do jogo", result.players ?? [], result.stints ?? [], 0, finalSeconds),
        ];
        setHalfTimeImage(renderReportPng(result.match, [sections[0]]));
        setFullReportImage(renderReportPng(result.match, sections));
      } else {
        setHalfTimeImage(null);
        setFullReportImage(null);
      }
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
        // Preselect the complete roster only when it fits within this competition's call-up limit.
        setSelectedPlayerIds(roster.length > 0 && roster.length <= maxCalledPlayers ? roster.map((player) => player.id) : []);
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
  }, [competition, maxCalledPlayers, supabase]);

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
        await refreshMatches();
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialise();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        void refreshMatches().catch((refreshError) => {
          if (!cancelled) setError(getErrorMessage(refreshError));
        });
      }
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [refreshMatches, supabase]);

  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    if (selectedPlayerIds.length < 1 || selectedPlayerIds.length > maxCalledPlayers) {
      setError(`Seleciona entre 1 e ${maxCalledPlayers} jogadores para este escalão.`);
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
      setHalfTimeImage(null);
      setFullReportImage(null);
      await refreshMatches();
      await loadMatchData(data);
      setMessage("Jogo criado. O cronómetro e a gestão do plantel estão disponíveis sem iniciar sessão.");
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function controlClock(action: "start" | "pause" | "finish", isHalftime = false) {
    if (!activeMatch || !supabase || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const rpcName = action === "start"
        ? "start_public_live_clock"
        : action === "pause" ? "pause_public_live_clock" : "finish_public_live_clock";
      const rpcArgs = action === "pause"
        ? { p_match_id: activeMatch.id, p_is_halftime: isHalftime }
        : { p_match_id: activeMatch.id };
      const { data, error: rpcError } = await supabase.rpc(rpcName, rpcArgs);
      if (rpcError) throw rpcError;
      setClock(data as LiveClock);
      if (action === "finish") {
        await loadMatchData(activeMatch.id);
        await refreshMatches();
        setMessage("Jogo terminado. Foram calculados os tempos da 1ª parte, 2ª parte e total.");
      } else if (action === "start") {
        setActiveMatch({ ...activeMatch, live_status: "live" });
        await refreshMatches();
        setMessage(clock?.first_half_seconds !== null && clock?.first_half_seconds !== undefined
          ? "Cronómetro retomado. A 2ª parte está em curso."
          : "Cronómetro iniciado.");
      } else if (isHalftime) {
        await loadMatchData(activeMatch.id);
        setMessage("Intervalo registado. Os tempos da 1ª parte estão disponíveis no relatório.");
      } else {
        setMessage("Cronómetro em pausa.");
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
    setHalfTimeImage(null);
    setFullReportImage(null);
    void loadMatchData(match.id);
  }

  function returnToMatchList() {
    setActiveMatch(null);
    setClock(null);
    setPlayers([]);
    setStints([]);
    setEditingNames(false);
    setPendingClockAction(null);
    setReportStage(null);
    setHalfTimeImage(null);
    setFullReportImage(null);
    setError("");
    setMessage("");
    void refreshMatches().catch((refreshError) => setError(getErrorMessage(refreshError)));
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
    const atLimit = selectedPlayerIds.length >= maxCalledPlayers && !checked;
    return (
      <label key={player.id} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px] ${checked ? "border-[#3b8b60] bg-[#10291c] text-white" : "border-[#263646] bg-[#101923] text-[#c1ccd6]"} ${atLimit ? "opacity-45" : ""}`}>
        <input
          type="checkbox"
          className="accent-emerald-500"
          checked={checked}
          disabled={atLimit || saving}
          onChange={(event) => setSelectedPlayerIds((current) =>
            event.target.checked
              ? current.length < maxCalledPlayers ? [...current, player.id] : current
              : current.filter((id) => id !== player.id)
          )}
        />
        <span className="min-w-0 truncate" title={player.full_name}>{player.display_name}</span>
      </label>
    );
  }

  return (
    <main className={`mx-auto flex w-full max-w-5xl flex-col gap-2 px-2 py-2 sm:px-5 sm:py-3 ${activeMatch ? reportStage ? "min-h-[100svh] overflow-y-auto" : "h-[100svh] overflow-hidden" : "min-h-screen"}`}>
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
                      <option value="CD II DIVISÃO | SUB 13 FUTSAL">CD II DIVISÃO | SUB 13 FUTSAL · Infantis</option>
                      <option value="CD | SUB 11 FUTSAL">CD | SUB 11 FUTSAL · Benjamins</option>
                      <option value="FOOTLOURES | FUTSAL | 2026 | SUB 11">FOOTLOURES | FUTSAL | 2026 | SUB 11 · Benjamins</option>
                      <option value="ENCONTROS MINI FUTSAL - TRAQUINAS">ENCONTROS MINI FUTSAL - TRAQUINAS · Traquinas</option>
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
                        <p className="text-xs font-semibold text-white">Convocatória · até {maxCalledPlayers} jogadores</p>
                        <p className="muted text-[10px]">Plantel AMPortela · {primaryRosterLabel}</p>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${selectedPlayerIds.length === maxCalledPlayers ? "bg-[#123d28] text-[#91efb0]" : "bg-[#432d16] text-[#ffd08a]"}`}>
                        {selectedPlayerIds.length}/{maxCalledPlayers} selecionados
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
                    <button className="btn btn-primary w-full !py-3 text-sm sm:w-auto" disabled={saving || selectedPlayerIds.length < 1 || selectedPlayerIds.length > maxCalledPlayers || visibleRosterCount < 1}>
                      <Trophy size={15} />{saving ? "A criar jogo…" : "Criar jogo e abrir cronómetro"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Jogos por iniciar</h2>
                  <button type="button" onClick={() => void refreshMatches().catch((refreshError) => setError(getErrorMessage(refreshError)))} className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                    <RefreshCw size={13} />Atualizar lista
                  </button>
                </div>
                {scheduledMatches.length === 0 ? (
                  <p className="muted text-xs">Não existem jogos agendados.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scheduledMatches.map((match) => (
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
                          aria-label={"Remover jogo " + match.home_team + " vs " + match.away_team}
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

              {liveMatches.length > 0 && (
                <section className="panel grid gap-3 p-3 sm:p-4">
                  <h2 className="text-sm font-semibold">Jogos em curso <span className="muted font-normal">({liveMatches.length})</span></h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {liveMatches.map((match) => (
                      <button key={match.id} type="button" onClick={() => selectMatch(match)}
                        className="rounded-xl border border-[#315a45] bg-[#0b1e16] p-3 text-left transition hover:border-[#49bd78]">
                        <p className="text-[10px] text-[#85e9ac]">{match.competition}</p>
                        <p className="mt-1 text-sm font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                        <p className="muted mt-1 text-[10px]">{match.round_label} · {formatMatchDate(match.played_at)} · {match.kickoff_time?.slice(0, 5) ?? ""}</p>
                        <p className="mt-2 text-[10px] font-semibold text-[#8ee8ae]">Em curso · Abrir cronómetro</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="panel grid gap-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Jogos terminados <span className="muted font-normal">({finishedMatches.length})</span></h2>
                  <button type="button" onClick={() => void refreshMatches().catch((refreshError) => setError(getErrorMessage(refreshError)))}
                    className="btn !px-2.5 !py-2 text-xs" disabled={loading}>
                    <RefreshCw size={13} />Atualizar
                  </button>
                </div>
                {finishedMatches.length === 0 ? (
                  <p className="muted text-xs">Ainda não existem jogos terminados registados.</p>
                ) : (
                  <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                    {finishedMatches.map((match) => (
                      <button key={match.id} type="button" onClick={() => selectMatch(match)}
                        className="rounded-xl border border-[#315a45] bg-[#0b1e16] p-3 text-left transition hover:border-[#49bd78]">
                        <p className="text-[10px] font-semibold text-[#85e9ac]">{match.competition}</p>
                        <p className="mt-1 text-sm font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                        <p className="muted mt-1 text-[10px]">{match.round_label ? match.round_label + " · " : ""}{formatMatchDate(match.played_at)} · {match.kickoff_time?.slice(0, 5) ?? ""}</p>
                        <p className="muted mt-1 text-[10px]"><MapPin size={10} className="mr-1 inline" />{match.venue}</p>
                        <p className="mt-2 text-[10px] font-semibold text-[#8ee8ae]">Terminado · Consultar tempos e relatório</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeMatch && (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 justify-start">
                <button type="button" onClick={returnToMatchList} className="btn !min-h-8 !px-2.5 !py-1.5 text-[10px]">
                  <ArrowLeft size={12} />Voltar à lista de jogos
                </button>
              </div>
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
                      <button type="button" className="btn !min-h-10 !px-2 !py-2 text-[10px]" disabled={saving} onClick={() => setPendingClockAction("pause")}>
                        <Pause size={13} />Pausar
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary !min-h-10 !px-2 !py-2 text-[10px]" disabled={saving || clock?.status === "finished"} onClick={() => setPendingClockAction("start")}>
                        <Play size={13} />{clock?.status === "paused" ? "Retomar" : "Iniciar"}
                      </button>
                    )}
                    <button type="button" className="btn !min-h-10 !px-2 !py-2 text-[10px] text-rose-200" disabled={saving || clock?.status === "finished"} onClick={() => setPendingClockAction("finish")}>
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
                    <p className="muted text-[9px]">{onCourtCount}/5 em campo · {players.length}/{getMaxCalledPlayers(activeMatch.competition)} convocados · nomes editáveis</p>
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
                        <textarea
                          aria-label={`Nome curto de ${player.full_name}`}
                          className="w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[10px] font-semibold leading-tight text-white outline-none placeholder:text-white/60 focus:ring-0"
                          value={player.display_name}
                          maxLength={40}
                          rows={2}
                          onChange={(event) => setPlayers((current) => current.map((item) =>
                            item.id === player.id ? { ...item, display_name: event.target.value } : item
                          ))}
                          onBlur={() => void savePlayerDisplayName(player)}
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
                        <span className="block whitespace-normal break-words text-[10px] font-semibold leading-tight" title={player.full_name}>
                          {player.display_name}
                        </span>
                        <span className="mt-1 flex min-w-0 items-center justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-0.5 font-mono text-[9px] text-white/90">
                            <Clock3 size={10} />{formatDuration(totalSeconds)}
                          </span>
                          <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[8px] font-bold text-white/90">
                            {busyPlayerId === player.id ? "…" : activeStint ? "CAMPO" : "BANCO"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>


              {reportStage && reportSections.length > 0 && (
                <section className="panel grid gap-3 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">{reportStage === "halftime" ? "Relatório do intervalo" : "Relatório final do jogo"}</h2>
                      <p className="muted text-[10px]">Tempos individuais ordenados do maior para o menor · valores em minutos e segundos</p>
                    </div>
                    <button type="button" className="btn !min-h-8 !px-2 !py-1 text-[10px]" onClick={() => downloadReportCsv(activeMatch, reportSections)}>
                      <Download size={12} />Exportar CSV
                    </button>
                  </div>

                  {reportStage === "finished" && clock?.first_half_seconds === null && (
                    <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-2 text-[10px] text-amber-200">
                      O intervalo não foi registado. Para não inventar uma divisão, todo o tempo jogado foi atribuído à 1ª parte e a 2ª parte apresenta zero.
                    </p>
                  )}

                  <div className="grid gap-3">
                    {reportSections.map((section) => (
                      <div key={section.title} className="overflow-x-auto rounded-lg border border-[#263646]">
                        <div className="flex items-center justify-between gap-2 bg-[#142330] px-3 py-2">
                          <h3 className="text-xs font-semibold text-white">{section.title}</h3>
                          <span className="font-mono text-[10px] text-[#8ee8ae]">{formatDuration(section.durationSeconds)}</span>
                        </div>
                        <table className="w-full min-w-[280px] text-left text-[10px]">
                          <thead className="bg-[#1d8050] text-white">
                            <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Jogador</th><th className="px-2 py-2 text-right">Tempo em campo</th></tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, index) => (
                              <tr key={row.playerId} className={index % 2 === 0 ? "bg-[#101923]" : "bg-[#182533]"}>
                                <td className="px-2 py-2 text-[#93a8b8]">{index + 1}</td>
                                <td className="px-2 py-2 font-medium text-white">{row.displayName}</td>
                                <td className="px-2 py-2 text-right font-mono text-[#b7f0cc]">{formatDuration(row.seconds)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {halfTimeImage && (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold">Imagem · 1ª Parte</h3>
                        <a className="btn !min-h-8 !px-2 !py-1 text-[10px]" href={halfTimeImage} download={`relatorio-1a-parte-${activeMatch.played_at}.png`}>
                          <Download size={12} />PNG
                        </a>
                      </div>
                      <img src={halfTimeImage} alt="Tabela de tempos de jogo da primeira parte" className="h-auto w-full rounded-lg border border-[#263646]" />
                    </div>
                  )}

                  {reportStage === "finished" && fullReportImage && (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold">Imagem · relatório completo</h3>
                        <a className="btn !min-h-8 !px-2 !py-1 text-[10px]" href={fullReportImage} download={`relatorio-completo-${activeMatch.played_at}.png`}>
                          <Download size={12} />PNG
                        </a>
                      </div>
                      <img src={fullReportImage} alt="Relatório completo com as tabelas da primeira parte, segunda parte e tempo total" className="h-auto w-full rounded-lg border border-[#263646]" />
                    </div>
                  )}
                </section>
              )}

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


      {pendingClockAction && activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="clock-confirm-title" className="w-full max-w-md rounded-2xl border border-[#36516a] bg-[#101a25] p-4 shadow-2xl">
            {pendingClockAction === "start" ? (
              <>
                <h2 id="clock-confirm-title" className="text-base font-bold text-white">{clock?.status === "paused" ? "Retomar cronómetro?" : "Confirmar início do jogo?"}</h2>
                <p className="mt-2 text-xs text-[#b8c7d3]">
                  {clock?.status === "paused"
                    ? "O tempo de jogo vai continuar a contar a partir do ponto em que ficou pausado."
                    : "Ao confirmar, começa a contagem do tempo de jogo e ficam disponíveis os registos de entradas e saídas dos jogadores."}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="btn !px-3 !py-2 text-xs" disabled={saving} onClick={() => setPendingClockAction(null)}>Cancelar</button>
                  <button type="button" className="btn btn-primary !px-3 !py-2 text-xs" disabled={saving} onClick={() => { setPendingClockAction(null); void controlClock("start"); }}>
                    <Play size={13} />{saving ? "A processar…" : "Confirmar"}
                  </button>
                </div>
              </>
            ) : pendingClockAction === "pause" ? (
              <>
                <h2 id="clock-confirm-title" className="text-base font-bold text-white">Esta pausa é para intervalo?</h2>
                <p className="mt-2 text-xs text-[#b8c7d3]">
                  {clock?.first_half_seconds !== null
                    ? "O intervalo já foi registado. Só é possível efetuar uma pausa normal."
                    : "Ao confirmar o intervalo, fica guardado o fim da 1ª parte e é criado o relatório dos tempos de cada jogador."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" className="btn !px-3 !py-2 text-xs" disabled={saving} onClick={() => { setPendingClockAction(null); void controlClock("pause", false); }}>
                    {saving ? "A processar…" : "Não, pausa normal"}
                  </button>
                  {clock?.first_half_seconds === null && (
                    <button type="button" className="btn btn-primary !px-3 !py-2 text-xs" disabled={saving} onClick={() => { setPendingClockAction(null); void controlClock("pause", true); }}>
                      <CheckCircle2 size={13} />Sim, registar intervalo
                    </button>
                  )}
                </div>
                <button type="button" className="mt-3 w-full text-center text-xs text-[#9badbb]" disabled={saving} onClick={() => setPendingClockAction(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <h2 id="clock-confirm-title" className="text-base font-bold text-white">Confirmar fim de jogo?</h2>
                <p className="mt-2 text-xs text-[#b8c7d3]">
                  Esta ação fecha todos os tempos ainda em aberto e calcula os relatórios da 1ª parte, 2ª parte e tempo total. Não será possível continuar o cronómetro.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="btn !px-3 !py-2 text-xs" disabled={saving} onClick={() => setPendingClockAction(null)}>Cancelar</button>
                  <button type="button" className="btn !border-rose-800 !bg-rose-950 !px-3 !py-2 text-xs text-rose-100" disabled={saving} onClick={() => { setPendingClockAction(null); void controlClock("finish"); }}>
                    <CheckCircle2 size={13} />{saving ? "A terminar…" : "Terminar jogo"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
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
