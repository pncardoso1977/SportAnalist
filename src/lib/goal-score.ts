import type { EventMoment } from "@/lib/types";

export type GoalScoreEvent = {
  id: string;
  event_name_pt: string;
  event_name_en: string;
  moment: EventMoment;
  video_second: number;
  created_at: string;
  event_type_id?: string;
};

export type GoalScoreAtEvent = {
  analysed: number;
  opponent: number;
  scoringMoment: EventMoment;
};

function isGoalEvent(event: GoalScoreEvent): boolean {
  if (event.event_type_id === "goal") return true;

  const portugueseName = event.event_name_pt
    .trim()
    .replace(/\s+contra$/i, "")
    .toLocaleLowerCase("pt-PT");
  const englishName = event.event_name_en
    .trim()
    .replace(/^opposition\s+/i, "")
    .toLocaleLowerCase("en");

  return portugueseName === "golo" || englishName === "goal";
}

/**
 * Returns the cumulative score immediately after each goal, calculated in
 * video order rather than insertion order. This makes later edits/deletions
 * and goals entered out of order produce a consistent match score.
 */
export function calculateGoalScores(
  events: readonly GoalScoreEvent[],
): Map<string, GoalScoreAtEvent> {
  const chronological = [...events].sort((a, b) =>
    a.video_second - b.video_second ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
    a.id.localeCompare(b.id)
  );

  const scores = new Map<string, GoalScoreAtEvent>();
  let analysed = 0;
  let opponent = 0;

  for (const event of chronological) {
    if (!isGoalEvent(event)) continue;

    if (event.moment === "attack") analysed += 1;
    else opponent += 1;

    scores.set(event.id, {
      analysed,
      opponent,
      scoringMoment: event.moment,
    });
  }

  return scores;
}

export function formatGoalScore(score: GoalScoreAtEvent, analysedTeamIsHome = true): string {
  const homeScore = analysedTeamIsHome ? score.analysed : score.opponent;
  const awayScore = analysedTeamIsHome ? score.opponent : score.analysed;
  const scoringTeamIsHome = score.scoringMoment === "attack"
    ? analysedTeamIsHome
    : !analysedTeamIsHome;

  return scoringTeamIsHome
    ? `(${homeScore}) - ${awayScore}`
    : `${homeScore} - (${awayScore})`;
}
