"use client";

import { use, useEffect, useMemo, useState } from "react";
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

const ACTIONS: Record<string, { pt: string; details?: Record<string, string> }> = {
  goalkeeper_save: { pt: "Defesa", details: { posts: "Postes", area: "Área", outside: "Fora" } },
  goalkeeper_incomplete_save: { pt: "Defesa incompleta" },
  goalkeeper_goal_conceded: { pt: "Golo sofrido", details: { right: "Direita", left: "Esquerda", center: "Centro" } },
  goalkeeper_sweep_behind: { pt: "Saída atrás", details: { right: "Direita", left: "Esquerda", center: "Centro" } },
  goalkeeper_sweep_front: { pt: "Saída na frente", details: { right: "Direita", left: "Esquerda", center: "Centro" } },
  goalkeeper_ball_release: { pt: "Saída com bola", details: { right: "Direita", left: "Esquerda", center: "Centro" } },
  goalkeeper_footwork: { pt: "Jogo de pés" },
  field_pass: { pt: "Passe", details: { short: "Curto", long: "Longo" } },
  field_reception: { pt: "Receção" },
  field_ball_carry: { pt: "Condução de bola" },
  field_ball_loss: { pt: "Perda de bola" },
  field_shot: { pt: "Remate" },
  field_interception: { pt: "Corte" },
};

function actionLabel(category: string, detail: string | null): string {
  const action = ACTIONS[category];
  if (!action) return category;
  const detailLabel = detail ? action.details?.[detail] : undefined;
  return detailLabel ? action.pt + " (" + detailLabel + ")" : action.pt;
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

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(safe / 60).toString().padStart(2, "0") + ":" + (safe % 60).toString().padStart(2, "0");
}

export default function PublicPlayerAnalysisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = useMemo(() => getSupabase(), []);
  const [analysis, setAnalysis] = useState<PublicPlayerAnalysis | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const activeEvent = analysis?.events[activeIndex] ?? null;
  const activeVideoId = activeEvent ? parseYouTubeId(activeEvent.youtube_url) : null;

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
      const { data, error } = await supabase.rpc("get_public_player_analysis", { p_share_token: token });
      if (!alive) return;
      const result = data as PublicPlayerAnalysis | null;
      if (error || !result?.player || !Array.isArray(result.events)) {
        setInvalid(true);
      } else {
        setAnalysis(result);
        setActiveIndex(0);
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [supabase, token]);

  return (
    <main className="min-h-screen bg-[#070d13] px-3 py-6 text-[#e7eef5] sm:px-6">
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263646] pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#83e6a9]">SportAnalist</p>
            <h1 className="mt-1 text-lg font-semibold">{loading ? "A carregar análise individual…" : "Análise individual"}</h1>
          </div>
          <span className="rounded-full border border-[#315b47] bg-[#112820] px-3 py-1 text-[10px] font-semibold text-[#83e6a9]">Link público</span>
        </header>

        {loading ? (
          <div className="rounded-xl border border-[#263646] bg-[#0b131c] p-6 text-center text-sm text-[#9eb0c0]">A carregar os eventos do jogador…</div>
        ) : invalid || !analysis ? (
          <div className="rounded-xl border border-[#563b42] bg-[#20151a] p-6 text-center">
            <h2 className="text-base font-semibold text-[#f0b0b8]">Link inválido ou desativado</h2>
            <p className="mt-2 text-sm text-[#c7aeb3]">Este link já não está disponível ou não existe.</p>
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-[#263646] bg-[#0b131c] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9eb0c0]">Jogador</p>
                  <h2 className="mt-1 text-xl font-semibold">{analysis.player.shirt_number ? "N.º " + analysis.player.shirt_number + " · " : ""}{analysis.player.display_name}</h2>
                  <p className="mt-1 text-xs text-[#9eb0c0]">{analysis.player.role_key === "goalkeeper" ? "Guarda-Redes" : "Jogador de campo"} · {analysis.events.length} {analysis.events.length === 1 ? "momento registado" : "momentos registados"}</p>
                </div>
              </div>
            </section>

            {analysis.events.length === 0 ? (
              <div className="rounded-xl border border-[#263646] bg-[#0b131c] p-5 text-sm text-[#9eb0c0]">Ainda não existem momentos disponíveis para este jogador.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
                <section className="min-w-0">
                  <div className="overflow-hidden rounded-xl border border-[#263646] bg-black">
                    {activeVideoId ? (
                      <div className="aspect-video w-full">
                        <iframe
                          key={(activeEvent?.video_second ?? 0) + "-" + activeVideoId + "-" + activeIndex}
                          className="h-full w-full"
                          src={"https://www.youtube-nocookie.com/embed/" + activeVideoId + "?start=" + Math.max(0, Math.floor(activeEvent?.video_second ?? 0)) + "&rel=0&modestbranding=1"}
                          title="Vídeo do momento"
                          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-[#9eb0c0]">Vídeo indisponível para este momento.</div>
                    )}
                  </div>
                  {activeEvent && <p className="mt-2 text-xs text-[#9eb0c0]">Momento selecionado: <strong className="text-[#e7eef5]">{actionLabel(activeEvent.category_key, activeEvent.detail_key)}</strong> · {formatTime(activeEvent.video_second)}</p>}
                </section>

                <section className="min-w-0 rounded-xl border border-[#263646] bg-[#0b131c] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9eb0c0]">Eventos do jogador</h3>
                    <span className="rounded-full bg-[#35d07f18] px-2 py-0.5 text-[10px] text-[#83e6a9]">{analysis.events.length}</span>
                  </div>
                  <div className="grid max-h-[65vh] gap-1.5 overflow-y-auto pr-1">
                    {analysis.events.map((event, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={"flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition " + (activeIndex === index ? "border-[#35d07f80] bg-[#35d07f18]" : "border-[#263646] bg-[#101923] hover:border-[#5f819e]")}
                      >
                        <span className="shrink-0 font-mono text-[11px] font-semibold text-[#83e6a9]">{formatTime(event.video_second)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{actionLabel(event.category_key, event.detail_key)}</span>
                        <span className="shrink-0 text-[9px] text-[#9eb0c0]">{activeIndex === index ? "A ver" : "Ver"}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
        <footer className="border-t border-[#263646] pt-3 text-center text-[10px] text-[#718396]">Partilha pública limitada aos eventos individuais deste jogador.</footer>
      </div>
    </main>
  );
}
