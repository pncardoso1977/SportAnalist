"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type SummaryClip = { video_second: number; youtube_url: string };
type PublicSummary = { clip_duration_seconds: number; clips: SummaryClip[] };
type SummaryPlayer = {
  getCurrentTime: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};
type YouTubeApi = {
  Player: new (elementId: string, options: {
    videoId: string;
    playerVars: Record<string, number>;
    events: { onReady: () => void };
  }) => SummaryPlayer;
};
type PlayerWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };

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

export default function PublicSummaryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => getSupabase(), []);
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTransition, setShowTransition] = useState(false);
  const [finished, setFinished] = useState(false);
  const playerRef = useRef<SummaryPlayer | null>(null);
  const clipTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);
  const active = summary?.clips[currentIndex] ?? null;
  const activeVideoId = active ? parseYouTubeId(active.youtube_url) : null;

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setInvalid(false);
      if (!supabase) {
        setInvalid(true);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_public_match_summary", { p_share_token: token });
      if (!alive) return;
      const result = data as PublicSummary | null;
      if (error || !result || !Array.isArray(result.clips) || result.clips.length === 0) {
        setInvalid(true);
      } else {
        setSummary(result);
        setCurrentIndex(0);
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [supabase, token]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!started || !active || !activeVideoId) return;
    const win = window as PlayerWindow;
    let cancelled = false;

    const clearClipTimer = () => {
      if (clipTimerRef.current !== null) window.clearInterval(clipTimerRef.current);
      clipTimerRef.current = null;
    };

    const initialize = () => {
      if (cancelled || !win.YT?.Player) return;
      playerRef.current?.destroy();
      playerRef.current = new win.YT.Player("sportanalist-public-summary-player", {
        videoId: activeVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current?.seekTo(active.video_second, true);
            playerRef.current?.playVideo();
            clearClipTimer();
            clipTimerRef.current = window.setInterval(() => {
              if (cancelled || currentIndexRef.current !== currentIndex) return;
              const second = playerRef.current?.getCurrentTime();
              const state = playerRef.current?.getPlayerState();
              const endSecond = active.video_second + summary.clip_duration_seconds;
              if ((typeof second === "number" && second >= endSecond) || state === 0) {
                clearClipTimer();
                playerRef.current?.pauseVideo();
                if (currentIndex + 1 < summary.clips.length) {
                  setShowTransition(true);
                  transitionTimerRef.current = window.setTimeout(() => {
                    setShowTransition(false);
                    setCurrentIndex(currentIndex + 1);
                  }, 1100);
                } else {
                  setFinished(true);
                }
              }
            }, 200);
          },
        },
      });
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    if (win.YT?.Player) initialize();
    else {
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        previous?.();
        initialize();
      };
    }

    return () => {
      cancelled = true;
      clearClipTimer();
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [started, currentIndex, activeVideoId, active, summary]);

  function startOrReplay() {
    if (!summary || !summary.clips.length) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    setFinished(false);
    setShowTransition(false);
    setCurrentIndex(0);
    setStarted(false);
    window.setTimeout(() => setStarted(true), 0);
  }

  if (loading) {
    return <main className="fixed inset-0 flex items-center justify-center bg-black" aria-label="A carregar resumo" />;
  }

  if (invalid || !summary || !activeVideoId) {
    return <main className="fixed inset-0 flex items-center justify-center bg-black px-6 text-center text-sm text-[#aab7c4]">Este link de resumo não é válido ou foi desativado.</main>;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0">
        <div id="sportanalist-public-summary-player" className="h-full w-full" />
      </div>

      {!started && !finished && (
        <button type="button" onClick={() => setStarted(true)} className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 text-sm font-semibold tracking-[.18em] text-white transition hover:bg-black/65">
          REPRODUZIR RESUMO
        </button>
      )}

      {showTransition && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[.28em] text-[#77e6a4]">SPORTANALIST</p>
          <div className="my-5 h-px w-28 bg-[#42634f]" />
          <h1 className="text-2xl font-bold tracking-[.16em] text-white">RESUMO DO JOGO</h1>
          <div className="mt-5 h-px w-28 bg-[#42634f]" />
        </div>
      )}

      {finished && (
        <button type="button" onClick={startOrReplay} className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 text-sm font-semibold tracking-[.18em] text-white transition hover:bg-black/70">
          REPRODUZIR NOVAMENTE
        </button>
      )}
    </main>
  );
}
