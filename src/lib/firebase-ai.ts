import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import type { Zone } from "@/lib/types";

export type DetectedGoal = {
  second: number;
  scoringSide: "analysed" | "opponent" | "uncertain";
  playerName: string | null;
  playerNumber: string | null;
  confidence: number;
  evidence: string;
  zone: Zone;
};

type AnalyzeYouTubeGoalsInput = {
  youtubeUrl: string;
  analyzedTeam: string;
  opponent: string;
  analyzedTeamKit: string;
  opponentKit: string;
};

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;

let appCheckInitialized = false;

export function isFirebaseAIConfigured(): boolean {
  return Boolean(FIREBASE_API_KEY && FIREBASE_APP_ID && FIREBASE_PROJECT_ID && APP_CHECK_SITE_KEY);
}

function createGenerativeModel() {
  if (!isFirebaseAIConfigured()) {
    throw new Error("Firebase AI Logic is not configured. Add the Firebase web app settings and the reCAPTCHA v3 App Check site key to the environment variables.");
  }
  if (typeof window === "undefined") {
    throw new Error("Video analysis can only run in the browser.");
  }
  if (!APP_CHECK_SITE_KEY) {
    throw new Error("A reCAPTCHA v3 App Check site key is required.");
  }

  const config: FirebaseOptions = {
    apiKey: FIREBASE_API_KEY,
    appId: FIREBASE_APP_ID,
    projectId: FIREBASE_PROJECT_ID,
  };
  const app = getApps().length ? getApp() : initializeApp(config);

  // Firebase AI Logic should be protected by App Check. The site key is required
  // by isFirebaseAIConfigured() so the UI cannot submit videos without this setup.
  if (!appCheckInitialized) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("already initialized")) throw error;
    }
    appCheckInitialized = true;
  }

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: "gemini-3.5-flash-lite",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGoals(raw: string): DetectedGoal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("O modelo devolveu uma resposta que não foi possível interpretar. Repete a análise.");
    }
    try {
      parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new Error("O modelo devolveu uma resposta que não foi possível interpretar. Repete a análise.");
    }
  }

  if (!isObject(parsed) || !Array.isArray(parsed.goals)) {
    throw new Error("A resposta da IA não contém uma lista de golos válida.");
  }

  const seen = new Set<number>();
  const goals: DetectedGoal[] = [];
  for (const item of parsed.goals) {
    if (!isObject(item)) continue;
    if (typeof item.timestamp_seconds !== "number") continue;
    const second = item.timestamp_seconds;
    if (!Number.isFinite(second) || second < 0) continue;
    const roundedSecond = Math.max(0, Math.round(second));
    if (seen.has(roundedSecond)) continue;
    seen.add(roundedSecond);

    const scoringSide = item.scoring_team === "analysed" || item.scoring_team === "opponent"
      ? item.scoring_team
      : "uncertain";
    const rawZone = item.zone;
    const zone: Zone = rawZone === "left" || rawZone === "right" ? rawZone : "center";
    const confidence = Number(item.confidence);
    goals.push({
      second: roundedSecond,
      scoringSide,
      playerName: typeof item.player_name === "string" && item.player_name.trim() ? item.player_name.trim() : null,
      playerNumber: typeof item.player_number === "string" || typeof item.player_number === "number"
        ? String(item.player_number)
        : null,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
      evidence: typeof item.evidence === "string" ? item.evidence.trim().slice(0, 500) : "",
      zone,
    });
  }

  return goals.sort((a, b) => a.second - b.second);
}

/**
 * Analyze an unlisted YouTube match directly through Firebase AI Logic.
 * The video itself is not downloaded by SportAnalist or routed through Vercel.
 */
export async function analyzeYouTubeGoals(input: AnalyzeYouTubeGoalsInput): Promise<DetectedGoal[]> {
  const model = createGenerativeModel();
  const prompt = [
    "Analisa o vídeo completo de um jogo de futsal e identifica APENAS golos realmente marcados.",
    "",
    "Contexto das equipas:",
    "- Equipa analisada: \"" + input.analyzedTeam + "\" — equipamento: \"" + input.analyzedTeamKit + "\".",
    "- Adversário: \"" + input.opponent + "\" — equipamento: \"" + input.opponentKit + "\".",
    "",
    "Critérios:",
    "1. Considera golo apenas quando há evidência visual de a bola ultrapassar a linha de baliza ou uma confirmação inequívoca no próprio vídeo (por exemplo, marcador/placar que muda).",
    "2. Uma explosão de aplausos, gritos, festejos, remate perigoso, defesa ou bola na trave, isoladamente, NÃO prova um golo.",
    "3. Usa em conjunto a imagem e o áudio. Procura também mudanças no marcador ou legendas que identifiquem o marcador e o número da camisola.",
    "4. Distingue a equipa que marcou pelas cores dos equipamentos indicadas acima. Se não for possível determinar, usa \"uncertain\"; não inventes.",
    "5. Indica o segundo do vídeo mais próximo do momento em que a bola entra na baliza, não o início da repetição nem o momento em que aparece a legenda. Como a amostragem de vídeo pode não apanhar o instante exato, usa o melhor segundo estimado.",
    "6. Só indica nome/número do marcador quando forem legíveis. Caso contrário, usa null.",
    "7. Devolve confiança entre 0 e 1 e uma explicação curta baseada em evidência observada. Não inventes eventos para preencher a resposta.",
    "8. Zona: indica \"left\", \"center\" ou \"right\" apenas como melhor estimativa da zona de origem da ação; se não for possível, usa \"center\".",
    "",
    "Responde APENAS com JSON válido, sem Markdown, no formato:",
    "{\"goals\":[{\"timestamp_seconds\":37,\"scoring_team\":\"analysed\",\"player_name\":null,\"player_number\":\"5\",\"confidence\":0.92,\"zone\":\"center\",\"evidence\":\"Descrição concisa dos sinais visuais e sonoros.\"}]}",
    "Se não houver golos confirmáveis, devolve {\"goals\":[]}."
  ].join("\n");

  const result = await model.generateContent([
    {
      type: "fileData",
      fileData: {
        fileUri: input.youtubeUrl,
        mimeType: "video/mp4",
      },
    },
    prompt,
  ]);
  const responseText = result.response.text();
  if (!responseText.trim()) {
    throw new Error("O modelo não devolveu resultados. Tenta novamente.");
  }
  return parseGoals(responseText);
}
