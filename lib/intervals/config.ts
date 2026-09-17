// Configuration de l'intégration Intervals.icu — API REST officielle,
// authentification Basic Auth avec une clé API personnelle (contrairement à
// Garmin, pas de login SSO — voir lib/intervals/client.ts).

export const INTERVALS_ICU_API_KEY = process.env.INTERVALS_ICU_API_KEY ?? "";
export const INTERVALS_ICU_ATHLETE_ID = process.env.INTERVALS_ICU_ATHLETE_ID ?? "";

export const INTERVALS_ICU_API_BASE = "https://intervals.icu/api/v1";

export function isIntervalsConfigured(): boolean {
  return Boolean(INTERVALS_ICU_API_KEY && INTERVALS_ICU_ATHLETE_ID);
}
