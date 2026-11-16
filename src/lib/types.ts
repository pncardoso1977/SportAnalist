export type AppRole = "admin" | "analyst" | "configurator" | "viewer";
export type Zone = "left" | "center" | "right";

export type EventType = {
  id: string;
  name_pt: string;
  name_en: string;
  is_counter: boolean;
  active: boolean;
  sort_order: number;
};

export type MatchEvent = {
  id: string;
  match_id: string;
  event_type_id: string;
  event_name_pt: string;
  event_name_en: string;
  video_second: number;
  zone: Zone;
  attacking_team: string | null;
  defending_team: string | null;
  created_by: string | null;
  created_at: string;
  youtube_url: string;
};

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  analyzed_team: string;
  youtube_url: string;
  created_at: string;
};

export const DEFAULT_EVENT_TYPES: EventType[] = [
  { id: "kick-in", name_pt: "Lateral", name_en: "Kick-in", is_counter: false, active: true, sort_order: 10 },
  { id: "kick-in-against", name_pt: "Lateral Contra", name_en: "Opposition kick-in", is_counter: true, active: true, sort_order: 20 },
  { id: "corner", name_pt: "Canto", name_en: "Corner", is_counter: false, active: true, sort_order: 30 },
  { id: "corner-against", name_pt: "Canto Contra", name_en: "Opposition corner", is_counter: true, active: true, sort_order: 40 },
  { id: "free-kick", name_pt: "Livre", name_en: "Free kick", is_counter: false, active: true, sort_order: 50 },
  { id: "free-kick-against", name_pt: "Livre Contra", name_en: "Opposition free kick", is_counter: true, active: true, sort_order: 60 },
  { id: "kick-off", name_pt: "Saída de bola", name_en: "Kick-off", is_counter: false, active: true, sort_order: 70 },
  { id: "attack", name_pt: "Ataque", name_en: "Attack", is_counter: false, active: true, sort_order: 80 },
  { id: "attack-against", name_pt: "Ataque Contra", name_en: "Opposition attack", is_counter: true, active: true, sort_order: 90 },
];

export const ZONE_LABELS: Record<Zone, { pt: string; en: string }> = {
  left: { pt: "Esquerda", en: "Left" },
  center: { pt: "Central", en: "Center" },
  right: { pt: "Direita", en: "Right" },
};