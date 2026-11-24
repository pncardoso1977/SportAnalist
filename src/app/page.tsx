"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowDownToLine, CircleHelp, Clock3, Copy, FilePlus2,
  Globe2, Link2, LogOut, Menu, Play, Plus, RefreshCw, Share2, ShieldCheck, Timer, Trash2, Video, X,
} from "lucide-react";
import { DEFAULT_EVENT_TYPES, ZONE_LABELS, type EventMoment, type EventType, type Match, type MatchEvent, type MatchVideo, type Zone } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { CloudSetup } from "@/components/cloud-setup";
import type { AppRole } from "@/lib/types";
import { analyzeYouTubeGoals, isFirebaseAIConfigured, type DetectedGoal } from "@/lib/firebase-ai";
import { calculateGoalScores, formatGoalScore } from "@/lib/goal-score";
import { formatDuration, playerCourtSecondsInRange, type PlayerStint } from "@/lib/live-match";

type Language = "pt" | "en";
type AiGoalSuggestion = DetectedGoal & { id: string; confirmed: boolean };
type ImportedLivePlayer = { id: string; full_name: string; display_name: string; sort_order: number; active: boolean };
type ImportedLiveMatchData = {
  clock: { elapsed_seconds: number; first_half_seconds: number | null; started_at: string | null; status: "scheduled" | "running" | "paused" | "finished" };
  players: ImportedLivePlayer[];
  stints: PlayerStint[];
};
type YouTubePlayer = {
  getCurrentTime: () => number;
  destroy: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};
type YouTubePlayerApi = {
  Player: new (elementId: string, options: {
    videoId: string;
    playerVars: Record<string, number>;
    events: { onReady: () => void; onStateChange: () => void; onError: () => void };
  }) => YouTubePlayer;
};
type PlayerWindow = Window & { YT?: YouTubePlayerApi; onYouTubeIframeAPIReady?: () => void };
type DbMatchEventRow = {
  id: string; match_id: string; event_type_id: string; team_id: string; video_second: number; moment: EventMoment; zone: Zone; outcome: string | null;
  attacking_team: string | null; defending_team: string | null; created_by: string | null;
  created_at: string; youtube_url: string;
  event_types?: { name_pt: string; name_en: string } | null;
};

const COPY = {
  pt: {
    subtitle: "ANÁLISE TÉCNICO-TÁTICA DE FUTSAL", match: "Jogo em análise", analyzed: "Equipa analisada", sideMenu: "Menu", closeMenu: "Fechar menu", newMatch: "Novo jogo", savedMatches: "Jogos guardados", currentMatch: "Jogo ativo", mobileViewOnly: "No telemóvel, os eventos são apenas para consulta. Usa um tablet ou computador para registar eventos.",
    opponent: "Adversário", youtube: "Link do vídeo YouTube", load: "Carregar vídeo", video: "Vídeo do jogo",
    videoHelp: "Insere um link YouTube para associar o vídeo à análise.", videoUnavailable: "Vídeo não carregado ou incorporação indisponível.",
    currentTime: "Tempo atual", setTime: "Ir para segundo", capture: "Atalhos de registo", outcome: "Resultado / observação (opcional)", outcomePlaceholder: "Ex.: remate defendido, golo, bola recuperada…", attackMoment: "Momento de ataque", defenseMoment: "Momento de defesa", momentColumn: "Momento", resultColumn: "Resultado", autoRegisterHint: "Cada atalho regista o evento, o momento e a zona, com o timestamp do vídeo recuado 10 segundos.", savedEvent: "Evento registado", events: "Eventos", zone: "Zona do campo", left: "Esquerda",
    center: "Central", right: "Direita", attackTeam: "Equipa em ataque", defenseTeam: "Equipa em defesa",
    stats: "Indicadores do jogo", attacks: "Ataques", counters: "Contra", timeline: "Cronologia de eventos",
    filter: "Todos os eventos", allZones: "Todas as zonas", empty: "Ainda não existem eventos neste jogo.",
    event: "Evento", time: "Tempo", teams: "Ataque / Defesa", action: "Ação", open: "Abrir vídeo",
    delete: "Eliminar", export: "Exportar CSV", configure: "Configurar eventos", newEvent: "Nome do evento (PT)",
    newEventEn: "Event name (EN)", counter: "É um evento de contra", create: "Criar evento", normal: "Evento normal",
    counterYes: "Evento de contra", lang: "Idioma", demo: "Modo demonstração", connected: "Supabase ligado",
    saveLocal: "Guardado neste navegador", saveCloud: "Sincronizado com Supabase", linkBad: "Link YouTube inválido.",
    loading: "A carregar vídeo…", loaded: "Vídeo carregado. O registo usa o segundo atual de reprodução.",
    copyLink: "Copiar link", created: "Evento registado", removed: "Evento eliminado", confirmDelete: "Eliminar este evento?",
    configHint: "Tipos personalizados ficam no navegador em modo demonstração; com Supabase são partilhados pelo projeto.",
    matchHelp: "Cada jogo tem uma equipa analisada, adversário e vídeo próprio.", noVideo: "Sem vídeo", noActiveMatch: "Sem jogo ativo. Carrega um vídeo ou abre um jogo no histórico para consultar os eventos e as estatísticas.",
    keyboard: "Atalhos", keyboardHint: "Teclas 1–9 registam diretamente o evento correspondente.",
    role: "Perfil", viewer: "Observador", analyst: "Analista", admin: "Administrador", configurator: "Configurador",
    readOnly: "O teu perfil tem permissões apenas de leitura.", loadVideoForEvents: "Carrega um vídeo do jogo para ativar o registo de eventos.", setup: "Configuração de serviços", setupHint: "Para colaboração em tempo real, configure as variáveis Supabase e aplique a migração SQL.",
    statsTotal: "Total de eventos", matchHistory: "Histórico de jogos", noMatches: "Ainda não existem jogos guardados neste projeto.", openMatch: "Abrir jogo", savedOn: "Guardado em", matchOpened: "Jogo carregado do histórico.", roleDemo: "Perfil demonstrativo", noAuth: "A autenticação será ativada quando Supabase estiver configurado.",
    eventRequired: "Preenche os nomes do evento.", saveError: "Não foi possível guardar no servidor. O registo foi mantido localmente.",
    members: "Gerir utilizadores", memberEmail: "Email do utilizador", memberRole: "Perfil", addMember: "Adicionar utilizador", memberHint: "O utilizador tem de criar conta primeiro. A função é aplicada no projeto e validada pela base de dados.", memberAdded: "Utilizador adicionado ao projeto.",
    aiTitle: "Deteção de golos com IA", aiHint: "Analisa diretamente o URL do YouTube (também funciona com vídeos não listados). A IA sugere momentos; confirma cada golo antes de o guardar.",
    aiRun: "Procurar golos com IA", aiRunning: "A analisar vídeo…", aiNotConfigured: "Firebase AI Logic não está configurado. Adiciona as credenciais Firebase e a chave reCAPTCHA Enterprise do App Check às variáveis de ambiente.",
    aiConsent: "Autorizo o envio do vídeo e do respetivo áudio/imagem para análise pelo Google Gemini. No nível gratuito, os conteúdos podem ser utilizados pela Google para melhorar os seus produtos.",
    aiConsentRequired: "É necessário confirmar a autorização de análise antes de enviar o vídeo.",
    aiAnalyzedKit: "Equipamento da equipa analisada", aiOpponentKit: "Equipamento do adversário",
    aiSide: "Equipa que marcou", aiUncertain: "Por confirmar", aiMarker: "Marcador", aiEvidence: "Evidência", aiConfidence: "Confiança",
    aiZone: "Zona", aiConfirm: "Confirmar e registar golo", aiConfirmed: "Golo registado", aiNoGoals: "A IA não identificou golos candidatos.",
    aiError: "Não foi possível analisar o vídeo.", aiDuplicate: "Já existe um golo registado perto deste timestamp.",

  },
  en: {
    subtitle: "FUTSAL TECHNICAL & TACTICAL ANALYSIS", match: "Match analysis", analyzed: "Team analysed", sideMenu: "Menu", closeMenu: "Close menu", newMatch: "New match", savedMatches: "Saved matches", currentMatch: "Active match", mobileViewOnly: "On a phone, events are read-only. Use a tablet or computer to record events.",
    opponent: "Opponent", youtube: "YouTube video URL", load: "Load video", video: "Match video",
    videoHelp: "Paste a YouTube link to associate the video with this analysis.", videoUnavailable: "Video not loaded or embedding unavailable.",
    currentTime: "Current time", setTime: "Seek to second", capture: "Quick event capture", outcome: "Outcome / note (optional)", outcomePlaceholder: "e.g. shot saved, goal, possession won…", attackMoment: "Attacking phase", defenseMoment: "Defensive phase", momentColumn: "Moment", resultColumn: "Outcome", autoRegisterHint: "Each shortcut records the event, phase and zone with the video timestamp set 10 seconds before the click.", savedEvent: "Event recorded", events: "Events", zone: "Court zone", left: "Left",
    center: "Center", right: "Right", attackTeam: "Attacking team", defenseTeam: "Defending team",
    stats: "Match indicators", attacks: "Attacks", counters: "Against", timeline: "Event timeline",
    filter: "All events", allZones: "All zones", empty: "No events recorded for this match yet.",
    event: "Event", time: "Time", teams: "Attack / Defence", action: "Action", open: "Open video",
    delete: "Delete", export: "Export CSV", configure: "Configure events", newEvent: "Event name (PT)",
    newEventEn: "Event name (EN)", counter: "Is this an opposition event?", create: "Create event", normal: "Regular event",
    counterYes: "Opposition event", lang: "Language", demo: "Demo mode", connected: "Supabase connected",
    saveLocal: "Saved in this browser", saveCloud: "Synced with Supabase", linkBad: "Invalid YouTube link.",
    loading: "Loading video…", loaded: "Video loaded. Events use the current playback second.",
    copyLink: "Copy link", created: "Event recorded", removed: "Event deleted", confirmDelete: "Delete this event?",
    configHint: "Custom types are stored in this browser in demo mode; with Supabase they are shared by the project.",
    matchHelp: "Each match has an analysed team, opponent and its own video.", noVideo: "No video", noActiveMatch: "No active match. Load a video or open a match from the history to view its events and statistics.",
    keyboard: "Shortcuts", keyboardHint: "Keys 1–9 record the corresponding event directly.",
    role: "Role", viewer: "Viewer", analyst: "Analyst", admin: "Administrator", configurator: "Configurator",
    readOnly: "Your role has read-only permissions.", loadVideoForEvents: "Load a match video to enable event recording.", setup: "Service configuration", setupHint: "For real-time collaboration, configure Supabase environment variables and apply the SQL migration.",
    statsTotal: "Total events", matchHistory: "Match history", noMatches: "No matches have been saved in this project yet.", openMatch: "Open match", savedOn: "Saved on", matchOpened: "Match loaded from history.", roleDemo: "Demo role", noAuth: "Authentication will be enabled once Supabase is configured.",
    eventRequired: "Enter both event names.", saveError: "Could not save to server. The event was kept locally.",
    members: "Manage users", memberEmail: "User email", memberRole: "Role", addMember: "Add user", memberHint: "The user must create an account first. The role is applied to this project and enforced by the database.", memberAdded: "User added to the project.",
    aiTitle: "AI goal detection", aiHint: "Analyses the YouTube URL directly (unlisted videos are supported). AI suggests moments; confirm each goal before saving it.",
    aiRun: "Find goals with AI", aiRunning: "Analysing video…", aiNotConfigured: "Firebase AI Logic is not configured. Add the Firebase settings and App Check reCAPTCHA key to the environment variables.",
    aiConsent: "I authorise this video's image and audio to be sent to Google Gemini for analysis. On the free tier, content may be used by Google to improve its products.",
    aiConsentRequired: "You must confirm consent before submitting the video for analysis.",
    aiAnalyzedKit: "Analysed team's kit", aiOpponentKit: "Opponent's kit",
    aiSide: "Scoring team", aiUncertain: "Unconfirmed", aiMarker: "Scorer", aiEvidence: "Evidence", aiConfidence: "Confidence",
    aiZone: "Zone", aiConfirm: "Confirm and register goal", aiConfirmed: "Goal registered", aiNoGoals: "AI did not identify any goal candidates.",
    aiError: "Could not analyse the video.", aiDuplicate: "A goal is already registered near this timestamp.",

  },
} as const;

function parseYouTubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    return ["embed", "shorts", "live"].includes(parts[0] ?? "") ? parts[1] ?? null : null;
  } catch { return null; }
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function zonesForEvent(event: EventType): Zone[] {
  const search = `${event.id} ${event.name_pt}`.toLowerCase();
  if (search.includes("lateral") || search.includes("kick-in") || search.includes("corner") || search.includes("canto")) return ["left", "right"];
  if (search.includes("kick-off") || search.includes("saída de bola")) return ["center"];
  return ["left", "center", "right"];
}

function eventNamesForMoment(eventType: EventType, moment: EventMoment) {
  const namePt = eventType.name_pt.toLowerCase().endsWith(" contra")
    ? eventType.name_pt.slice(0, -7).trim()
    : eventType.name_pt.trim();
  const englishName = eventType.name_en.trim();
  const nameEn = englishName.toLowerCase().startsWith("opposition ")
    ? englishName.slice(11).trim()
    : englishName.toLowerCase().endsWith(" (against)")
      ? englishName.slice(0, -10).trim()
      : englishName;
  return moment === "defense"
    ? { pt: `${namePt} Contra`, en: `Opposition ${nameEn}` }
    : { pt: namePt, en: nameEn };
}

function youtubeMoment(base: string, seconds: number) {
  if (!base) return "";
  const id = parseYouTubeId(base);
  return id ? `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds)}s` : "";
}

