"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Play, ShieldAlert, Video } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { ZONE_LABELS, type EventMoment, type Zone } from "@/lib/types";

type PublicMatch = {
  id: string;
  home_team: string;
  away_team: string;
  analyzed_team: string;
  youtube_url: string;
  created_at: string;
};

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

type PublicAnalysis = { match: PublicMatch; events: PublicEvent[] };

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
        setAnalysis(data as PublicAnalysis);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, token, language]);

  const events = analysis?.events ?? [];
  const videoId = analysis ? parseYouTubeId(analysis.match.youtube_url) : null;
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

  function seekToEvent(event: PublicEvent) {
    setSelectedSecond(event.video_second);
    setPlayerVersion((current) => current + 1);
  }

  const text = language === "pt"
    ? {
        subtitle: "ANÁLISE TÉCNICO-TÁTICA DE FUTSAL",
        shared: "Análise partilhada",
        video: "Vídeo do jogo",
        timeline: "Cronologia de eventos",
        empty: "Este jogo ainda não tem eventos registados.",
        time: "Tempo",
        event: "Evento",
        moment: "Momento",
        zone: "Zona",
        outcome: "Resultado",
        attack: "Ataque",
        defense: "Defesa",
        attacks: "Momentos de ataque",
        defenses: "Momentos de defesa",
        total: "Total de eventos",
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
        timeline: "Event timeline",
        empty: "No events have been recorded for this match yet.",
        time: "Time",
        event: "Event",
        moment: "Moment",
        zone: "Zone",
        outcome: "Outcome",
        attack: "Attack",
        defense: "Defence",
        attacks: "Attacking moments",
        defenses: "Defensive moments",
        total: "Total events",
        noVideo: "The video cannot be embedded. You can open it directly on YouTube.",
        openVideo: "Open video",
        invalid: "Analysis unavailable",
        loading: "Loading analysis…",
        footer: "Public view · SportAnalist",
      };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-5 px-3 py-5 md:px-6 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263646] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#35d07f1c] text-[#35d07f]">
            <Activity size={25} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SportAnalist</h1>
            <p className="muted text-[9px] font-semibold tracking-[.16em]">{text.subtitle}</p>
          </div>
        </div>
        <button className="btn !px-3 !py-2 text-xs" onClick={() => setLanguage(language === "pt" ? "en" : "pt")}>
          {language === "pt" ? "EN" : "PT"}
        </button>
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
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[#7beaa8]">{text.shared}</p>
              <h2 className="text-2xl font-bold tracking-tight">
                {analysis.match.analyzed_team} <span className="muted font-normal">vs</span> {opponent}
              </h2>
              <p className="muted mt-1 text-xs">
                {new Intl.DateTimeFormat(language === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(analysis.match.created_at))}
              </p>
            </div>
            <a className="btn !px-3 !py-2 text-xs" href={analysis.match.youtube_url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} />{text.openVideo}
            </a>
          </section>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(250px,.8fr)]">
            <div className="panel min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[#263646] px-3 py-2">
                <Video size={15} className="text-[#7beaa8]" />
                <h3 className="text-sm font-semibold">{text.video}</h3>
                <span className="muted ml-auto font-mono text-xs">{formatTime(selectedSecond)}</span>
              </div>
              {videoId ? (
                <div className="aspect-video w-full bg-black">
                  <iframe
                    key={playerVersion}
                    className="h-full w-full"
                    src={embedUrl}
                    title={text.video}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-[#9eb0c0]">{text.noVideo}</div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: text.total, value: events.length },
                { label: text.attacks, value: attacks },
                { label: text.defenses, value: defenses },
              ].map((stat) => (
                <div key={stat.label} className="panel flex items-center justify-between p-4">
                  <span className="muted text-xs">{stat.label}</span>
                  <strong className="text-2xl tabular-nums">{stat.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[#263646] px-3 py-3">
              <h3 className="text-sm font-semibold">{text.timeline}</h3>
              <span className="rounded-full bg-[#35d07f18] px-2 py-1 text-[10px] text-[#66e99f]">{events.length}</span>
            </div>
            {events.length === 0 ? (
              <p className="muted px-4 py-6 text-sm">{text.empty}</p>
            ) : (
              <div className="scrollbar overflow-x-auto">
                <table className="min-w-[650px] w-full">
                  <thead>
                    <tr>
                      <th className="w-[76px]">{text.time}</th>
                      <th>{text.event}</th>
                      <th className="w-[130px]">{text.moment}</th>
                      <th className="w-[105px]">{text.zone}</th>
                      <th>{text.outcome}</th>
                      <th className="w-[52px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <button type="button" onClick={() => seekToEvent(event)} className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#7beaa8] hover:underline">
                            <Play size={11} />{formatTime(event.video_second)}
                          </button>
                        </td>
                        <td className="text-sm font-medium">{eventName(event, language)}</td>
                        <td className="text-xs">{event.moment === "attack" ? text.attack : text.defense}</td>
                        <td className="text-xs">{ZONE_LABELS[event.zone][language]}</td>
                        <td className="max-w-[280px] whitespace-normal text-xs text-[#c3ced8]">{event.outcome || "—"}</td>
                        <td>
                          <a
                            href={event.youtube_url || `https://www.youtube.com/watch?v=${videoId}&t=${event.video_second}s`}
                            target="_blank"
                            rel="noreferrer"
                            title={text.openVideo}
                            className="inline-flex text-[#8fc8ff] hover:text-white"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <footer className="muted mt-auto border-t border-[#263646] pt-4 text-center text-[10px]">{text.footer}</footer>
    </main>
  );
}
