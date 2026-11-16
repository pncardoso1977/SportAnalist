"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownToLine, Check, ChevronDown, CircleHelp, Clock3, FilePlus2,
  Globe2, Link2, Play, Plus, RefreshCw, ShieldCheck, Trash2, Video, X,
} from "lucide-react";
import { DEFAULT_EVENT_TYPES, type EventType, type MatchEvent, type Zone, ZONE_LABELS } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

type Language = "pt" | "en";
type PlayerWindow = Window & { YT?: any; onYouTubeIframeAPIReady?: () => void };

const COPY = {
  pt: {
    subtitle: "ANÁLISE TÉCNICO-TÁTICA DE FUTSAL", match: "Jogo em análise", analyzed: "Equipa analisada",
    opponent: "Adversário", youtube: "Link do vídeo YouTube", load: "Carregar vídeo", video: "Vídeo do jogo",
    videoHelp: "Insere um link YouTube para associar o vídeo à análise.", videoUnavailable: "Vídeo não carregado ou incorporação indisponível.",
    currentTime: "Tempo atual", setTime: "Ir para segundo", capture: "Registar evento", selected: "Evento selecionado",
    chooseEvent: "Escolhe um evento para começar", events: "Eventos", zone: "Zona do campo", left: "Esquerda",
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
    matchHelp: "Cada jogo tem uma equipa analisada, adversário e vídeo próprio.", noVideo: "Sem vídeo",
    keyboard: "Atalhos", keyboardHint: "Teclas 1–9 registam diretamente o evento correspondente.",
    role: "Perfil", viewer: "Observador", analyst: "Analista", admin: "Administrador", configurator: "Configurador",
    readOnly: "Perfil de visualização: registo desativado.", setup: "Configuração de serviços", setupHint: "Para colaboração em tempo real, configure as variáveis Supabase e aplique a migração SQL.",
    statsTotal: "Total de eventos", roleDemo: "Perfil demonstrativo", noAuth: "A autenticação será ativada quando Supabase estiver configurado.",
    eventRequired: "Preenche os nomes do evento.", saveError: "Não foi possível guardar no servidor. O registo foi mantido localmente.",
  },
  en: {
    subtitle: "FUTSAL TECHNICAL & TACTICAL ANALYSIS", match: "Match analysis", analyzed: "Team analysed",
    opponent: "Opponent", youtube: "YouTube video URL", load: "Load video", video: "Match video",
    videoHelp: "Paste a YouTube link to associate the video with this analysis.", videoUnavailable: "Video not loaded or embedding unavailable.",
    currentTime: "Current time", setTime: "Seek to second", capture: "Record event", selected: "Selected event",
    chooseEvent: "Choose an event to start", events: "Events", zone: "Court zone", left: "Left",
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
    matchHelp: "Each match has an analysed team, opponent and its own video.", noVideo: "No video",
    keyboard: "Shortcuts", keyboardHint: "Keys 1–9 record the corresponding event directly.",
    role: "Role", viewer: "Viewer", analyst: "Analyst", admin: "Administrator", configurator: "Configurator",
    readOnly: "Viewer role: event recording is disabled.", setup: "Service configuration", setupHint: "For real-time collaboration, configure Supabase environment variables and apply the SQL migration.",
    statsTotal: "Total events", roleDemo: "Demo role", noAuth: "Authentication will be enabled once Supabase is configured.",
    eventRequired: "Enter both event names.", saveError: "Could not save to server. The event was kept locally.",
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
  const [manualSecond, setManualSecond] = useState("0");
  const [events, setEvents] = useState<EventType[]>(DEFAULT_EVENT_TYPES);
  const [records, setRecords] = useState<MatchEvent[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [zone, setZone] = useState<Zone>("center");
  const [attackingTeam, setAttackingTeam] = useState("Equipa A");
  const [defendingTeam, setDefendingTeam] = useState("Equipa B");
  const [newNamePt, setNewNamePt] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newIsCounter, setNewIsCounter] = useState(false);
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterZone, setFilterZone] = useState("all");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"demo" | "cloud">("demo");
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = COPY[language];
  const supabase = useMemo(() => getSupabase(), []);

  const isReadOnly = role === "viewer" || role === "configurator";
  const canConfigure = role === "admin" || role === "configurator";
  const canRecord = role === "admin" || role === "analyst";
  const activeEvents = events.filter((event) => event.active);
  const currentEvent = events.find((event) => event.id === selected);
  const currentIsCounter = Boolean(currentEvent?.is_counter);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sportanalist-demo");
      if (saved) {
        const data = JSON.parse(saved);
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
    setMode("cloud");
    let cancelled = false;
    const loadEvents = async () => {
      const { data, error } = await supabase.from("event_types").select("*").eq("active", true).order("sort_order");
      if (!cancelled && !error && data?.length) setEvents(data as EventType[]);
      const { data: authData } = await supabase.auth.getUser();
      if (!cancelled && authData.user) {
        const { data: rows } = await supabase.from("match_events").select("*, event_types(name_pt,name_en)").order("video_second");
        if (rows && !cancelled) {
          setRecords(rows.map((row: any) => ({
            id: row.id, match_id: row.match_id, event_type_id: row.event_type_id,
            event_name_pt: row.event_types?.name_pt ?? "Evento", event_name_en: row.event_types?.name_en ?? "Event",
            video_second: row.video_second, zone: row.zone, attacking_team: row.attacking_team,
            defending_team: row.defending_team, created_by: row.created_by, created_at: row.created_at,
            youtube_url: row.youtube_url,
          })));
        }
      }
    };
    void loadEvents();
    const channel = supabase.channel("match-events-live").on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as any;
        setRecords((current) => current.some((entry) => entry.id === row.id) ? current : [...current, {
          id: row.id, match_id: row.match_id, event_type_id: row.event_type_id, event_name_pt: row.event_name_pt ?? "Evento",
          event_name_en: row.event_name_en ?? "Event", video_second: row.video_second, zone: row.zone,
          attacking_team: row.attacking_team, defending_team: row.defending_team, created_by: row.created_by,
          created_at: row.created_at, youtube_url: row.youtube_url,
        }]);
      } else if (payload.eventType === "DELETE") setRecords((current) => current.filter((entry) => entry.id !== (payload.old as any).id));
    }).subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [supabase]);

  const refreshClock = useCallback(() => {
    const second = playerRef.current?.getCurrentTime?.();
    if (typeof second === "number" && Number.isFinite(second)) {
      setCurrentSecond(Math.floor(second));
      setManualSecond(String(Math.floor(second)));
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < activeEvents.length && canRecord) {
        event.preventDefault();
        void registerEvent(activeEvents[index]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // registration reads live state through the current render
  });

  const filteredRecords = useMemo(() => records
    .filter((record) => filterEvent === "all" || record.event_type_id === filterEvent)
    .filter((record) => filterZone === "all" || record.zone === filterZone)
    .slice().sort((a, b) => a.video_second - b.video_second), [records, filterEvent, filterZone]);

  async function registerEvent(eventType = currentEvent) {
    if (!eventType || !canRecord) return;
    const second = Math.max(0, Math.floor(playerRef.current?.getCurrentTime?.() ?? currentSecond));
    const videoMoment = youtubeMoment(loadedUrl, second);
    const matchId = "demo-match";
    const timestamp = new Date().toISOString();
    const localRecord: MatchEvent = {
      id: crypto.randomUUID(), match_id: matchId, event_type_id: eventType.id,
      event_name_pt: eventType.name_pt, event_name_en: eventType.name_en,
      video_second: second, zone, attacking_team: eventType.is_counter ? attackingTeam : null,
      defending_team: eventType.is_counter ? defendingTeam : null, created_by: null,
      created_at: timestamp, youtube_url: videoMoment,
    };
    setRecords((current) => [...current, localRecord]);
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("match_events").insert({
        match_id: null, event_type_id: eventType.id, video_second: second, zone,
        attacking_team: eventType.is_counter ? attackingTeam : null,
        defending_team: eventType.is_counter ? defendingTeam : null, youtube_url: videoMoment,
        created_by: userData.user?.id ?? null,
      });
      if (error) setMessage(t.saveError);
      else setMessage(t.saveCloud);
    } else setMessage(t.created + " · " + t.saveLocal);
    setSelected(eventType.id);
  }

  async function removeEvent(record: MatchEvent) {
    if (role !== "admin" && record.created_by) {
      const { data } = await supabase?.auth.getUser() ?? { data: { user: null } };
      if (record.created_by !== data.user?.id) return;
    }
    if (!window.confirm(t.confirmDelete)) return;
    setRecords((current) => current.filter((entry) => entry.id !== record.id));
    if (supabase && record.created_by) await supabase.from("match_events").delete().eq("id", record.id);
    setMessage(t.removed);
  }

  function loadVideo() {
    const id = parseYouTubeId(videoUrl);
    if (!id) { setMessage(t.linkBad); return; }
    setVideoId(id);
    setLoadedUrl(videoUrl.trim());
    setCurrentSecond(0);
    setManualSecond("0");
    setMessage(t.loading);
  }

  function seek() {
    const second = Math.max(0, Number(manualSecond) || 0);
    playerRef.current?.seekTo?.(second, true);
    setCurrentSecond(second);
  }

  async function createEventType() {
    if (!newNamePt.trim() || !newNameEn.trim()) { setMessage(t.eventRequired); return; }
    const eventType: EventType = {
      id: crypto.randomUUID(), name_pt: newNamePt.trim(), name_en: newNameEn.trim(),
      is_counter: newIsCounter, active: true, sort_order: events.length * 10 + 10,
    };
    setEvents((current) => [...current, eventType]);
    if (supabase) {
      const { error } = await supabase.from("event_types").insert({
        name_pt: eventType.name_pt, name_en: eventType.name_en, is_counter: eventType.is_counter,
        active: true, sort_order: eventType.sort_order,
      });
      if (error) setMessage(error.message);
    }
    setNewNamePt(""); setNewNameEn(""); setNewIsCounter(false); setMessage(t.created);
  }

  function exportCsv() {
    const rows = [
      ["video_second", "event_pt", "event_en", "zone", "attacking_team", "defending_team", "youtube_url"],
      ...filteredRecords.map((record) => [record.video_second, record.event_name_pt, record.event_name_en, record.zone,
        record.attacking_team ?? "", record.defending_team ?? "", record.youtube_url]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sportanalist-events.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  const totalAttacks = records.filter((record) => record.event_type_id === "attack" || record.event_type_id === "attack-against").length;
  const totalCounters = records.filter((record) => events.find((event) => event.id === record.event_type_id)?.is_counter).length;

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 md:px-7 md:py-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]"><Activity size={27} /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">SportAnalist</h1><p className="muted text-[10px] font-semibold tracking-[.16em]">{t.subtitle}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden rounded-full border border-[#35d07f40] bg-[#35d07f12] px-3 py-2 text-xs text-[#63e99e] sm:inline-flex"><span className="mr-2 mt-1 h-2 w-2 rounded-full bg-[#35d07f]" />{mode === "cloud" ? t.connected : t.demo}</span>
          <select aria-label={t.role} className="field !w-auto text-sm" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="admin">{t.admin}</option><option value="analyst">{t.analyst}</option><option value="configurator">{t.configurator}</option><option value="viewer">{t.viewer}</option>
          </select>
          <button className="btn" onClick={() => setLanguage(language === "pt" ? "en" : "pt")}><Globe2 size={16} />{language.toUpperCase()}</button>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-[#263646] bg-[#101923eb] p-4 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
        <label className="block text-xs font-semibold text-[#a8b8c7]">{t.analyzed}<input className="field mt-2" value={team} onChange={(e) => { setTeam(e.target.value); setAttackingTeam(e.target.value); }} /></label>
        <label className="block text-xs font-semibold text-[#a8b8c7]">{t.opponent}<input className="field mt-2" value={opponent} onChange={(e) => { setOpponent(e.target.value); setDefendingTeam(e.target.value); }} /></label>
        <label className="block text-xs font-semibold text-[#a8b8c7]">{t.youtube}<input className="field mt-2" placeholder="https://www.youtube.com/watch?v=…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} /></label>
        <button className="btn btn-primary h-[42px]" onClick={loadVideo}><Video size={16} />{t.load}</button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.85fr)]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#263646] px-4 py-3">
            <div><h2 className="font-semibold">{t.video}</h2><p className="muted mt-1 text-xs">{loadedUrl || t.videoHelp}</p></div>
            <span className="rounded-lg border border-[#263646] bg-[#0b131c] px-3 py-2 font-mono text-sm text-[#75eca8]"><Clock3 className="mr-2 inline" size={14} />{formatTime(currentSecond)}</span>
          </div>
          <div className="relative aspect-video bg-black">
            {videoId ? <div id="sportanalist-player" className="h-full w-full" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[#8798a8]"><Video size={38} strokeWidth={1.2} /><p className="text-sm">{t.videoHelp}</p></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="muted text-xs">{t.currentTime}</span>
            <div className="flex items-center gap-2"><input aria-label={t.currentTime} type="number" min="0" className="field !w-24 font-mono" value={manualSecond} onChange={(e) => setManualSecond(e.target.value)} /><button className="btn" onClick={seek}><Play size={14} />{t.setTime}</button></div>
          </div>
        </section>

        <section className="panel flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{t.capture}</h2><span className="rounded-full bg-[#35d07f18] px-2.5 py-1 text-xs text-[#66e99f]">{records.length} {t.events.toLowerCase()}</span></div>
          <div><div className="mb-2 text-xs font-semibold text-[#9eb0c0]">{t.events}</div><div className="grid grid-cols-2 gap-2">
            {activeEvents.map((event, index) => <button key={event.id} onClick={() => setSelected(event.id)} disabled={!canRecord} className={`flex min-h-[45px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${selected === event.id ? "border-[#35d07f] bg-[#35d07f18] text-[#78efa9]" : "border-[#263646] bg-[#0b131c] hover:border-[#526a7e]"}`}><span>{language === "pt" ? event.name_pt : event.name_en}</span><kbd className="kbd">{index + 1}</kbd></button>)}
          </div></div>
          <div><div className="mb-2 text-xs font-semibold text-[#9eb0c0]">{t.zone}</div><div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as Zone[]).map((value) => <button key={value} onClick={() => setZone(value)} className={`rounded-xl border py-3 text-sm ${zone === value ? "border-[#35d07f] bg-[#35d07f18] text-[#78efa9]" : "border-[#263646] bg-[#0b131c]"}`}>{t[value]}</button>)}
          </div></div>
          {currentIsCounter && <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[#9eb0c0]">{t.attackTeam}<select className="field mt-2" value={attackingTeam} onChange={(e) => setAttackingTeam(e.target.value)}><option>{team}</option><option>{opponent}</option></select></label>
            <label className="text-xs text-[#9eb0c0]">{t.defenseTeam}<select className="field mt-2" value={defendingTeam} onChange={(e) => setDefendingTeam(e.target.value)}><option>{opponent}</option><option>{team}</option></select></label>
          </div>}
          <div className="flex items-center justify-between gap-2 border-t border-[#263646] pt-3">
            <div className="min-w-0"><div className="muted text-[10px] uppercase tracking-wider">{t.selected}</div><div className="truncate text-sm font-semibold">{currentEvent ? (language === "pt" ? currentEvent.name_pt : currentEvent.name_en) : t.chooseEvent}</div></div>
            <button disabled={!currentEvent || !canRecord} className="btn btn-primary shrink-0" onClick={() => void registerEvent()}><Plus size={16} />{t.capture}</button>
          </div>
          {!canRecord && <p className="text-xs text-amber-300">{t.readOnly}</p>}
          <p className="muted text-[11px]">{t.keyboard}: {t.keyboardHint}</p>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[{ label: t.statsTotal, value: records.length, icon: Activity }, { label: t.attacks, value: totalAttacks, icon: Play }, { label: t.counters, value: totalCounters, icon: RefreshCw }].map(({ label, value, icon: Icon }) => <div key={label} className="panel flex items-center justify-between p-4"><div><p className="muted text-xs">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight">{value}</p></div><div className="rounded-xl bg-[#35d07f17] p-3 text-[#57e394]"><Icon size={21} /></div></div>)}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263646] p-4">
          <div><h2 className="font-semibold">{t.timeline}</h2><p className="muted mt-1 text-xs">{filteredRecords.length} / {records.length} {t.events.toLowerCase()}</p></div>
          <div className="flex flex-wrap gap-2">
            <select className="field !w-auto text-xs" value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}><option value="all">{t.filter}</option>{events.map((event) => <option key={event.id} value={event.id}>{language === "pt" ? event.name_pt : event.name_en}</option>)}</select>
            <select className="field !w-auto text-xs" value={filterZone} onChange={(e) => setFilterZone(e.target.value)}><option value="all">{t.allZones}</option><option value="left">{t.left}</option><option value="center">{t.center}</option><option value="right">{t.right}</option></select>
            <button className="btn" onClick={exportCsv}><ArrowDownToLine size={15} />{t.export}</button>
          </div>
        </div>
        <div className="scrollbar overflow-x-auto">
          {filteredRecords.length === 0 ? <div className="p-12 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#172331] text-[#8da0b1]"><Activity size={20} /></div><p className="muted text-sm">{t.empty}</p></div> : <table><thead><tr><th>{t.time}</th><th>{t.event}</th><th>{t.zone}</th><th>{t.teams}</th><th>{t.action}</th></tr></thead><tbody>
            {filteredRecords.map((record) => <tr key={record.id}><td className="font-mono text-[#7beaa8]">{formatTime(record.video_second)}</td><td>{language === "pt" ? record.event_name_pt : record.event_name_en}</td><td>{t[record.zone]}</td><td>{record.attacking_team ? `${record.attacking_team} → ${record.defending_team}` : "—"}</td><td><div className="flex items-center gap-1"><a className="btn !px-2 !py-1.5 text-xs" href={record.youtube_url || "#"} target="_blank" rel="noreferrer"><Link2 size={13} />{t.open}</a><button aria-label={t.delete} className="btn !px-2 !py-1.5 text-xs text-red-300" onClick={() => void removeEvent(record)}><Trash2 size={13} /></button></div></td></tr>)}
          </tbody></table>}
        </div>
      </section>

      {canConfigure && <section className="panel grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="md:col-span-3 flex items-center justify-between gap-2"><div><h2 className="font-semibold">{t.configure}</h2><p className="muted mt-1 text-xs">{t.configHint}</p></div><ShieldCheck className="text-[#62e69b]" size={22} /></div>
        <label className="text-xs text-[#9eb0c0]">{t.newEvent}<input className="field mt-2" value={newNamePt} onChange={(e) => setNewNamePt(e.target.value)} placeholder="Ex.: Remate" /></label>
        <label className="text-xs text-[#9eb0c0]">{t.newEventEn}<input className="field mt-2" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="e.g. Shot" /></label>
        <button className="btn btn-primary h-[42px]" onClick={() => void createEventType()}><FilePlus2 size={15} />{t.create}</button>
        <label className="flex items-center gap-2 text-xs text-[#b4c2ce] md:col-span-3"><input type="checkbox" checked={newIsCounter} onChange={(e) => setNewIsCounter(e.target.checked)} className="accent-[#35d07f]" />{t.counter}</label>
      </section>}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#263646] pt-4">
        <div className="flex items-center gap-2 text-xs text-[#8fa1b3]"><CircleHelp size={14} />{t.setupHint}</div>
        <span className="text-xs text-[#6d8194]">SportAnalist · v0.1.0</span>
      </footer>
      {message && <div role="status" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-[#365846] bg-[#12241b] px-4 py-3 text-sm text-[#a5f1c1] shadow-xl">{message}<button className="ml-3 text-[#a5f1c1]" onClick={() => setMessage("")}><X size={14} /></button></div>}
    </main>
  );
}