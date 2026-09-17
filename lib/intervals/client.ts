// Client HTTP minimal pour l'API Intervals.icu — Basic Auth avec la chaîne
// littérale "API_KEY" comme login et la clé personnelle comme mot de passe
// (schéma documenté par Intervals.icu, cf. https://intervals.icu/api-docs.html).

import {
  INTERVALS_ICU_API_BASE,
  INTERVALS_ICU_API_KEY,
  INTERVALS_ICU_ATHLETE_ID,
  isIntervalsConfigured,
} from "./config";

function authHeader(): string {
  const token = Buffer.from(`API_KEY:${INTERVALS_ICU_API_KEY}`).toString("base64");
  return `Basic ${token}`;
}

export async function intervalsGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  if (!isIntervalsConfigured()) {
    throw new Error(
      "INTERVALS_ICU_API_KEY / INTERVALS_ICU_ATHLETE_ID manquants dans les variables d'environnement"
    );
  }

  const url = new URL(`${INTERVALS_ICU_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Intervals.icu ${res.status} sur ${path} : ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export function currentAthleteId(): string {
  return INTERVALS_ICU_ATHLETE_ID;
}
