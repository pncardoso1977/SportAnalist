"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Play, ShieldAlert, Video } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { ZONE_LABELS, type EventMoment, type Zone } from "@/lib/types";
import { calculateGoalScores, formatGoalScore } from "@/lib/goal-score";

type PublicMatch = {
  id: string;
  home_team: string;
  away_team: string;
  analyzed_team: string;
  youtube_url: string | null;
  age_group?: string | null;
  competition?: string | null;
  played_at?: string | null;
  venue?: string | null;
  analyzed_team_is_home?: boolean;
  created_at: string;
};

type PublicMatchVideo = { id: string | null; youtube_url: string; sort_order: number };

type PublicEvent = {
  id: string;
  video_second: number;
  moment: EventMoment;
  zone: Zone;
  outcome: string | null;
  youtube_url: string;
  created_at: string;
  event_name_pt: string;
  event_name_en: string;
};

type PublicAnalysis = { match: PublicMatch; videos?: PublicMatchVideo[]; events: PublicEvent[] };

function parseYouTubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    return ["embed", "shorts", "live"].includes(parts[0] ?? "") ? parts[1] ?? null : null;
  } catch {
    return null;
  }
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function eventName(event: PublicEvent, language: "pt" | "en") {
  const name = (language === "pt" ? event.event_name_pt : event.event_name_en).trim();
  if (language === "pt") {
    const base = name.toLowerCase().endsWith(" contra") ? name.slice(0, -7).trim() : name;
    return event.moment === "defense" ? `${base} Contra` : base;
  }
  const lower = name.toLowerCase();
  const base = lower.startsWith("opposition ")
    ? name.slice(11).trim()
    : lower.endsWith(" (against)") ? name.slice(0, -10).trim() : name;
  return event.moment === "defense" ? `Opposition ${base}` : base;
}

