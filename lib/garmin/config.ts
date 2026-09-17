// Configuration de l'intégration Garmin — accès non-officiel via login
// Garmin Connect (email/mot de passe), le programme "Connect Developer"
// officiel étant réservé aux partenaires B2B sous accord signé.

export const GARMIN_USERNAME = process.env.GARMIN_USERNAME ?? "";
export const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD ?? "";

// Base des endpoints internes de Garmin Connect (non documentés), utilisée
// pour les appels bruts via client.get() sur les données non couvertes par
// la librairie garmin-connect (HRV, Body Battery, stress, training
// readiness/status, VO2max) — voir lib/garmin/pull.ts.
export const GARMIN_CONNECT_API_BASE = "https://connectapi.garmin.com";

// Utilisateur unique de l'app (V1 mono-utilisateur) — voir lib/garmin/user.ts
export const DEFAULT_USER_EMAIL = "raphaeljeandon6@gmail.com";
