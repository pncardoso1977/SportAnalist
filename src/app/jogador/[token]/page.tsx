"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Play, ShieldAlert, Video } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

type PublicPlayerEvent = {
  video_second: number;
  youtube_url: string;
  category_key: string;
  detail_key: string | null;
};
type PublicPlayerAnalysis = {
  player: {
    display_name: string;
    shirt_number: string | null;
    role_key: "goalkeeper" | "field";
  };
  events: PublicPlayerEvent[];
};

const ACTIONS: Record<string, {
  pt: string;
  en: string;
  details?: Record<string, { pt: string; en: string }>;
}> = {
  goalkeeper_save: { pt: "Defesa", en: "Save", details: {
    posts: { pt: "Postes", en: "Posts" }, area: { pt: "Área", en: "Area" }, outside: { pt: "Fora", en: "Outside" },
  } },
  goalkeeper_incomplete_save: { pt: "Defesa incompleta", en: "Incomplete save" },
  goalkeeper_goal_conceded: { pt: "Golo sofrido", en: "Goal conceded", details: {
    right: { pt: "Direita", en: "Right" }, left: { pt: "Esquerda", en: "Left" }, center: { pt: "Centro", en: "Center" },
  } },
  goalkeeper_sweep_behind: { pt: "Saída atrás", en: "Sweep behind", details: {
    right: { pt: "Direita", en: "Right" }, left: { pt: "Esquerda", en: "Left" }, center: { pt: "Centro", en: "Center" },
  } },
  goalkeeper_sweep_front: { pt: "Saída na frente", en: "Front exit", details: {
    right: { pt: "Direita", en: "Right" }, left: { pt: "Esquerda", en: "Left" }, center: { pt: "Centro", en: "Center" },
  } },
  goalkeeper_ball_release: { pt: "Saída com bola", en: "Ball distribution", details: {
    right: { pt: "Direita", en: "Right" }, left: { pt: "Esquerda", en: "Left" }, center: { pt: "Centro", en: "Center" },
  } },
  goalkeeper_footwork: { pt: "Jogo de pés", en: "Footwork" },
  field_pass: { pt: "Passe", en: "Pass", details: {
    short: { pt: "Curto", en: "Short" }, long: { pt: "Longo", en: "Long" },
  } },
  field_reception: { pt: "Receção", en: "Reception" },
  field_ball_carry: { pt: "Condução de bola", en: "Ball carry" },
  field_ball_loss: { pt: "Perda de bola", en: "Possession lost" },
  field_shot: { pt: "Remate", en: "Shot" },
  field_interception: { pt: "Corte", en: "Interception" },
};

function actionLabel(category: string, detail: string | null, language: "pt" | "en"): string {
  const action = ACTIONS[category];
  if (!action) return category;
  const detailLabel = detail ? action.details?.[detail] : undefined;
  return (language === "pt" ? action.pt : action.en)
    + (detailLabel ? " (" + (language === "pt" ? detailLabel.pt : detailLabel.en) + ")" : "");
}

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
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

