"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownToLine, CircleHelp, Clock3, FilePlus2,
  Globe2, Link2, LogOut, Menu, Play, Plus, RefreshCw, ShieldCheck, Trash2, Video, X,
} from "lucide-react";
import { DEFAULT_EVENT_TYPES, ZONE_LABELS, type EventMoment, type EventType, type Match, type MatchEvent, type Zone } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { CloudSetup } from "@/components/cloud-setup";
import type { AppRole } from "@/lib/types";

type Language = "pt" | "en";
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
  id: string; match_id: string; event_type_id: string; video_second: number; moment: EventMoment; zone: Zone; outcome: string | null;
  attacking_team: string | null; defending_team: string | null; created_by: string | null;
  created_at: string; youtube_url: string;
  event_types?: { name_pt: string; name_en: string } | null;
};

const COPY = {
  pt: {
    subtitle: "ANÁLISE TÉCNICO-TÁTICA DE FUTSAL", match: "Jogo em análise", analyzed: "Equipa analisada", sideMenu: "Menu", closeMenu: "Fechar menu", newMatch: "Novo jogo", savedMatches: "Jogos guardados", currentMatch: "Jogo ativo", mobileViewOnly: "No telemóvel, os eventos são apenas para consulta. Usa um tablet ou computador para registar eventos.",
    opponent: "Adversário", youtube: "Link do vídeo YouTube", load: "Carregar vídeo", video: "Vídeo do jogo",
    videoHelp: "Insere um link YouTube para associar o vídeo à análise.", videoUnavailable: "Vídeo não carregado ou incorporação indisponível.",
    currentTime: "Tempo atual", setTime: "Ir para segundo", capture: "Atalhos de registo", outcome: "Resultado / observação (opcional)", outcomePlaceholder: "Ex.: remate defendido, golo, bola recuperada…", attackMoment: "Momento de ataque", defenseMoment: "Momento de defesa", momentColumn: "Momento", resultColumn: "Resultado", autoRegisterHint: "Cada atalho regista automaticamente o evento, o momento, a zona e o segundo atual do vídeo.", savedEvent: "Evento registado", events: "Eventos", zone: "Zona do campo", left: "Esquerda",
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
  },
  en: {
    subtitle: "FUTSAL TECHNICAL & TACTICAL ANALYSIS", match: "Match analysis", analyzed: "Team analysed", sideMenu: "Menu", closeMenu: "Close menu", newMatch: "New match", savedMatches: "Saved matches", currentMatch: "Active match", mobileViewOnly: "On a phone, events are read-only. Use a tablet or computer to record events.",
    opponent: "Opponent", youtube: "YouTube video URL", load: "Load video", video: "Match video",
    videoHelp: "Paste a YouTube link to associate the video with this analysis.", videoUnavailable: "Video not loaded or embedding unavailable.",
    currentTime: "Current time", setTime: "Seek to second", capture: "Quick event capture", outcome: "Outcome / note (optional)", outcomePlaceholder: "e.g. shot saved, goal, possession won…", attackMoment: "Attacking phase", defenseMoment: "Defensive phase", momentColumn: "Moment", resultColumn: "Outcome", autoRegisterHint: "Each shortcut immediately records the event, phase, zone and current video second.", savedEvent: "Event recorded", events: "Events", zone: "Court zone", left: "Left",
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
  const [videoUrl, setVideoUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [currentSecond, setCurrentSecond] = useState(0);
  const [events, setEvents] = useState<EventType[]>(DEFAULT_EVENT_TYPES);
  const [records, setRecords] = useState<MatchEvent[]>([]);
  const [outcomeText, setOutcomeText] = useState("");
  const [newNamePt, setNewNamePt] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newIsCounter, setNewIsCounter] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<AppRole>("analyst");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterZone, setFilterZone] = useState("all");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudMatchId, setCloudMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventTypesRef = useRef(events);
  const t = COPY[language];
  const supabase = useMemo(() => getSupabase(), []);
  const mode = supabase ? "cloud" : "demo";

  const hasActiveMatch = Boolean(loadedUrl && (!supabase || cloudMatchId));
  const canConfigure = supabase ? Boolean(projectId && (role === "admin" || role === "configurator")) : role === "admin" || role === "configurator";
  const canRecord = hasActiveMatch && (supabase ? Boolean(projectId && cloudUserId && cloudMatchId && (role === "admin" || role === "analyst")) : role === "admin" || role === "analyst");
  const handleWorkspaceReady = useCallback((id: string, userId: string, memberRole: AppRole, teamName?: string) => {
    setProjectId(id); setCloudUserId(userId); setRole(memberRole);
    if (teamName) setTeam(teamName);
  }, []);
  const handleSignOut = useCallback(() => {
    setProjectId(null); setCloudUserId(null); setCloudMatchId(null); setRecords([]); setMatches([]);
  }, []);
  const activeEvents = events.filter((event) => event.active);

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
          id: row.id, match_id: row.match_id, event_type_id: row.event_type_id,
          event_name_pt: row.event_types?.name_pt ?? "Evento", event_name_en: row.event_types?.name_en ?? "Event",
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
            id: row.id, match_id: row.match_id, event_type_id: row.event_type_id,
            event_name_pt: eventType?.name_pt ?? "Evento", event_name_en: eventType?.name_en ?? "Event",
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
      const { data, error } = await supabase.from("matches")
        .select("id, home_team, away_team, analyzed_team, youtube_url, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setMessage(error.message);
        return;
      }
      setMatches((data ?? []) as Match[]);
    };
    void loadMatches();
    const channel = supabase.channel(`project-matches-${projectId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "matches", filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        const row = payload.new as Match;
        setMatches((current) => current.some((match) => match.id === row.id) ? current : [row, ...current]);
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId]);

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

  async function registerEvent(eventType: EventType, eventZone: Zone) {
    if (!canRecord) return;
    const moment: EventMoment = eventType.is_counter ? "defense" : "attack";
    const second = Math.max(0, Math.floor(playerRef.current?.getCurrentTime?.() ?? currentSecond));
    const videoMoment = youtubeMoment(loadedUrl, second);
    const outcome = outcomeText.trim() || null;
    const attacking = moment === "defense" ? opponent : null;
    const defending = moment === "defense" ? team : null;

    if (supabase) {
      if (!cloudMatchId || !cloudUserId) { setMessage(t.noAuth); return; }
      const { data, error } = await supabase.from("match_events").insert({
        match_id: cloudMatchId, event_type_id: eventType.id, video_second: second,
        moment, zone: eventZone, outcome, attacking_team: attacking, defending_team: defending,
        youtube_url: videoMoment, created_by: cloudUserId,
      }).select("id, created_at").single();
      if (error) { setMessage(error.message); return; }
      const saved: MatchEvent = {
        id: data.id, match_id: cloudMatchId, event_type_id: eventType.id,
        event_name_pt: eventType.name_pt, event_name_en: eventType.name_en,
        video_second: second, moment, zone: eventZone, outcome,
        attacking_team: attacking, defending_team: defending, created_by: cloudUserId,
        created_at: data.created_at, youtube_url: videoMoment,
      };
      setRecords((current) => current.some((entry) => entry.id === saved.id) ? current : [saved, ...current]);
      setMessage(t.saveCloud);
    } else {
      const localRecord: MatchEvent = {
        id: crypto.randomUUID(), match_id: "demo-match", event_type_id: eventType.id,
        event_name_pt: eventType.name_pt, event_name_en: eventType.name_en,
        video_second: second, moment, zone: eventZone, outcome,
        attacking_team: attacking, defending_team: defending, created_by: null,
        created_at: new Date().toISOString(), youtube_url: videoMoment,
      };
      setRecords((current) => [localRecord, ...current]);
      setMessage(t.created + " · " + t.saveLocal);
    }
    setOutcomeText("");
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

  async function loadVideo() {
    const id = parseYouTubeId(videoUrl);
    if (!id) { setMessage(t.linkBad); return; }
    if (supabase) {
      if (!projectId || !cloudUserId) { setMessage(t.noAuth); return; }
      const { data: existing, error: lookupError } = await supabase.from("matches")
        .select("id, home_team, away_team, analyzed_team, youtube_url, created_at")
        .eq("project_id", projectId).eq("home_team", team).eq("away_team", opponent)
        .eq("youtube_url", videoUrl.trim()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lookupError) { setMessage(lookupError.message); return; }
      let savedMatch = existing as Match | null;
      if (!savedMatch) {
        const { data: created, error } = await supabase.from("matches").insert({
          project_id: projectId, home_team: team, away_team: opponent, analyzed_team: team,
          youtube_url: videoUrl.trim(), created_by: cloudUserId,
        }).select("id, home_team, away_team, analyzed_team, youtube_url, created_at").single();
        if (error || !created) { setMessage(error?.message ?? t.saveError); return; }
        savedMatch = created as Match;
      }
      setMatches((current) => [savedMatch!, ...current.filter((match) => match.id !== savedMatch!.id)]);
      setCloudMatchId(savedMatch.id);
      setRecords([]);
    } else {
      setCloudMatchId(null);
      setRecords([]);
    }
    setVideoId(id);
    setLoadedUrl(videoUrl.trim());
    setCurrentSecond(0);
    setMessage(t.loading);
    setSidebarOpen(false);
  }

  function openSavedMatch(match: Match) {
    const id = parseYouTubeId(match.youtube_url);
    if (!id) { setMessage(t.linkBad); return; }
    const opponentName = match.home_team === match.analyzed_team ? match.away_team : match.home_team;
    setTeam(match.analyzed_team);
    setOpponent(opponentName);
    setVideoUrl(match.youtube_url);
    setLoadedUrl(match.youtube_url);
    setCloudMatchId(match.id);
    setVideoId(id);
    setCurrentSecond(0);
    setRecords([]);
    if (playerRef.current && videoId === id) playerRef.current.seekTo(0, true);
    setMessage(t.matchOpened);
    setSidebarOpen(false);
  }

  async function signOutFromSidebar() {
    if (supabase) await supabase.auth.signOut();
    setSidebarOpen(false);
  }

  async function createEventType() {
    if (!newNamePt.trim() || !newNameEn.trim()) { setMessage(t.eventRequired); return; }
    const eventType: EventType = {
      id: crypto.randomUUID(), name_pt: newNamePt.trim(), name_en: newNameEn.trim(),
      is_counter: newIsCounter, active: true, sort_order: events.length * 10 + 10,
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
    setNewNamePt(""); setNewNameEn(""); setNewIsCounter(false); setMessage(t.created);
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
    const rows = [
      ["video_second", "event_pt", "event_en", "moment", "zone", "outcome", "attacking_team", "defending_team", "youtube_url"],
      ...filteredRecords.map((record) => [record.video_second, record.event_name_pt, record.event_name_en, record.moment, record.zone, record.outcome ?? "",
        record.attacking_team ?? "", record.defending_team ?? "", record.youtube_url]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sportanalist-events.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  const totalAttacks = records.filter((record) => record.moment === "attack").length;
  const totalCounters = records.filter((record) => events.find((event) => event.id === record.event_type_id)?.is_counter).length;

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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.newMatch}</h3>
                {cloudMatchId && <span className="rounded-full bg-[#35d07f18] px-2 py-0.5 text-[10px] text-[#70eaa5]">{t.currentMatch}</span>}
              </div>
              <label className="block text-[11px] font-semibold text-[#a8b8c7]">{t.analyzed}
                <input className="field mt-1 !px-2.5 !py-2 text-xs" value={team} onChange={(e) => setTeam(e.target.value)} />
              </label>
              <label className="block text-[11px] font-semibold text-[#a8b8c7]">{t.opponent}
                <input className="field mt-1 !px-2.5 !py-2 text-xs" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
              </label>
              <label className="block text-[11px] font-semibold text-[#a8b8c7]">{t.youtube}
                <input className="field mt-1 !px-2.5 !py-2 text-xs" placeholder="youtube.com/watch?v=…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
              </label>
              <button className="btn btn-primary w-full !py-2 text-xs" disabled={supabase ? !projectId || !cloudUserId || (role !== "admin" && role !== "analyst") : role === "viewer" || role === "configurator"} onClick={() => void loadVideo()}><Video size={14} />{t.load}</button>
            </section>
          </>}

          {supabase && projectId && <section className="min-h-0 flex-1 border-t border-[#263646] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">{t.savedMatches}</h3>
              <span className="rounded-full border border-[#263646] px-2 py-0.5 text-[10px]">{matches.length}</span>
            </div>
            {matches.length === 0 ? <p className="muted py-2 text-xs">{t.noMatches}</p> : <div className="scrollbar flex flex-col gap-1.5 overflow-y-auto">
              {matches.map((match) => {
                const opposingTeam = match.home_team === match.analyzed_team ? match.away_team : match.home_team;
                return <div key={match.id} className={`rounded-lg border p-2 ${cloudMatchId === match.id ? "border-[#35d07f80] bg-[#35d07f0e]" : "border-[#263646] bg-[#0b131c]"}`}>
                  <button className="block w-full text-left" onClick={() => openSavedMatch(match)} title={t.openMatch}>
                    <p className="truncate text-xs font-semibold">{match.analyzed_team} <span className="muted font-normal">vs</span> {opposingTeam}</p>
                    <p className="muted mt-1 text-[10px]">{new Intl.DateTimeFormat(language === "pt" ? "pt-PT" : "en-GB", { dateStyle: "short" }).format(new Date(match.created_at))}</p>
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <a className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[#8fc8ff] hover:underline" href={match.youtube_url} target="_blank" rel="noreferrer"><Link2 size={11} className="shrink-0" />{language === "pt" ? "Link do vídeo" : "Video link"}</a>
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

          <div className="analysis-workspace grid min-w-0 items-start gap-3">
          <section className="analysis-video-panel panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#263646] px-3 py-2">
              <div><h2 className="text-sm font-semibold">{t.video}</h2><p className="muted mt-0.5 max-w-[65vw] truncate text-[10px]">{loadedUrl || t.videoHelp}</p></div>
              <span className="rounded-lg border border-[#263646] bg-[#0b131c] px-2.5 py-1.5 font-mono text-sm text-[#75eca8]"><Clock3 className="mr-1.5 inline" size={13} />{formatTime(currentSecond)}</span>
            </div>
            <div className="video-stage relative w-full overflow-hidden bg-black">
              {videoId ? <div id="sportanalist-player" className="h-full w-full" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[#8798a8]"><Video size={34} strokeWidth={1.2} /><p className="text-sm">{t.videoHelp}</p></div>}
            </div>
          </section>

          {hasActiveMatch && <section className="event-capture-panel panel flex flex-col gap-2 p-2.5">
            <div className="event-matrix grid grid-cols-1 gap-2">
              {(["attack", "defense"] as EventMoment[]).map((moment) => {
                const momentEvents = activeEvents.filter((event) => event.is_counter === (moment === "defense"));
                const momentIsAttack = moment === "attack";
                const momentColor = momentIsAttack
                  ? { heading: "text-[#79e9aa]", panel: "border-[#284a3b] bg-[#0d1d19]", button: "border-[#315b47] bg-[#112820] hover:border-[#62df98]", icon: "text-[#90d5ad]" }
                  : { heading: "text-[#f0b08d]", panel: "border-[#59413a] bg-[#211713]", button: "border-[#694a40] bg-[#321f19] hover:border-[#dd9874]", icon: "text-[#d7a38c]" };
                const heading = momentIsAttack ? t.attackMoment : t.defenseMoment;
                return <section key={moment} className={`rounded-lg border p-2 ${momentColor.panel}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className={`text-xs font-semibold ${momentColor.heading}`}>{heading}</h3>
                    
                  </div>
                  <div className="event-grid grid grid-cols-[minmax(76px,1.35fr)_repeat(3,minmax(0,1fr))] items-center gap-x-1 gap-y-0.5">
                    <div />
                    {(["left", "center", "right"] as Zone[]).map((eventZone) => <div key={eventZone} className="truncate px-0.5 pb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{ZONE_LABELS[eventZone][language]}</div>)}
                    {momentEvents.map((event) => {
                      const allowedZones = zonesForEvent(event);
                      return <div key={event.id} className="contents">
                        <div className="truncate py-1 pr-1 text-[10px] font-medium" title={language === "pt" ? event.name_pt : event.name_en}>{language === "pt" ? event.name_pt : event.name_en}</div>
                        {(["left", "center", "right"] as Zone[]).map((eventZone) => allowedZones.includes(eventZone)
                          ? <div key={eventZone} className="flex items-center justify-center">
                              <button type="button" disabled={!canRecord} title={`${language === "pt" ? event.name_pt : event.name_en} · ${ZONE_LABELS[eventZone][language]}`}
                                aria-label={`Registar ${language === "pt" ? event.name_pt : event.name_en} · ${ZONE_LABELS[eventZone][language]}`}
                                onClick={() => void registerEvent(event, eventZone)}
                                className={`event-shortcut flex h-5 w-6 items-center justify-center rounded border ${momentColor.button} disabled:cursor-not-allowed disabled:opacity-35`}>
                                <Plus size={11} className={momentColor.icon} />
                              </button>
                            </div>
                          : <div key={eventZone} className="flex items-center justify-center text-[10px] text-[#526170]">—</div>)}
                      </div>;
                    })}
                  </div>
                </section>;
              })}
            </div>

            <label className="block text-[10px] font-semibold text-[#a8b8c7]">
              {t.outcome}
              <textarea className="field mt-1 min-h-[38px] resize-none !px-2.5 !py-1.5 text-xs" rows={1} value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)} placeholder={t.outcomePlaceholder} />
            </label>
            <section className="event-feed overflow-hidden rounded-lg border border-[#263646] bg-[#0b131c]">
              <div className="flex items-center justify-between border-b border-[#263646] px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9eb0c0]">{language === "pt" ? "Eventos registados" : "Recorded events"}</span>
                <span className="rounded-full bg-[#35d07f18] px-1.5 py-0.5 text-[9px] text-[#66e99f]">{records.length}</span>
              </div>
              {eventFeedRecords.length === 0 ? <p className="muted px-2 py-3 text-[10px]">{t.empty}</p> : <div className="max-h-[30svh] overflow-y-auto">
                <table className="event-feed-table w-full table-fixed">
                  <thead><tr><th className="w-[54px]">{t.time}</th><th>{t.event}</th><th className="w-[70px]">{t.momentColumn}</th><th className="w-[25px]"></th></tr></thead>
                  <tbody>{eventFeedRecords.map((record) => <tr key={record.id}>
                    <td><a className="font-mono text-[10px] font-semibold text-[#7beaa8] hover:underline" href={record.youtube_url || "#"} target="_blank" rel="noreferrer" title={language === "pt" ? "Abrir este momento no YouTube" : "Open this moment on YouTube"}>{formatTime(record.video_second)}</a></td>
                    <td className="truncate text-[10px]" title={language === "pt" ? record.event_name_pt : record.event_name_en}>{language === "pt" ? record.event_name_pt : record.event_name_en}</td>
                    <td className="text-[9px]" title={record.moment === "attack" ? t.attackMoment : t.defenseMoment}>{record.moment === "attack" ? (language === "pt" ? "Ataque" : "Attack") : (language === "pt" ? "Defesa" : "Defence")}</td>
                    <td><button type="button" aria-label={t.delete} title={t.delete} className="event-delete flex h-5 w-5 items-center justify-center rounded text-[#ff9999] hover:bg-[#ff777722]" onClick={() => void removeEvent(record)}><X size={13} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </section>
            {!canRecord && <p className="text-[10px] text-amber-300">{t.readOnly}</p>}
          </section>}
          {hasActiveMatch && <p className="mobile-view-only muted text-xs">{t.mobileViewOnly}</p>}
          </div>

          {hasActiveMatch && <>
            <section className="grid gap-2 sm:grid-cols-3">
              {[{ label: t.statsTotal, value: records.length, icon: Activity }, { label: t.attacks, value: totalAttacks, icon: Play }, { label: t.counters, value: totalCounters, icon: RefreshCw }].map(({ label, value, icon: Icon }) => <div key={label} className="panel flex items-center justify-between p-3"><div><p className="muted text-[10px]">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div><div className="rounded-lg bg-[#35d07f17] p-2 text-[#57e394]"><Icon size={17} /></div></div>)}
            </section>


          </>}

          {canConfigure && <section className="panel grid gap-3 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="md:col-span-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">{t.configure}</h2><p className="muted mt-0.5 text-[10px]">{t.configHint}</p></div><ShieldCheck className="text-[#62e69b]" size={20} /></div>
            <label className="text-[11px] text-[#9eb0c0]">{t.newEvent}<input className="field mt-1 !px-2.5 !py-2 text-xs" value={newNamePt} onChange={(e) => setNewNamePt(e.target.value)} placeholder="Ex.: Remate" /></label>
            <label className="text-[11px] text-[#9eb0c0]">{t.newEventEn}<input className="field mt-1 !px-2.5 !py-2 text-xs" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="e.g. Shot" /></label>
            <button className="btn btn-primary h-[38px] text-xs" onClick={() => void createEventType()}><FilePlus2 size={13} />{t.create}</button>
            <label className="flex items-center gap-2 text-[11px] text-[#b4c2ce] md:col-span-3"><input type="checkbox" checked={newIsCounter} onChange={(e) => setNewIsCounter(e.target.checked)} className="accent-[#35d07f]" />{t.counter}</label>
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