export default function PublicMatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => getSupabase(), []);
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [analysis, setAnalysis] = useState<PublicAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedSecond, setSelectedSecond] = useState(0);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [playerVersion, setPlayerVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      setAnalysis(null);
      if (!supabase) {
        setLoadError(language === "pt" ? "A visualização pública não está configurada." : "Public viewing is not configured.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_public_match_analysis", { p_share_token: token });
      if (!active) return;
      if (error || !data || !data.match) {
        setLoadError(language === "pt"
          ? "Este link não é válido ou a partilha foi desativada pelo editor."
          : "This link is invalid or sharing has been disabled by the editor.");
      } else {
        const result = data as PublicAnalysis;
        setAnalysis(result);
        setSelectedVideoUrl(result.videos?.[0]?.youtube_url ?? result.match.youtube_url ?? "");
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, token, language]);

  const events = analysis?.events ?? [];
  const goalScores = useMemo(() => calculateGoalScores(events), [events]);
  const matchVideos = analysis?.videos?.length
    ? analysis.videos
    : analysis?.match.youtube_url ? [{ id: null, youtube_url: analysis.match.youtube_url, sort_order: 0 }] : [];
  const activeVideoUrl = selectedVideoUrl || matchVideos[0]?.youtube_url || "";
  const videoId = parseYouTubeId(activeVideoUrl);
  const opponent = analysis
    ? analysis.match.home_team === analysis.match.analyzed_team
      ? analysis.match.away_team
      : analysis.match.home_team
    : "";
  const attacks = events.filter((event) => event.moment === "attack").length;
  const defenses = events.filter((event) => event.moment === "defense").length;
  const embedUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&start=${selectedSecond}${playerVersion > 0 ? "&autoplay=1" : ""}`
    : "";

  function selectPublicVideo(url: string) {
    setSelectedVideoUrl(url);
    setSelectedSecond(0);
    setPlayerVersion((current) => current + 1);
  }

  function seekToEvent(event: PublicEvent) {
    if (event.youtube_url && parseYouTubeId(event.youtube_url)) {
      setSelectedVideoUrl(event.youtube_url);
    }
    setSelectedSecond(event.video_second);
    setPlayerVersion((current) => current + 1);
  }

  const text = language === "pt"
    ? {
        subtitle: "ANÁLISE TÉCNICO-TÁTICA DE FUTSAL",
        shared: "Análise partilhada",
        video: "Vídeo do jogo",
        timeline: "Eventos registados",
        empty: "Este jogo ainda não tem eventos registados.",
        attack: "Ataque",
        defense: "Defesa",
        attacks: "Ataque",
        defenses: "Defesa",
        total: "Total",
        noVideo: "O vídeo não está disponível para incorporação. Podes abri-lo diretamente no YouTube.",
        openVideo: "Abrir vídeo",
        invalid: "Análise indisponível",
        loading: "A carregar análise…",
        footer: "Visualização pública · SportAnalist",
      }
    : {
        subtitle: "FUTSAL TECHNICAL & TACTICAL ANALYSIS",
        shared: "Shared analysis",
        video: "Match video",
        timeline: "Recorded events",
        empty: "No events have been recorded for this match yet.",
        attack: "Attack",
        defense: "Defence",
        attacks: "Attack",
        defenses: "Defence",
        total: "Total",
        noVideo: "The video cannot be embedded. You can open it directly on YouTube.",
        openVideo: "Open video",
        invalid: "Analysis unavailable",
        loading: "Loading analysis…",
        footer: "Public view · SportAnalist",
      };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1900px] flex-col gap-4 px-3 py-3 md:px-5 md:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263646] pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]">
            <Activity size={25} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SportAnalist</h1>
            <p className="muted text-[9px] font-semibold tracking-[.16em]">{text.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-[#35d07f40] bg-[#35d07f12] px-3 py-2 text-[10px] text-[#63e99e] sm:inline-flex">
            {text.shared}
          </span>
          <button className="btn !px-3 !py-2 text-xs" onClick={() => setLanguage(language === "pt" ? "en" : "pt")}>
            {language === "pt" ? "EN" : "PT"}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="panel flex min-h-48 items-center justify-center p-6 text-sm text-[#9eb0c0]">{text.loading}</div>
      ) : loadError || !analysis ? (
        <section className="panel mx-auto flex w-full max-w-xl flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert size={34} className="text-amber-300" />
          <h2 className="text-lg font-semibold">{text.invalid}</h2>
          <p className="muted text-sm">{loadError}</p>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                {analysis.match.home_team} <span className="muted font-normal">vs</span> {analysis.match.away_team}
              </h2>
              <p className="muted mt-1 text-xs">
                {[analysis.match.age_group, analysis.match.competition].filter(Boolean).join(" · ")}
                {analysis.match.played_at
                  ? ` · ${new Intl.DateTimeFormat(language === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(`${analysis.match.played_at}T12:00:00`))}`
                  : ""}
              </p>
              {analysis.match.venue && <p className="muted mt-1 text-xs">{analysis.match.venue}</p>}
              <p className="muted mt-1 text-[10px]">{language === "pt" ? "Equipa analisada:" : "Analysed team:"} {analysis.match.analyzed_team} · {analysis.match.analyzed_team_is_home === false ? (language === "pt" ? "Fora" : "Away") : (language === "pt" ? "Casa" : "Home")}</p>
            </div>
            <a className="btn !px-3 !py-2 text-xs" href={activeVideoUrl || "#"} target="_blank" rel="noreferrer">
              <ExternalLink size={13} />{text.openVideo}
            </a>
          </section>

          <section className="analysis-workspace with-event-controls min-w-0">
            <section className="analysis-video-panel panel min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[#263646] px-3 py-2">
                <Video size={15} className="text-[#7beaa8]" />
                <h3 className="text-sm font-semibold">{text.video}</h3>
                <span className="muted ml-auto font-mono text-sm text-[#75eca8]">{formatTime(selectedSecond)}</span>
              </div>
              {videoId ? (
                <div className="video-stage relative overflow-hidden bg-black">
                  <iframe
                    key={playerVersion}
                    className="absolute inset-0 h-full w-full"
                    src={embedUrl}
                    title={text.video}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="video-stage flex items-center justify-center p-6 text-center text-sm text-[#9eb0c0]">{text.noVideo}</div>
              )}
              {matchVideos.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[#263646] px-2.5 py-2">
                  {matchVideos.map((video, index) => (
                    <button key={video.id ?? video.youtube_url} type="button"
                      onClick={() => selectPublicVideo(video.youtube_url)}
                      className={`rounded-md border px-2 py-1 text-[10px] ${parseYouTubeId(activeVideoUrl) === parseYouTubeId(video.youtube_url) ? "border-[#35d07f80] bg-[#35d07f18] text-[#83e6a9]" : "border-[#31475a] text-[#b8c7d3]"}`}>
                      {language === "pt" ? "Vídeo" : "Video"} {index + 1}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="public-event-panel panel flex min-w-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-[#263646] px-2.5 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9eb0c0]">{text.timeline}</h3>
                <span className="rounded-full bg-[#35d07f18] px-2 py-1 text-[10px] text-[#66e99f]">{events.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 border-b border-[#263646] px-2 py-2">
                {[
                  { label: text.total, value: events.length },
                  { label: text.attacks, value: attacks },
                  { label: text.defenses, value: defenses },
                ].map((stat) => (
                  <div key={stat.label} className="min-w-0 text-center">
                    <p className="muted truncate text-[9px]">{stat.label}</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
              {events.length === 0 ? (
                <p className="muted px-3 py-5 text-xs">{text.empty}</p>
              ) : (
                <div className="public-event-scroll scrollbar min-h-0 overflow-y-auto">
                  {events.map((event) => (
                    <article key={event.id} className="border-b border-[#263646] px-2.5 py-2 last:border-b-0 hover:bg-white/[0.025]">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => seekToEvent(event)}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#7beaa8] hover:underline"
                          title={language === "pt" ? "Reproduzir este momento" : "Play this moment"}
                        >
                          <Play size={10} />{formatTime(event.video_second)}
                        </button>
                        <a
                          href={event.youtube_url || `https://www.youtube.com/watch?v=${videoId}&t=${event.video_second}s`}
                          target="_blank"
                          rel="noreferrer"
                          title={text.openVideo}
                          className="inline-flex text-[#8fc8ff] hover:text-white"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="mt-1 break-words text-xs font-semibold">
                        <span>{eventName(event, language)}</span>
                        {goalScores.has(event.id) && <span className="ml-1 inline-flex rounded border border-[#426b55] bg-[#12291e] px-1 py-0.5 font-mono text-[9px] font-semibold text-[#8af0ad]">{formatGoalScore(goalScores.get(event.id)!, analysis.match.analyzed_team_is_home !== false)}</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px]">
                        <span className={event.moment === "attack"
                          ? "rounded border border-[#315b47] bg-[#112820] px-1.5 py-0.5 text-[#79e9aa]"
                          : "rounded border border-[#694a40] bg-[#321f19] px-1.5 py-0.5 text-[#f0b08d]"}>
                          {event.moment === "attack" ? text.attack : text.defense}
                        </span>
                        <span className="muted">{ZONE_LABELS[event.zone][language]}</span>
                      </div>
                      {event.outcome && <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-[#b7c5d1]">{event.outcome}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </>
      )}

      <footer className="muted mt-auto border-t border-[#263646] pt-3 text-center text-[10px]">{text.footer}</footer>
    </main>
  );
}