export default function PublicPlayerAnalysisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => getSupabase(), []);
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [analysis, setAnalysis] = useState<PublicPlayerAnalysis | null>(null);
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
      const { data, error } = await supabase.rpc("get_public_player_analysis", { p_share_token: token });
      if (!active) return;
      if (error || !data || !data.player) {
        setLoadError(language === "pt"
          ? "Este link não é válido ou a partilha foi desativada pelo editor."
          : "This link is invalid or sharing has been disabled by the editor.");
      } else {
        const result = data as PublicPlayerAnalysis;
        setAnalysis(result);
        setSelectedVideoUrl(result.events?.[0]?.youtube_url ?? "");
        setSelectedSecond(result.events?.[0]?.video_second ?? 0);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, token, language]);

  const events = analysis?.events ?? [];
  const videoOptions = useMemo(() => {
    const seen = new Set<string>();
    return events.reduce<string[]>((items, event) => {
      const id = parseYouTubeId(event.youtube_url);
      if (id && !seen.has(id)) {
        seen.add(id);
        items.push(event.youtube_url);
      }
      return items;
    }, []);
  }, [events]);
  const activeVideoUrl = selectedVideoUrl || videoOptions[0] || "";
  const videoId = parseYouTubeId(activeVideoUrl);
  const actionTypes = new Set(events.map((event) => event.category_key)).size;
  const embedUrl = videoId
    ? "https://www.youtube-nocookie.com/embed/" + videoId
      + "?rel=0&modestbranding=1&playsinline=1&start=" + selectedSecond
      + (playerVersion > 0 ? "&autoplay=1" : "")
    : "";

  function selectPublicVideo(url: string) {
    setSelectedVideoUrl(url);
    setSelectedSecond(0);
    setPlayerVersion((current) => current + 1);
  }

  function seekToEvent(event: PublicPlayerEvent) {
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
        player: "Jogador",
        goalkeeper: "Guarda-Redes",
        field: "Jogador de campo",
        video: "Vídeo do jogador",
        timeline: "Eventos registados",
        empty: "Este jogador ainda não tem eventos registados.",
        total: "Total",
        actions: "Ações diferentes",
        videos: "Vídeos",
        noVideo: "O vídeo não está disponível para incorporação. Podes abri-lo diretamente no YouTube.",
        openVideo: "Abrir vídeo",
        invalid: "Análise indisponível",
        loading: "A carregar análise…",
        footer: "Visualização pública · SportAnalist",
        playMoment: "Reproduzir este momento",
      }
    : {
        subtitle: "FUTSAL TECHNICAL & TACTICAL ANALYSIS",
        shared: "Shared analysis",
        player: "Player",
        goalkeeper: "Goalkeeper",
        field: "Outfield player",
        video: "Player video",
        timeline: "Recorded events",
        empty: "No events have been recorded for this player yet.",
        total: "Total",
        actions: "Different actions",
        videos: "Videos",
        noVideo: "The video cannot be embedded. You can open it directly on YouTube.",
        openVideo: "Open video",
        invalid: "Analysis unavailable",
        loading: "Loading analysis…",
        footer: "Public view · SportAnalist",
        playMoment: "Play this moment",
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
                {analysis.player.shirt_number ? "N.º " + analysis.player.shirt_number + " · " : ""}
                {analysis.player.display_name}
              </h2>
              <p className="muted mt-1 text-xs">
                {text.player}: {analysis.player.role_key === "goalkeeper" ? text.goalkeeper : text.field}
              </p>
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
              {videoOptions.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[#263646] px-2.5 py-2">
                  {videoOptions.map((video, index) => (
                    <button key={parseYouTubeId(video) ?? video} type="button"
                      onClick={() => selectPublicVideo(video)}
                      className={\`rounded-md border px-2 py-1 text-[10px] \${parseYouTubeId(activeVideoUrl) === parseYouTubeId(video) ? "border-[#35d07f80] bg-[#35d07f18] text-[#83e6a9]" : "border-[#31475a] text-[#b8c7d3]"}\`}>
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
                  { label: text.actions, value: actionTypes },
                  { label: text.videos, value: videoOptions.length },
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
                  {events.map((event, index) => (
                    <article key={index} className="border-b border-[#263646] px-2.5 py-2 last:border-b-0 hover:bg-white/[0.025]">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => seekToEvent(event)}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#7beaa8] hover:underline"
                          title={text.playMoment}
                        >
                          <Play size={10} />{formatTime(event.video_second)}
                        </button>
                        <a
                          href={event.youtube_url || \`https://www.youtube.com/watch?v=\${videoId}&t=\${event.video_second}s\`}
                          target="_blank"
                          rel="noreferrer"
                          title={text.openVideo}
                          className="inline-flex text-[#8fc8ff] hover:text-white"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="mt-1 break-words text-xs font-semibold">
                        {actionLabel(event.category_key, event.detail_key, language)}
                      </p>
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
