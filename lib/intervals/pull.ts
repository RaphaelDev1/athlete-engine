// Récupération des activités Intervals.icu sur une fenêtre de dates.

import { intervalsGet, currentAthleteId } from "./client";
import { IntervalsRawActivity, normalizeActivity, NormalizedActivity } from "./mapping";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchActivities(oldest: Date, newest: Date): Promise<NormalizedActivity[]> {
  const raw = await intervalsGet<IntervalsRawActivity[]>(
    `/athlete/${currentAthleteId()}/activities`,
    { oldest: toDateString(oldest), newest: toDateString(newest) }
  );

  return raw.map(normalizeActivity);
}