export default function HomePage() {
  const [language, setLanguage] = useState<Language>("pt");
  const [role, setRole] = useState<"admin" | "analyst" | "configurator" | "viewer">("admin");
  const [team, setTeam] = useState("Equipa A");
  const [opponent, setOpponent] = useState("Equipa B");
  const [videoLinks, setVideoLinks] = useState<string[]>([""]);
  const [matchVideos, setMatchVideos] = useState<MatchVideo[]>([]);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [analyzedTeamIsHome, setAnalyzedTeamIsHome] = useState(true);
  const [ageGroup, setAgeGroup] = useState("");
  const [competition, setCompetition] = useState("");
  const [playedAt, setPlayedAt] = useState("");
  const [venue, setVenue] = useState("");
  const [videoId, setVideoId] = useState("");
  const [currentSecond, setCurrentSecond] = useState(0);
  const [events, setEvents] = useState<EventType[]>(DEFAULT_EVENT_TYPES);
  const [records, setRecords] = useState<MatchEvent[]>([]);
  const [outcomeText, setOutcomeText] = useState("");
  const [newNamePt, setNewNamePt] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<AppRole>("analyst");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterZone, setFilterZone] = useState("all");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudMatchId, setCloudMatchId] = useState<string | null>(null);
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null);
  const [publicShareUrl, setPublicShareUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const shareRequestRef = useRef(0);
  const [aiCandidates, setAiCandidates] = useState<AiGoalSuggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiAnalyzedKit, setAiAnalyzedKit] = useState("Amarelo");
  const [aiOpponentKit, setAiOpponentKit] = useState("Azul");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesSyncError, setMatchesSyncError] = useState("");
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [importedLiveData, setImportedLiveData] = useState<ImportedLiveMatchData | null>(null);
  const [importedLiveLoading, setImportedLiveLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventTypesRef = useRef(events);
  const t = COPY[language];
  const supabase = useMemo(() => getSupabase(), []);
  const mode = supabase ? "cloud" : "demo";

  const hasActiveMatch = Boolean(supabase ? cloudMatchId : loadedUrl);
  const canConfigure = supabase ? Boolean(projectId && (role === "admin" || role === "configurator")) : role === "admin" || role === "configurator";
  const canRecord = hasActiveMatch && Boolean(loadedUrl) && (supabase ? Boolean(projectId && cloudUserId && cloudMatchId && (role === "admin" || role === "analyst")) : role === "admin" || role === "analyst");
  const canManagePublicShare = Boolean(supabase && projectId && cloudUserId && cloudMatchId && loadedUrl && (role === "admin" || role === "analyst"));
  const selectedSavedMatch = matches.find((match) => match.id === cloudMatchId) ?? null;
  const isAddingVideosToExistingMatch = Boolean(selectedSavedMatch);
  const isAttachingLiveVideo = Boolean(selectedSavedMatch?.source_public_live_match_id && !selectedSavedMatch.youtube_url);
  const competitionOptions = useMemo(() => Array.from(new Set(
    matches.map((match) => match.competition?.trim()).filter((value): value is string => Boolean(value))
  )).sort((a, b) => a.localeCompare(b, "pt-PT")), [matches]);
  const ageGroupOptions = useMemo(() => Array.from(new Set(
    matches.map((match) => match.age_group?.trim()).filter((value): value is string => Boolean(value))
  )).sort((a, b) => a.localeCompare(b, "pt-PT")), [matches]);
  const handleWorkspaceReady = useCallback((id: string, userId: string, memberRole: AppRole, teamName?: string) => {
    setProjectId(id); setCloudUserId(userId); setRole(memberRole);
    if (teamName) setTeam(teamName);
  }, []);
  const handleSignOut = useCallback(() => {
    shareRequestRef.current += 1;
    setProjectId(null); setCloudUserId(null); setCloudMatchId(null); setRecords([]); setMatches([]);
    setPublicShareToken(null); setPublicShareUrl(""); setShareBusy(false);
  }, []);
  const activeEvents = events.filter((event) => event.active);
  const eventRows = activeEvents.filter((event) => !event.is_counter);

  useEffect(() => { eventTypesRef.current = events; }, [events]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sportanalist-demo");
      if (saved) {
        const data = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the local-only demo store once.
        if (Array.isArray(data.records)) setRecords(data.records);
        if (Array.isArray(data.events)) setEvents(data.events);
      }
    } catch { /* Ignore malformed local demo data. */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("sportanalist-demo", JSON.stringify({ records, events }));
  }, [records, events]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const loadWorkspaceData = async () => {
      let typeQuery = supabase.from("event_types").select("*").eq("active", true).order("sort_order");
      typeQuery = projectId ? typeQuery.or(`project_id.is.null,project_id.eq.${projectId}`) : typeQuery.is("project_id", null);
      const { data: types, error: typeError } = await typeQuery;
      if (!cancelled && !typeError && types?.length) setEvents(types as EventType[]);
      if (cloudMatchId) {
        const { data: rows } = await supabase.from("match_events")
          .select("*, event_types(name_pt,name_en)").eq("match_id", cloudMatchId).order("created_at", { ascending: false });
        if (rows && !cancelled) setRecords((rows as DbMatchEventRow[]).map((row) => ({
          id: row.id, match_id: row.match_id, event_type_id: row.event_type_id, team_id: row.team_id,
          event_name_pt: row.event_types ? eventNamesForMoment(row.event_types as EventType, row.moment).pt : "Evento",
          event_name_en: row.event_types ? eventNamesForMoment(row.event_types as EventType, row.moment).en : "Event",
          video_second: row.video_second, moment: row.moment, zone: row.zone, outcome: row.outcome, attacking_team: row.attacking_team,
          defending_team: row.defending_team, created_by: row.created_by, created_at: row.created_at,
          youtube_url: row.youtube_url,
        })));
      }
    };
    void loadWorkspaceData();
    const channel = cloudMatchId ? supabase.channel(`match-events-${cloudMatchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${cloudMatchId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as DbMatchEventRow;
          const eventType = eventTypesRef.current.find((event) => event.id === row.event_type_id);
          setRecords((current) => current.some((entry) => entry.id === row.id) ? current : [{
            id: row.id, match_id: row.match_id, event_type_id: row.event_type_id, team_id: row.team_id,
            event_name_pt: eventType ? eventNamesForMoment(eventType, row.moment).pt : "Evento",
            event_name_en: eventType ? eventNamesForMoment(eventType, row.moment).en : "Event",
            video_second: row.video_second, moment: row.moment, zone: row.zone, outcome: row.outcome, attacking_team: row.attacking_team,
            defending_team: row.defending_team, created_by: row.created_by, created_at: row.created_at, youtube_url: row.youtube_url,
          }, ...current]);
        } else if (payload.eventType === "DELETE") setRecords((current) => current.filter((entry) => entry.id !== (payload.old as { id: string }).id));
      }).subscribe() : null;
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel); };
  }, [supabase, projectId, cloudMatchId]);

  useEffect(() => {
    if (!supabase || !projectId) return;
    let cancelled = false;
    const loadMatches = async () => {
      const { error: syncError } = await supabase.rpc("sync_finished_public_live_matches", { target_project: projectId });
      if (cancelled) return;
      setMatchesSyncError(syncError
        ? `${language === "pt" ? "Falha ao importar jogos terminados em Jogo ao vivo. Confirma que a migração SQL 0020 está aplicada no Supabase." : "Could not import completed live matches. Confirm that Supabase migration SQL 0020 has been applied."} ${syncError.message}`
        : "");
      const { data, error } = await supabase.from("matches")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setMatchesSyncError(language === "pt" ? `Não foi possível carregar a lista de jogos: ${error.message}` : `Could not load match history: ${error.message}`);
        return;
      }
      setMatches((data ?? []) as Match[]);
    };
    void loadMatches();
    const refreshTimer = window.setInterval(() => void loadMatches(), 15000);
    const channel = supabase.channel(`project-matches-${projectId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "matches", filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id;
          setMatches((current) => current.filter((match) => match.id !== id));
          return;
        }
        const row = payload.new as Match;
        setMatches((current) => [row, ...current.filter((match) => match.id !== row.id)]);
      })
      .subscribe();
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, matchesRefreshKey, language]);

  const refreshClock = useCallback(() => {
    const second = playerRef.current?.getCurrentTime?.();
    if (typeof second === "number" && Number.isFinite(second)) {
      setCurrentSecond(Math.floor(second));
    }
  }, []);

  useEffect(() => {
    if (!videoId) return;
    const win = window as PlayerWindow;
    const initialize = () => {
      if (!win.YT?.Player) return;
      if (playerRef.current?.destroy) playerRef.current.destroy();
      playerRef.current = new win.YT.Player("sportanalist-player", {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => { setMessage(t.loaded); },
          onStateChange: () => refreshClock(),
          onError: () => setMessage(t.videoUnavailable),
        },
      });
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(refreshClock, 500);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { previous?.(); initialize(); };
    if (win.YT?.Player) initialize();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current?.destroy) playerRef.current.destroy();
      playerRef.current = null;
    };
  }, [videoId, refreshClock, t.loaded, t.videoUnavailable]);

  const filteredRecords = useMemo(() => records
    .filter((record) => filterEvent === "all" || record.event_type_id === filterEvent)
    .filter((record) => filterZone === "all" || record.zone === filterZone)
    .slice().sort((a, b) => a.video_second - b.video_second), [records, filterEvent, filterZone]);

  const eventFeedRecords = useMemo(() => records.slice().sort((a, b) => {
    const timeDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return timeDifference || records.indexOf(b) - records.indexOf(a);
  }), [records]);
  const goalScores = useMemo(() => calculateGoalScores(records), [records]);

  async function registerEvent(
    eventType: EventType,
    eventZone: Zone,
    moment: EventMoment,
    secondOverride?: number,
    outcomeOverride?: string | null,
  ): Promise<boolean> {
    if (!canRecord) return false;
    const eventNames = eventNamesForMoment(eventType, moment);
    const capturedSecond = secondOverride ?? playerRef.current?.getCurrentTime?.() ?? currentSecond;
    // Manual captures are timestamped 10 seconds before the click to include the build-up.
    // AI candidates already carry a detected timestamp, so keep those unchanged.
    const second = Math.max(0, Math.floor(secondOverride === undefined ? capturedSecond - 10 : capturedSecond));
    const videoMoment = youtubeMoment(loadedUrl, second);
    const outcome = outcomeOverride === undefined ? (outcomeText.trim() || null) : (outcomeOverride?.trim() || null);

    // Use the match record as the source of truth for team names.
    // The editor fields can be changed after loading a match, but the database
    // trigger validates event ownership against matches.analyzed_team.
    let analysedTeamForEvent = team.trim();
    let opponentForEvent = opponent.trim();

    if (supabase) {
      if (!cloudMatchId || !cloudUserId || !projectId) { setMessage(t.noAuth); return false; }

      const { data: activeMatch, error: matchError } = await supabase.from("matches")
        .select("home_team, away_team, analyzed_team")
        .eq("id", cloudMatchId)
        .single();

      if (matchError || !activeMatch) {
        setMessage(matchError?.message ?? t.saveError);
        return false;
      }

      analysedTeamForEvent = activeMatch.analyzed_team.trim();
      const homeIsAnalysed = activeMatch.home_team.trim().toLocaleLowerCase() === analysedTeamForEvent.toLocaleLowerCase();
      const awayIsAnalysed = activeMatch.away_team.trim().toLocaleLowerCase() === analysedTeamForEvent.toLocaleLowerCase();

      if (homeIsAnalysed === awayIsAnalysed) {
        setMessage(language === "pt"
          ? "A equipa analisada guardada neste jogo não corresponde exatamente a uma das equipas. Verifica a ficha do jogo antes de registar eventos."
          : "The analysed team saved for this match does not match exactly one of the teams. Check the match details before recording events.");
        return false;
      }

      opponentForEvent = homeIsAnalysed ? activeMatch.away_team.trim() : activeMatch.home_team.trim();

      // Keep the editable fields aligned with the match actually being recorded.
      if (team !== analysedTeamForEvent) setTeam(analysedTeamForEvent);
      if (opponent !== opponentForEvent) setOpponent(opponentForEvent);

      const { data: eventTeam, error: teamError } = await supabase.from("teams")
        .upsert({ project_id: projectId, name: (moment === "attack" ? analysedTeamForEvent : opponentForEvent) }, { onConflict: "project_id,normalized_name" })
        .select("id")
        .single();
      if (teamError || !eventTeam) {
        setMessage(teamError?.message ?? t.saveError);
        return false;
      }

      const { data, error } = await supabase.from("match_events").insert({
        match_id: cloudMatchId, event_type_id: eventType.id, team_id: eventTeam.id,
        video_second: second, moment, zone: eventZone, outcome,
        attacking_team: moment === "attack" ? analysedTeamForEvent : opponentForEvent,
        defending_team: moment === "attack" ? opponentForEvent : analysedTeamForEvent,
        youtube_url: videoMoment, created_by: cloudUserId,
      }).select("id, team_id, created_at").single();
      if (error) { setMessage(error.message); return false; }
      const saved: MatchEvent = {
        id: data.id, match_id: cloudMatchId, event_type_id: eventType.id, team_id: data.team_id,
        event_name_pt: eventNames.pt, event_name_en: eventNames.en,
        video_second: second, moment, zone: eventZone, outcome,
        attacking_team: moment === "attack" ? analysedTeamForEvent : opponentForEvent,
        defending_team: moment === "attack" ? opponentForEvent : analysedTeamForEvent, created_by: cloudUserId,
        created_at: data.created_at, youtube_url: videoMoment,
      };
      setRecords((current) => current.some((entry) => entry.id === saved.id) ? current : [saved, ...current]);
      setMessage(t.saveCloud);
    } else {
      const localRecord: MatchEvent = {
        id: crypto.randomUUID(), match_id: "demo-match", event_type_id: eventType.id, team_id: null,
        event_name_pt: eventNames.pt, event_name_en: eventNames.en,
        video_second: second, moment, zone: eventZone, outcome,
        attacking_team: moment === "attack" ? analysedTeamForEvent : opponentForEvent,
        defending_team: moment === "attack" ? opponentForEvent : analysedTeamForEvent, created_by: null,
        created_at: new Date().toISOString(), youtube_url: videoMoment,
      };
      setRecords((current) => [localRecord, ...current]);
      setMessage(t.created + " · " + t.saveLocal);
    }
    if (outcomeOverride === undefined) setOutcomeText("");
    return true;
  }

  async function runAiGoalDetection() {
    if (!canRecord || aiBusy) return;
    if (!isFirebaseAIConfigured()) {
      setAiError(t.aiNotConfigured);
      return;
    }
    if (!aiConsent) {
      setAiError(t.aiConsentRequired);
      return;
    }
    setAiBusy(true);
    setAiError("");
    setAiStatus("");
    setAiCandidates([]);
    try {
      const detected = await analyzeYouTubeGoals({
        youtubeUrl: loadedUrl,
        analyzedTeam: team,
        opponent,
        analyzedTeamKit: aiAnalyzedKit,
        opponentKit: aiOpponentKit,
      });
      const candidates = detected.map((goal, index) => ({
        ...goal,
        id: `${goal.second}-${index}`,
        confirmed: false,
      }));
      setAiCandidates(candidates);
      if (candidates.length === 0) setAiStatus(t.aiNoGoals);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t.aiError);
    } finally {
      setAiBusy(false);
    }
  }

  function updateAiCandidate(id: string, changes: Partial<AiGoalSuggestion>) {
    setAiCandidates((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, ...changes } : candidate
    ));
  }

  async function confirmAiGoal(candidate: AiGoalSuggestion) {
    if (candidate.confirmed || candidate.scoringSide === "uncertain" || !canRecord) return;
    const goalType = events.find((event) => event.id === "goal")
      ?? events.find((event) => event.name_pt.trim().toLocaleLowerCase("pt-PT") === "golo");
    if (!goalType) {
      setAiError(language === "pt" ? "O tipo de evento Golo não está configurado." : "The Goal event type is not configured.");
      return;
    }

    const moment: EventMoment = candidate.scoringSide === "analysed" ? "attack" : "defense";
    const duplicate = records.some((record) =>
      record.event_type_id === goalType.id &&
      record.moment === moment &&
      Math.abs(record.video_second - candidate.second) <= 3
    );
    if (duplicate) {
      setAiStatus(t.aiDuplicate);
      updateAiCandidate(candidate.id, { confirmed: true });
      return;
    }

    const marker = [
      candidate.playerNumber ? `N.º ${candidate.playerNumber}` : "",
      candidate.playerName ?? "",
    ].filter(Boolean).join(" ");
    const outcome = [
      marker,
      candidate.evidence,
      `IA: ${Math.round(candidate.confidence * 100)}%`,
    ].filter(Boolean).join(" · ").slice(0, 500);

    const saved = await registerEvent(goalType, candidate.zone, moment, candidate.second, outcome);
    if (saved) {
      updateAiCandidate(candidate.id, { confirmed: true });
      setAiStatus(t.aiConfirmed);
    }
  }

  function seekToEvent(record: MatchEvent) {
    if (!playerRef.current) {
      setMessage(language === "pt" ? "O vídeo ainda não está pronto." : "The video player is not ready yet.");
      return;
    }
    playerRef.current.seekTo(record.video_second, true);
    setCurrentSecond(record.video_second);
  }

  async function removeEvent(record: MatchEvent) {
    if (role !== "admin" && record.created_by) {
      const { data } = await supabase?.auth.getUser() ?? { data: { user: null } };
      if (record.created_by !== data.user?.id) return;
    }
    if (supabase) {
      const { error } = await supabase.from("match_events").delete().eq("id", record.id);
      if (error) { setMessage(error.message); return; }
    }
    setRecords((current) => current.filter((entry) => entry.id !== record.id));
    setMessage(t.removed);
  }

  async function loadImportedLiveData(publicMatchId: string) {
    if (!supabase) return;
    setImportedLiveLoading(true);
    setImportedLiveData(null);
    const { data, error } = await supabase.rpc("get_public_live_match", { p_match_id: publicMatchId });
    if (error || !data?.match) {
      setMessage(error?.message ?? (language === "pt" ? "Não foi possível carregar os tempos do jogo." : "Could not load match time data."));
      setImportedLiveLoading(false);
      return;
    }
    setImportedLiveData(data as ImportedLiveMatchData);
    setImportedLiveLoading(false);
  }

  function updateVideoLink(index: number, value: string) {
    setVideoLinks((current) => current.map((link, linkIndex) => linkIndex === index ? value : link));
  }

  function addVideoLinkField() {
    setVideoLinks((current) => [...current, ""]);
  }

  function removeVideoLinkField(index: number) {
    setVideoLinks((current) => current.length <= 1 ? [""] : current.filter((_, linkIndex) => linkIndex !== index));
  }

  function selectMatchVideo(url: string) {
    const id = parseYouTubeId(url);
    if (!id) {
      setMessage(t.linkBad);
      return;
    }
    setAiCandidates([]);
    setAiConsent(false);
    setAiError("");
    setAiStatus("");
    setLoadedUrl(url);
    setVideoId(id);
    setCurrentSecond(0);
    setMessage(language === "pt" ? "Vídeo selecionado. Os novos eventos ficam associados a este vídeo." : "Video selected. New events will be associated with this video.");
  }

  async function loadVideo() {
    setAiCandidates([]);
    setAiConsent(false);
    setAiError("");
    setAiStatus("");

    const submittedUrls = videoLinks.map((url) => url.trim()).filter(Boolean);
    const uniqueVideoUrls = Array.from(new Map(
      submittedUrls.map((url) => [parseYouTubeId(url), url] as const)
    ).values());

    if (!uniqueVideoUrls.length || uniqueVideoUrls.some((url) => !parseYouTubeId(url))) {
      setMessage(t.linkBad);
      return;
    }
    if (!team.trim() || !opponent.trim() || team.trim().toLocaleLowerCase() === opponent.trim().toLocaleLowerCase()) {
      setMessage(language === "pt" ? "Indica duas equipas diferentes." : "Enter two different teams.");
      return;
    }

    const existingMatch = selectedSavedMatch;
    if (!existingMatch && (!ageGroup.trim() || !competition.trim() || !playedAt)) {
      setMessage(language === "pt"
        ? "Preenche o escalão, a competição e a data do jogo."
        : "Enter the age group, competition and match date.");
      return;
    }

    let targetMatch: Match | null = existingMatch;
    let activeVideoUrl = uniqueVideoUrls[0];

    if (supabase) {
      if (!projectId || !cloudUserId) { setMessage(t.noAuth); return; }

      // Detect the migration before creating a match, so a missing table does not
      // leave a partially registered fixture behind.
      const { error: videosTableError } = await supabase.from("match_videos").select("id").limit(1);
      if (videosTableError) {
        setMessage(language === "pt"
          ? "A base de dados ainda não tem suporte para vários vídeos. Executa a migração SQL 0025."
          : "Multiple-video support is not installed in the database. Apply SQL migration 0025.");
        return;
      }

      if (!targetMatch) {
        const homeTeam = analyzedTeamIsHome ? team.trim() : opponent.trim();
        const awayTeam = analyzedTeamIsHome ? opponent.trim() : team.trim();
        const { data: created, error } = await supabase.from("matches").insert({
          project_id: projectId,
          home_team: homeTeam,
          away_team: awayTeam,
          analyzed_team: team.trim(),
          youtube_url: uniqueVideoUrls[0],
          created_by: cloudUserId,
          age_group: ageGroup.trim(),
          competition: competition.trim(),
          played_at: playedAt,
          venue: venue.trim() || null,
        }).select("*").single();
        if (error || !created) {
          setMessage(error?.message ?? t.saveError);
          return;
        }
        targetMatch = created as Match;
      } else if (!targetMatch.youtube_url) {
        const { data: updated, error } = await supabase.from("matches")
          .update({ youtube_url: uniqueVideoUrls[0] })
          .eq("id", targetMatch.id)
          .select("*")
          .single();
        if (error || !updated) {
          setMessage(error?.message ?? t.saveError);
          return;
        }
        targetMatch = updated as Match;
      }

      const firstSortOrder = existingMatch ? matchVideos.length : 0;
      const videoRows = uniqueVideoUrls.map((url, index) => ({
        match_id: targetMatch!.id,
        youtube_url: url,
        sort_order: firstSortOrder + index,
        created_by: cloudUserId,
      }));
      const { error: saveVideosError } = await supabase.from("match_videos")
        .upsert(videoRows, { onConflict: "match_id,youtube_url", ignoreDuplicates: true });
      if (saveVideosError) {
        setMessage(language === "pt"
          ? `O jogo foi guardado, mas não foi possível guardar todos os vídeos: ${saveVideosError.message}`
          : `The match was saved, but one or more videos could not be saved: ${saveVideosError.message}`);
        return;
      }

      const { data: savedVideos, error: readVideosError } = await supabase.from("match_videos")
        .select("id,match_id,youtube_url,sort_order,created_at")
        .eq("match_id", targetMatch.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (readVideosError) {
        setMessage(readVideosError.message);
        return;
      }
      setMatchVideos((savedVideos ?? []) as MatchVideo[]);
      setMatches((current) => [targetMatch!, ...current.filter((match) => match.id !== targetMatch!.id)]);
      setCloudMatchId(targetMatch.id);
      if (!existingMatch) setRecords([]);
      setImportedLiveData(existingMatch?.source_public_live_match_id ? importedLiveData : null);
      void loadShareForMatch(targetMatch.id);
    } else {
      shareRequestRef.current += 1;
      setCloudMatchId(null);
      setPublicShareToken(null);
      setPublicShareUrl("");
      setShareBusy(false);
      setRecords([]);
      setMatchVideos(uniqueVideoUrls.map((url, index) => ({
        id: `demo-video-${index}`, match_id: "demo-match", youtube_url: url, sort_order: index,
      })));
    }

    setVideoLinks([""]);
    selectMatchVideo(activeVideoUrl);
    setSidebarOpen(false);
  }

  async function openSavedMatch(match: Match) {
    setAiCandidates([]);
    setAiConsent(false);
    setAiError("");
    setAiStatus("");

    const isAnalysedHome = match.home_team.trim().toLocaleLowerCase() === match.analyzed_team.trim().toLocaleLowerCase();
    const opponentName = isAnalysedHome ? match.away_team : match.home_team;
    setTeam(match.analyzed_team);
    setOpponent(opponentName);
    setAnalyzedTeamIsHome(isAnalysedHome);
    setAgeGroup(match.age_group ?? "");
    setCompetition(match.competition ?? "");
    setPlayedAt(match.played_at ?? "");
    setVenue(match.venue ?? "");
    setVideoLinks([""]);
    setCloudMatchId(match.id);
    void loadShareForMatch(match.id);

    let savedVideos: MatchVideo[] = [];
    if (supabase) {
      const { data, error } = await supabase.from("match_videos")
        .select("id,match_id,youtube_url,sort_order,created_at")
        .eq("match_id", match.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        setMessage(language === "pt"
          ? "Não foi possível carregar a lista de vídeos. Confirma que a migração SQL 0025 está aplicada."
          : "Could not load the video list. Confirm that SQL migration 0025 has been applied.");
      } else {
        savedVideos = (data ?? []) as MatchVideo[];
      }
    }
    if (!savedVideos.length && match.youtube_url) {
      savedVideos = [{
        id: `legacy-${match.id}`,
        match_id: match.id,
        youtube_url: match.youtube_url,
        sort_order: 0,
      }];
    }
    setMatchVideos(savedVideos);
    const storedUrl = savedVideos[0]?.youtube_url ?? "";
    const id = storedUrl ? parseYouTubeId(storedUrl) : null;
    setLoadedUrl(id ? storedUrl : "");
    setVideoId(id ?? "");
    setCurrentSecond(0);
    setRecords([]);
    setImportedLiveData(null);
    if (match.source_public_live_match_id) void loadImportedLiveData(match.source_public_live_match_id);
    else setImportedLiveLoading(false);
    setMessage(storedUrl
      ? t.matchOpened
      : (language === "pt"
        ? "Jogo aberto sem vídeo associado. Podes adicionar um ou vários links YouTube."
        : "Match opened without a video. You can add one or more YouTube links."));
    setSidebarOpen(false);
  }

  function startNewMatch() {
    shareRequestRef.current += 1;
    setCloudMatchId(null);
    setVideoLinks([""]);
    setMatchVideos([]);
    setLoadedUrl("");
    setVideoId("");
    setCurrentSecond(0);
    setAnalyzedTeamIsHome(true);
    setAgeGroup("");
    setCompetition("");
    setPlayedAt("");
    setVenue("");
    setRecords([]);
    setImportedLiveData(null);
    setImportedLiveLoading(false);
    setPublicShareToken(null);
    setPublicShareUrl("");
    setShareBusy(false);
    setSidebarOpen(false);
  }

  async function loadShareForMatch(matchId: string) {
    const requestId = ++shareRequestRef.current;
    setPublicShareToken(null);
    setPublicShareUrl("");
    if (!supabase || (role !== "admin" && role !== "analyst")) {
      setShareBusy(false);
      return;
    }
    setShareBusy(true);
    const { data, error } = await supabase.rpc("get_match_share_token", { target_match: matchId });
    if (requestId !== shareRequestRef.current) return;
    if (error) {
      setMessage(error.message);
      setShareBusy(false);
      return;
    }
    const token = typeof data === "string" ? data : null;
    setPublicShareToken(token);
    setPublicShareUrl(token ? `${window.location.origin}/share/${token}` : "");
    setShareBusy(false);
  }

  async function createPublicShare() {
    if (!supabase || !cloudMatchId || !canManagePublicShare) return;
    const requestId = ++shareRequestRef.current;
    setShareBusy(true);
    const { data, error } = await supabase.rpc("create_match_share", { target_match: cloudMatchId });
    if (requestId !== shareRequestRef.current) return;
    if (error || typeof data !== "string") {
      setMessage(error?.message ?? (language === "pt" ? "Não foi possível criar o link público." : "Could not create the public link."));
      setShareBusy(false);
      return;
    }
    setPublicShareToken(data);
    setPublicShareUrl(`${window.location.origin}/share/${data}`);
    setShareBusy(false);
    setMessage(language === "pt" ? "Link público criado para este jogo." : "Public link created for this match.");
  }

  async function revokePublicShare() {
    if (!supabase || !cloudMatchId || !canManagePublicShare) return;
    const requestId = ++shareRequestRef.current;
    setShareBusy(true);
    const { error } = await supabase.rpc("revoke_match_share", { target_match: cloudMatchId });
    if (requestId !== shareRequestRef.current) return;
    if (error) {
      setMessage(error.message);
      setShareBusy(false);
      return;
    }
    setPublicShareToken(null);
    setPublicShareUrl("");
    setShareBusy(false);
    setMessage(language === "pt" ? "A partilha pública foi desativada." : "Public sharing has been disabled.");
  }

  async function copyPublicShareLink() {
    if (!publicShareUrl) return;
    try {
      await navigator.clipboard.writeText(publicShareUrl);
      setMessage(language === "pt" ? "Link copiado." : "Link copied.");
    } catch {
      setMessage(language === "pt" ? "Copia o endereço apresentado no campo do link." : "Copy the address shown in the link field.");
    }
  }

  async function signOutFromSidebar() {
    if (supabase) await supabase.auth.signOut();
    setSidebarOpen(false);
  }

  async function createEventType() {
    if (!newNamePt.trim() || !newNameEn.trim()) { setMessage(t.eventRequired); return; }
    const eventType: EventType = {
      id: crypto.randomUUID(), name_pt: newNamePt.trim(), name_en: newNameEn.trim(),
      is_counter: false, active: true, sort_order: events.length * 10 + 10,
    };
    if (supabase) {
      if (!projectId || !cloudUserId) { setMessage(t.noAuth); return; }
      const { error } = await supabase.from("event_types").insert({
        id: eventType.id, project_id: projectId, name_pt: eventType.name_pt, name_en: eventType.name_en,
        is_counter: eventType.is_counter, active: true, sort_order: eventType.sort_order, created_by: cloudUserId,
      });
      if (error) { setMessage(error.message); return; }
    }
    setEvents((current) => [...current, eventType]);
    setNewNamePt(""); setNewNameEn(""); setMessage(t.created);
  }

  async function addProjectMember() {
    if (!supabase || !projectId || role !== "admin" || !memberEmail.trim()) return;
    const { error } = await supabase.rpc("add_project_member_by_email", {
      target_project: projectId, member_email: memberEmail.trim(), member_role: memberRole,
    });
    if (error) { setMessage(error.message); return; }
    setMemberEmail("");
    setMessage(t.memberAdded);
  }

  function exportCsv() {
    const headers = language === "pt"
      ? ["Link", "Evento", "Momento", "Zona", "Resultado"]
      : ["Link", "Event", "Moment", "Zone", "Outcome"];
    const rows = eventFeedRecords.map((record) => [
      record.youtube_url || youtubeMoment(loadedUrl, record.video_second),
      language === "pt" ? record.event_name_pt : record.event_name_en,
      record.moment === "attack" ? t.attackMoment : t.defenseMoment,
      ZONE_LABELS[record.zone][language],
      record.outcome ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = language === "pt" ? "sportanalist-eventos.csv" : "sportanalist-events.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totalAttacks = records.filter((record) => record.moment === "attack").length;
  const totalCounters = records.filter((record) => record.moment === "defense").length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1900px] flex-col gap-4 px-3 py-3 md:px-5 md:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="btn !h-10 !w-10 !p-0" aria-label={sidebarOpen ? t.closeMenu : t.sideMenu} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <X size={19} /> : <Menu size={19} />}</button>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]"><Activity size={25} /></div>
          <div><h1 className="text-xl font-bold tracking-tight">SportAnalist</h1><p className="muted text-[9px] font-semibold tracking-[.16em]">{t.subtitle}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden rounded-full border border-[#35d07f40] bg-[#35d07f12] px-3 py-2 text-xs text-[#63e99e] sm:inline-flex"><span className="mr-2 mt-1 h-2 w-2 rounded-full bg-[#35d07f]" />{mode === "cloud" ? "Supabase configurado" : t.demo}</span>
          {supabase
            ? <span className="rounded-lg border border-[#263646] bg-[#0b131c] px-3 py-2 text-sm">{t[role]}</span>
            : <select aria-label={t.role} className="field !w-auto text-sm" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="admin">{t.admin}</option><option value="analyst">{t.analyst}</option><option value="configurator">{t.configurator}</option><option value="viewer">{t.viewer}</option>
              </select>}
          <Link href="/jogo-ao-vivo" className="btn !px-3 !py-2 text-xs"><Timer size={15} /><span className="hidden sm:inline">Jogo ao vivo</span><span className="sm:hidden">Ao vivo</span></Link>
          <button className="btn !px-3 !py-2" onClick={() => setLanguage(language === "pt" ? "en" : "pt")}><Globe2 size={15} />{language.toUpperCase()}</button>
        </div>
      </header>

      {sidebarOpen && <button aria-label={t.closeMenu} className="fixed inset-0 z-40 bg-black/65" onClick={() => setSidebarOpen(false)} />}
      <div className="flex min-h-0 flex-1 items-start gap-4">
        <aside aria-hidden={!sidebarOpen} className={`panel scrollbar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(88vw,320px)] flex-col gap-3 overflow-y-auto rounded-none p-3 shadow-2xl transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"}`}>
          <div className="flex items-center justify-between border-b border-[#263646] pb-2">
            <div><h2 className="text-sm font-semibold">{t.sideMenu}</h2><p className="muted mt-0.5 text-[10px]">{projectId ? team : t.matchHistory}</p></div>
            <button className="btn !h-8 !w-8 !p-0 lg:hidden" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X size={15} /></button>
          </div>

          {supabase && <CloudSetup supabase={supabase} onWorkspaceReady={handleWorkspaceReady} onSignOut={handleSignOut} hideAuthenticatedBar />}

          {supabase && cloudUserId && <div className="flex items-center justify-between rounded-lg border border-[#263646] bg-[#0b131c] px-2.5 py-2">
            <div className="min-w-0"><p className="text-xs font-medium">{t[role]}</p><p className="muted truncate text-[10px]">{projectId ? t.currentMatch : "Supabase Auth"}</p></div>
            <button className="btn !px-2 !py-1.5 text-[11px]" onClick={() => void signOutFromSidebar()}><LogOut size={12} />Sair</button>
          </div>}

          {(!supabase || projectId) && <>
            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">
                  {isAddingVideosToExistingMatch
                    ? (language === "pt" ? "Adicionar vídeos ao jogo selecionado" : "Add videos to selected match")
                    : t.newMatch}
                </h3>
                {cloudMatchId && <button type="button" className="rounded border border-[#31475a] px-2 py-1 text-[10px] text-[#b9d0df]" onClick={startNewMatch}>{language === "pt" ? "Novo jogo" : "New match"}</button>}
              </div>

              {isAddingVideosToExistingMatch ? (
                <div className="rounded-lg border border-[#263646] bg-[#0b131c] p-2 text-[10px] text-[#b8c7d3]">
                  <p className="font-semibold text-white">{selectedSavedMatch?.home_team} vs {selectedSavedMatch?.away_team}</p>
                  <p className="mt-1">{[selectedSavedMatch?.age_group, selectedSavedMatch?.competition].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1">{language === "pt" ? "Os novos links serão associados a este jogo, sem criar outro registo." : "New links will be added to this match without creating another record."}</p>
                </div>
              ) : (
                <>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">{t.analyzed}
                    <input className="field mt-1 !px-2.5 !py-2 text-xs" value={team} onChange={(e) => setTeam(e.target.value)} required />
                  </label>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">{t.opponent}
                    <input className="field mt-1 !px-2.5 !py-2 text-xs" value={opponent} onChange={(e) => setOpponent(e.target.value)} required />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#31475a] bg-[#0b131c] px-2.5 py-2 text-[11px] font-semibold text-[#c4d1dc]">
                    <input type="checkbox" className="accent-[#35d07f]" checked={analyzedTeamIsHome} onChange={(e) => setAnalyzedTeamIsHome(e.target.checked)} />
                    <span>{language === "pt" ? "A equipa analisada joga em casa" : "Analysed team plays at home"}</span>
                  </label>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">
                    {language === "pt" ? "Escalão *" : "Age group *"}
                    <input className="field mt-1 !px-2.5 !py-2 text-xs" list="sportanalist-age-groups" value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)} placeholder={language === "pt" ? "Ex.: Sub-17" : "e.g. U17"} required />
                    <datalist id="sportanalist-age-groups">{ageGroupOptions.map((item) => <option key={item} value={item} />)}</datalist>
                  </label>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">
                    {language === "pt" ? "Competição" : "Competition"}
                    <input className="field mt-1 !px-2.5 !py-2 text-xs" list="sportanalist-competitions" value={competition}
                      onChange={(e) => setCompetition(e.target.value)} placeholder={language === "pt" ? "Escolhe uma existente ou escreve nova" : "Choose existing or enter new"} required />
                    <datalist id="sportanalist-competitions">{competitionOptions.map((item) => <option key={item} value={item} />)}</datalist>
                  </label>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">
                    {language === "pt" ? "Data do jogo" : "Match date"}
                    <input type="date" className="field mt-1 !px-2.5 !py-2 text-xs" value={playedAt}
                      onChange={(e) => setPlayedAt(e.target.value)} required />
                  </label>
                  <label className="block text-[11px] font-semibold text-[#a8b8c7]">
                    {language === "pt" ? "Local do jogo (opcional)" : "Venue (optional)"}
                    <input className="field mt-1 !px-2.5 !py-2 text-xs" value={venue} onChange={(e) => setVenue(e.target.value)}
                      placeholder={language === "pt" ? "Pavilhão / local" : "Sports hall / venue"} />
                  </label>
                </>
              )}

              <div className="grid gap-1.5">
                <p className="text-[11px] font-semibold text-[#a8b8c7]">{language === "pt" ? "Links dos vídeos YouTube" : "YouTube video links"}</p>
                {videoLinks.map((url, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-1.5">
                    <input className="field min-w-0 flex-1 !px-2.5 !py-2 text-xs"
                      placeholder={language === "pt" ? `Vídeo ${index + 1} · youtube.com/watch?v=…` : `Video ${index + 1} · youtube.com/watch?v=…`}
                      value={url} onChange={(e) => updateVideoLink(index, e.target.value)} />
                    {videoLinks.length > 1 && <button type="button" className="btn !h-8 !w-8 !p-0 text-rose-300" aria-label={language === "pt" ? "Remover link" : "Remove link"} onClick={() => removeVideoLinkField(index)}><X size={13} /></button>}
                  </div>
                ))}
                <button type="button" className="btn w-full !justify-center !py-1.5 text-[10px]" onClick={addVideoLinkField}>
                  <Plus size={12} />{language === "pt" ? "Adicionar outro vídeo" : "Add another video"}
                </button>
              </div>

              <button className="btn btn-primary w-full !py-2 text-xs"
                disabled={supabase ? !projectId || !cloudUserId || (role !== "admin" && role !== "analyst") : role === "viewer" || role === "configurator"}
                onClick={() => void loadVideo()}>
                <Video size={14} />
                {isAddingVideosToExistingMatch
                  ? (language === "pt" ? "Adicionar vídeos e carregar" : "Add videos and load")
                  : (language === "pt" ? "Registar jogo e carregar vídeos" : "Register match and load videos")}
              </button>
            </section>
          </>}

          {supabase && projectId && <section className="min-h-0 flex-1 border-t border-[#263646] pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.savedMatches}</h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setMatchesRefreshKey((current) => current + 1)}
                  className="flex items-center gap-1 rounded border border-[#31475a] px-2 py-1 text-[10px] text-[#b8c7d3] hover:border-[#5f819e]"
                  title={language === "pt" ? "Atualizar e importar jogos terminados" : "Refresh and import completed matches"}>
                  <RefreshCw size={11} />{language === "pt" ? "Atualizar" : "Refresh"}
                </button>
                <span className="rounded-full border border-[#263646] px-2 py-0.5 text-[10px]">{matches.length}</span>
              </div>
            </div>
            {matchesSyncError && <p role="alert" className="mb-2 rounded-lg border border-amber-800/70 bg-amber-950/30 p-2 text-[10px] leading-relaxed text-amber-200">{matchesSyncError}</p>}
            {matches.length === 0 ? <p className="muted py-2 text-xs">{t.noMatches}</p> : <div className="scrollbar flex flex-col gap-1.5 overflow-y-auto">
              {matches.map((match) => {
                return <div key={match.id} className={`rounded-lg border p-2 ${cloudMatchId === match.id ? "border-[#35d07f80] bg-[#35d07f0e]" : "border-[#263646] bg-[#0b131c]"}`}>
                  <button className="block w-full text-left" onClick={() => void openSavedMatch(match)} title={t.openMatch}>
                    <p className="truncate text-xs font-semibold">{match.home_team} <span className="muted font-normal">vs</span> {match.away_team}</p>
                    <p className="muted mt-1 text-[10px]">
                      {[match.age_group, match.competition].filter(Boolean).join(" · ")}
                      {[match.played_at ? new Intl.DateTimeFormat(language === "pt" ? "pt-PT" : "en-GB", { dateStyle: "short" }).format(new Date(match.played_at)) : null, match.kickoff_time ? match.kickoff_time.slice(0, 5) : null].filter(Boolean).join(" · ")}
                    </p>
                    {match.venue && <p className="muted mt-1 truncate text-[10px]">{match.venue}</p>}
                    <p className="muted mt-1 text-[9px]">{language === "pt" ? "Equipa analisada:" : "Analysed team:"} {match.analyzed_team} · {match.home_team === match.analyzed_team ? (language === "pt" ? "Casa" : "Home") : (language === "pt" ? "Fora" : "Away")}</p>
                    {match.source_public_live_match_id && <p className="mt-1 text-[9px] font-semibold text-[#83e6a9]">{language === "pt" ? "Jogo ao vivo · Terminado" : "Live match · Finished"}</p>}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    {match.youtube_url
                      ? <a className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[#8fc8ff] hover:underline" href={match.youtube_url} target="_blank" rel="noreferrer"><Link2 size={11} className="shrink-0" />{language === "pt" ? "Link do vídeo" : "Video link"}</a>
                      : <span className="text-[10px] text-amber-300">{language === "pt" ? "Sem vídeo associado" : "No video attached"}</span>}
                    <button className="rounded border border-[#31475a] px-2 py-1 text-[10px] hover:border-[#5f819e]" onClick={() => openSavedMatch(match)}>{t.openMatch}</button>
                  </div>
                </div>;
              })}
            </div>}
          </section>}

          {supabase && projectId && role === "admin" && <section className="border-t border-[#263646] pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.members}</h3>
            <label className="block text-[11px] text-[#9eb0c0]">{t.memberEmail}
              <input type="email" className="field mt-1 !px-2.5 !py-2 text-xs" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="analista@clube.pt" />
            </label>
            <label className="mt-2 block text-[11px] text-[#9eb0c0]">{t.memberRole}
              <select className="field mt-1 !px-2.5 !py-2 text-xs" value={memberRole} onChange={(e) => setMemberRole(e.target.value as AppRole)}>
                <option value="admin">{t.admin}</option><option value="analyst">{t.analyst}</option><option value="configurator">{t.configurator}</option><option value="viewer">{t.viewer}</option>
              </select>
            </label>
            <button className="btn btn-primary mt-2 w-full !py-2 text-xs" disabled={!memberEmail.trim()} onClick={() => void addProjectMember()}><Plus size={13} />{t.addMember}</button>
          </section>}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {!hasActiveMatch && <div className="panel flex items-center gap-3 p-3 text-sm">
            <Video size={18} className="shrink-0 text-[#65e99c]" />
            <p className="muted">{t.noActiveMatch}</p>
          </div>}

          <div className={`analysis-workspace grid min-w-0 items-start gap-3 ${hasActiveMatch && loadedUrl ? "with-event-controls" : "without-event-controls"}`}>
          <section className="analysis-video-panel panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#263646] px-3 py-2">
              <div><h2 className="text-sm font-semibold">{t.video}</h2><p className="muted mt-0.5 max-w-[65vw] truncate text-[10px]">{loadedUrl || t.videoHelp}</p></div>
              <span className="rounded-lg border border-[#263646] bg-[#0b131c] px-2.5 py-1.5 font-mono text-sm text-[#75eca8]"><Clock3 className="mr-1.5 inline" size={13} />{formatTime(currentSecond)}</span>
            </div>
            <div className="video-stage relative w-full overflow-hidden bg-black">
              {videoId ? <div id="sportanalist-player" className="h-full w-full" /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-[#8798a8]">
                <Video size={34} strokeWidth={1.2} />
                <p className="text-sm">{cloudMatchId && matches.find((match) => match.id === cloudMatchId)?.source_public_live_match_id
                  ? (language === "pt" ? "Jogo ao vivo terminado. Consulta os tempos abaixo e associa vídeos YouTube para iniciar a análise técnico-tática." : "Live match finished. Review the player times below and attach YouTube videos to begin technical-tactical analysis.")
                  : t.videoHelp}</p>
              </div>}
            </div>
            {matchVideos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[#263646] px-2.5 py-2">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{language === "pt" ? "Vídeos do jogo" : "Match videos"}</span>
                {matchVideos.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => selectMatchVideo(item.youtube_url)}
                    className={`rounded-md border px-2 py-1 text-[10px] transition ${loadedUrl === item.youtube_url ? "border-[#35d07f80] bg-[#35d07f18] text-[#83e6a9]" : "border-[#31475a] bg-[#0b131c] text-[#b8c7d3] hover:border-[#5f819e]"}`}>
                    {language === "pt" ? "Vídeo" : "Video"} {index + 1}
                  </button>
                ))}
              </div>
            )}
          </section>

          {hasActiveMatch && Boolean(loadedUrl) && <section className="event-capture-panel panel flex flex-col gap-2 p-2.5">
            <div className="event-legend flex flex-wrap items-center gap-3 px-1 py-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{language === "pt" ? "Legenda" : "Legend"}</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#79e9aa]"><span className="event-legend-plus event-legend-attack">+</span>{t.attackMoment}</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#f0b08d]"><span className="event-legend-plus event-legend-defense">+</span>{language === "pt" ? "Defesa (Contra)" : "Defence (against)"}</span>
            </div>
            <div className="event-single-list overflow-hidden rounded-lg border border-[#263646] bg-[#0b131c]">
              <div className="event-grid event-single-grid grid grid-cols-[minmax(76px,1.35fr)_repeat(3,minmax(0,1fr))] items-center gap-x-1 gap-y-0.5 px-2 py-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.event}</div>
                {(["left", "center", "right"] as Zone[]).map((eventZone) => <div key={eventZone} className="truncate px-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{ZONE_LABELS[eventZone][language]}</div>)}
                {eventRows.map((event) => {
                  const allowedZones = zonesForEvent(event);
                  const name = language === "pt" ? event.name_pt : event.name_en;
                  return <div key={event.id} className="contents">
                    <div className="truncate py-1 pr-1 text-[10px] font-medium" title={name}>{name}</div>
                    {(["left", "center", "right"] as Zone[]).map((eventZone) => allowedZones.includes(eventZone)
                      ? <div key={eventZone} className="flex items-center justify-center gap-1">
                          <button type="button" disabled={!canRecord} title={`${t.attackMoment} · ${name} · ${ZONE_LABELS[eventZone][language]}`}
                            aria-label={`Registar ${t.attackMoment} · ${name} · ${ZONE_LABELS[eventZone][language]}`}
                            onClick={() => void registerEvent(event, eventZone, "attack")}
                            className="event-shortcut event-shortcut-attack flex h-5 w-5 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-35">
                            <Plus size={10} />
                          </button>
                          <button type="button" disabled={!canRecord} title={`${language === "pt" ? "Defesa (Contra)" : "Defence (against)"} · ${name} · ${ZONE_LABELS[eventZone][language]}`}
                            aria-label={`Registar Defesa Contra · ${name} · ${ZONE_LABELS[eventZone][language]}`}
                            onClick={() => void registerEvent(event, eventZone, "defense")}
                            className="event-shortcut event-shortcut-defense flex h-5 w-5 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-35">
                            <Plus size={10} />
                          </button>
                        </div>
                      : <div key={eventZone} className="flex items-center justify-center text-[10px] text-[#526170]">—</div>)}
                  </div>;
                })}
              </div>
            </div>

            <label className="block text-[10px] font-semibold text-[#a8b8c7]">
              {t.outcome}
              <textarea className="field mt-1 min-h-[38px] resize-none !px-2.5 !py-1.5 text-xs" rows={1} value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)} placeholder={t.outcomePlaceholder} />
            </label>
            <section className="event-feed overflow-hidden rounded-lg border border-[#263646] bg-[#0b131c]">
              <div className="flex items-center justify-between border-b border-[#263646] px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{language === "pt" ? "Eventos registados" : "Recorded events"}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={exportCsv} disabled={eventFeedRecords.length === 0}
                    className="inline-flex items-center gap-1 rounded border border-[#31475a] px-2 py-1 text-[9px] text-[#c1cfdb] hover:border-[#5f819e] disabled:cursor-not-allowed disabled:opacity-35"
                    title={t.export} aria-label={t.export}>
                    <ArrowDownToLine size={12} />{t.export}
                  </button>
                  <span className="rounded-full bg-[#35d07f18] px-1.5 py-0.5 text-[9px] text-[#66e99f]">{records.length}</span>
                </div>
              </div>
              {eventFeedRecords.length === 0 ? <p className="muted px-2 py-3 text-[10px]">{t.empty}</p> : <div className="max-h-[30svh] overflow-y-auto">
                <table className="event-feed-table w-full table-fixed">
                  <thead><tr><th className="w-[54px]">{t.time}</th><th>{t.event}</th><th className="w-[56px]">{t.momentColumn}</th><th className="w-[28px] text-right"></th></tr></thead>
                  <tbody>{eventFeedRecords.map((record) => <tr key={record.id}>
                    <td><button type="button" className="event-time-link font-mono text-[10px] font-medium text-[#7beaa8] hover:underline" onClick={() => seekToEvent(record)} title={language === "pt" ? "Reproduzir este momento no vídeo" : "Play this moment in the video"}>{formatTime(record.video_second)}</button></td>
                    <td className="truncate text-[10px]" title={language === "pt" ? record.event_name_pt : record.event_name_en}>
                      <span>{language === "pt" ? record.event_name_pt : record.event_name_en}</span>
                      {goalScores.has(record.id) && <span className="ml-1 inline-flex rounded border border-[#426b55] bg-[#12291e] px-1 py-0.5 font-mono text-[9px] font-semibold text-[#8af0ad]">{formatGoalScore(goalScores.get(record.id)!, analyzedTeamIsHome)}</span>}
                    </td>
                    <td className="event-moment-cell" title={record.moment === "attack" ? t.attackMoment : t.defenseMoment}>{record.moment === "attack" ? (language === "pt" ? "Ataque" : "Attack") : (language === "pt" ? "Defesa" : "Defence")}</td>
                    <td className="event-delete-cell"><button type="button" aria-label={t.delete} title={t.delete} className="event-delete ml-auto flex h-5 w-5 items-center justify-center rounded text-[#ff9999] hover:bg-[#ff777722]" onClick={() => void removeEvent(record)}><X size={13} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </section>
            
            {!canRecord && <p className="text-[10px] text-amber-300">{t.readOnly}</p>}
          </section>}
          {hasActiveMatch && Boolean(loadedUrl) && <p className="mobile-view-only muted text-xs">{t.mobileViewOnly}</p>}
          </div>

          {hasActiveMatch && importedLiveLoading && (
            <section className="panel p-3 text-xs text-[#a8b8c7]">{language === "pt" ? "A carregar tempos do jogo ao vivo…" : "Loading live-match player times…"}</section>
          )}
          {hasActiveMatch && importedLiveData && (
            <section className="panel grid gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{language === "pt" ? "Tempos de utilização dos jogadores" : "Player court-time report"}</h2>
                  <p className="muted mt-1 text-[10px]">{language === "pt" ? "Registo importado do jogo ao vivo · ordenado por tempo em campo" : "Imported from live match · sorted by court time"}</p>
                </div>
                <span className="rounded-md border border-[#315b47] bg-[#10251a] px-2 py-1 text-[10px] text-[#8ee8ae]">{formatDuration(importedLiveData.clock.elapsed_seconds)} · {language === "pt" ? "tempo total" : "total time"}</span>
              </div>
              {importedLiveData.clock.first_half_seconds === null && (
                <p className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-[10px] text-amber-200">
                  {language === "pt" ? "O intervalo não foi registado. A totalidade do tempo está na 1.ª parte; a 2.ª parte apresenta zero." : "Halftime was not recorded. All time is assigned to the first half; the second half is zero."}
                </p>
              )}
              {[
                { title: "1ª Parte", start: 0, end: importedLiveData.clock.first_half_seconds ?? importedLiveData.clock.elapsed_seconds },
                { title: "2ª Parte", start: importedLiveData.clock.first_half_seconds ?? importedLiveData.clock.elapsed_seconds, end: importedLiveData.clock.elapsed_seconds },
                { title: "Tempo total do jogo", start: 0, end: importedLiveData.clock.elapsed_seconds },
              ].map((section) => {
                const rows = importedLiveData.players.map((player) => ({
                  id: player.id, name: player.display_name || player.full_name,
                  seconds: playerCourtSecondsInRange(importedLiveData.stints, player.id, section.start, section.end),
                })).sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "pt-PT"));
                return (
                  <div key={section.title} className="overflow-x-auto rounded-lg border border-[#263646]">
                    <div className="flex items-center justify-between gap-2 bg-[#142330] px-3 py-2">
                      <h3 className="text-xs font-semibold text-white">{section.title}</h3>
                      <span className="font-mono text-[10px] text-[#8ee8ae]">{formatDuration(section.end - section.start)}</span>
                    </div>
                    <table className="w-full min-w-[280px] text-left text-[10px]">
                      <thead className="bg-[#1d8050] text-white">
                        <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">{language === "pt" ? "Jogador" : "Player"}</th><th className="px-2 py-2 text-right">{language === "pt" ? "Tempo em campo" : "Court time"}</th></tr>
                      </thead>
                      <tbody>{rows.map((row, index) => (
                        <tr key={row.id} className={index % 2 === 0 ? "bg-[#101923]" : "bg-[#182533]"}>
                          <td className="px-2 py-2 text-[#93a8b8]">{index + 1}</td>
                          <td className="px-2 py-2 font-medium text-white">{row.name}</td>
                          <td className="px-2 py-2 text-right font-mono text-[#b7f0cc]">{formatDuration(row.seconds)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          )}
          {hasActiveMatch && Boolean(loadedUrl) && <>
            <section className="grid gap-2 sm:grid-cols-3">
              {[{ label: t.statsTotal, value: records.length, icon: Activity }, { label: t.attacks, value: totalAttacks, icon: Play }, { label: t.counters, value: totalCounters, icon: RefreshCw }].map(({ label, value, icon: Icon }) => <div key={label} className="panel flex items-center justify-between p-3"><div><p className="muted text-[10px]">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div><div className="rounded-lg bg-[#35d07f17] p-2 text-[#57e394]"><Icon size={17} /></div></div>)}
            </section>


          </>}

          {canManagePublicShare && <section className="panel grid gap-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{language === "pt" ? "Link público deste jogo" : "Public link for this match"}</h2>
                <p className="muted mt-1 text-[10px]">
                  {language === "pt"
                    ? "Qualquer pessoa com este endereço pode consultar o vídeo e a cronologia. Não dá acesso à edição nem a outros jogos."
                    : "Anyone with this address can view the video and timeline. It does not grant editing access or access to other matches."}
                </p>
              </div>
              <Share2 size={18} className="text-[#62e69b]" />
            </div>
            {publicShareToken ? (
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <input className="field min-w-0 flex-1 !py-2 text-xs" readOnly aria-label={language === "pt" ? "Link público" : "Public link"} value={publicShareUrl} />
                <button type="button" className="btn !py-2 text-xs" disabled={shareBusy} onClick={() => void copyPublicShareLink()}>
                  <Copy size={13} />{language === "pt" ? "Copiar link" : "Copy link"}
                </button>
                <button type="button" className="btn !py-2 text-xs text-[#ffadad]" disabled={shareBusy} onClick={() => void revokePublicShare()}>
                  {language === "pt" ? "Desativar link" : "Disable link"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary !py-2 text-xs" disabled={shareBusy} onClick={() => void createPublicShare()}>
                  <Share2 size={13} />{shareBusy
                    ? (language === "pt" ? "A preparar…" : "Preparing…")
                    : (language === "pt" ? "Criar link público" : "Create public link")}
                </button>
                <span className="muted text-[10px]">{language === "pt" ? "O link pode ser desativado a qualquer momento." : "The link can be disabled at any time."}</span>
              </div>
            )}
          </section>}

          {canConfigure && <section className="panel grid gap-3 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="md:col-span-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">{t.configure}</h2><p className="muted mt-0.5 text-[10px]">{t.configHint}</p></div><ShieldCheck className="text-[#62e69b]" size={20} /></div>
            <label className="text-[11px] text-[#9eb0c0]">{t.newEvent}<input className="field mt-1 !px-2.5 !py-2 text-xs" value={newNamePt} onChange={(e) => setNewNamePt(e.target.value)} placeholder="Ex.: Remate" /></label>
            <label className="text-[11px] text-[#9eb0c0]">{t.newEventEn}<input className="field mt-1 !px-2.5 !py-2 text-xs" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="e.g. Shot" /></label>
            <button className="btn btn-primary h-[38px] text-xs" onClick={() => void createEventType()}><FilePlus2 size={13} />{t.create}</button>
          </section>}

          {hasActiveMatch && Boolean(loadedUrl) && <section className="rounded-lg border border-[#31475a] bg-[#0b131c] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.aiTitle}</h3>
                <span className="rounded-full border border-[#315b47] bg-[#112820] px-2 py-0.5 text-[9px] text-[#79e9aa]">Gemini · YouTube</span>
              </div>
              <p className="muted mt-1 text-[10px]">{t.aiHint}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block min-w-0 text-[9px] text-[#a8b8c7]">
                  {t.aiAnalyzedKit}
                  <input className="field mt-1 !px-2 !py-1.5 text-[11px]" value={aiAnalyzedKit} onChange={(event) => setAiAnalyzedKit(event.target.value)} />
                </label>
                <label className="block min-w-0 text-[9px] text-[#a8b8c7]">
                  {t.aiOpponentKit}
                  <input className="field mt-1 !px-2 !py-1.5 text-[11px]" value={aiOpponentKit} onChange={(event) => setAiOpponentKit(event.target.value)} />
                </label>
              </div>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-[9px] leading-relaxed text-[#a8b8c7]">
                <input type="checkbox" className="mt-0.5 accent-[#35d07f]" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
                <span>{t.aiConsent}</span>
              </label>
              {!isFirebaseAIConfigured() && <p className="mt-2 text-[10px] text-amber-300">{t.aiNotConfigured}</p>}
              <button type="button" className="btn btn-primary mt-2 w-full !py-2 text-[10px]"
                disabled={!canRecord || aiBusy || !aiConsent || !isFirebaseAIConfigured()}
                onClick={() => void runAiGoalDetection()}>
                <Activity size={13} />{aiBusy ? t.aiRunning : t.aiRun}
              </button>
              {aiError && <p role="alert" className="mt-2 text-[10px] text-rose-300">{aiError}</p>}
              {aiStatus && <p role="status" className="mt-2 text-[10px] text-[#79e9aa]">{aiStatus}</p>}
              {aiCandidates.length > 0 && <div className="mt-2 grid gap-2">
                {aiCandidates.map((candidate) => (
                  <article key={candidate.id} className="rounded-md border border-[#31475a] bg-[#101923] p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="font-mono text-[11px] font-semibold text-[#7beaa8] hover:underline"
                        onClick={() => { playerRef.current?.seekTo(candidate.second, true); setCurrentSecond(candidate.second); }}>
                        {formatTime(candidate.second)}
                      </button>
                      <span className="text-[9px] text-[#9eb0c0]">{t.aiConfidence}: {Math.round(candidate.confidence * 100)}%</span>
                    </div>
                    {(candidate.playerName || candidate.playerNumber) && <p className="mt-1 text-[10px] font-semibold">{t.aiMarker}: {candidate.playerNumber ? `N.º ${candidate.playerNumber} ` : ""}{candidate.playerName ?? ""}</p>}
                    <label className="mt-2 block text-[9px] text-[#a8b8c7]">
                      {t.aiSide}
                      <select className="field mt-1 !px-2 !py-1.5 text-[10px]" value={candidate.scoringSide}
                        onChange={(event) => updateAiCandidate(candidate.id, { scoringSide: event.target.value as AiGoalSuggestion["scoringSide"] })}>
                        <option value="uncertain">{t.aiUncertain}</option>
                        <option value="analysed">{team}</option>
                        <option value="opponent">{opponent}</option>
                      </select>
                    </label>
                    <label className="mt-2 block text-[9px] text-[#a8b8c7]">
                      {t.aiZone}
                      <select className="field mt-1 !px-2 !py-1.5 text-[10px]" value={candidate.zone}
                        onChange={(event) => updateAiCandidate(candidate.id, { zone: event.target.value as Zone })}>
                        <option value="left">{ZONE_LABELS.left[language]}</option>
                        <option value="center">{ZONE_LABELS.center[language]}</option>
                        <option value="right">{ZONE_LABELS.right[language]}</option>
                      </select>
                    </label>
                    {candidate.evidence && <p className="mt-2 text-[9px] leading-relaxed text-[#a8b8c7]">{t.aiEvidence}: {candidate.evidence}</p>}
                    <button type="button" className="btn mt-2 w-full !py-1.5 text-[9px]"
                      disabled={candidate.confirmed || candidate.scoringSide === "uncertain" || !canRecord}
                      onClick={() => void confirmAiGoal(candidate)}>
                      {candidate.confirmed ? t.aiConfirmed : t.aiConfirm}
                    </button>
                  </article>
                ))}
              </div>}
            </section>}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#263646] pt-3">
            <div className="flex items-center gap-2 text-[10px] text-[#8fa1b3]"><CircleHelp size={13} />{t.setupHint}</div>
            <span className="text-[10px] text-[#6d8194]">SportAnalist · v0.1.0</span>
          </footer>
        </section>
      </div>
      {message && <div role="status" className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl border border-[#365846] bg-[#12241b] px-3 py-2.5 text-xs text-[#a5f1c1] shadow-xl">{message}<button className="ml-2 text-[#a5f1c1]" onClick={() => setMessage("")}><X size={13} /></button></div>}
    </main>
  );
}
