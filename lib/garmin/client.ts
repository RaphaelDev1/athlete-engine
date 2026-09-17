// Authentification Garmin Connect (login SSO email/mot de passe) via la
// librairie non-officielle `garmin-connect`. Un nouveau login est effectué à
// chaque synchronisation (déclenchement manuel peu fréquent en V1) — pas de
// persistance de session.

import { GarminConnect } from "garmin-connect";
import { GARMIN_PASSWORD, GARMIN_USERNAME } from "./config";

export function isGarminConfigured(): boolean {
  return Boolean(GARMIN_USERNAME && GARMIN_PASSWORD);
}

export async function getGarminClient(): Promise<GarminConnect> {
  if (!isGarminConfigured()) {
    throw new Error(
      "GARMIN_USERNAME / GARMIN_PASSWORD manquants dans les variables d'environnement"
    );
  }

  const client = new GarminConnect({
    username: GARMIN_USERNAME,
    password: GARMIN_PASSWORD,
  });
  await client.login();
  return client;
}
