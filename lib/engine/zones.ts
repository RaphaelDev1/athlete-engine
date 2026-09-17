// Calcul des zones d'entraînement :
// - Fréquence cardiaque via la méthode de Karvonen (% de la réserve cardiaque)
// - Allures course via la méthode Daniels/VDOT
// - Puissance vélo en % de la FTP (zones Coggan)

import { AthleteZones, HRZone, PaceZone, PaceZoneKey, PowerZone } from "./types";

// ─── Fréquence cardiaque (Karvonen) ──────────────────────────────────────────

const HR_ZONE_DEFS = [
  {
    zone: 1,
    name: "Récupération",
    minPct: 0.5,
    maxPct: 0.6,
    description: "Récupération active, très facile",
  },
  {
    zone: 2,
    name: "Endurance fondamentale",
    minPct: 0.6,
    maxPct: 0.7,
    description: "Endurance de base, conversation aisée",
  },
  {
    zone: 3,
    name: "Tempo",
    minPct: 0.7,
    maxPct: 0.8,
    description: "Allure modérée, effort soutenu",
  },
  {
    zone: 4,
    name: "Seuil",
    minPct: 0.8,
    maxPct: 0.9,
    description: "Seuil lactique, effort difficile",
  },
  {
    zone: 5,
    name: "VO2max / Anaérobie",
    minPct: 0.9,
    maxPct: 1.0,
    description: "Effort maximal, courtes durées",
  },
] as const;

/**
 * Zones de fréquence cardiaque via la formule de Karvonen :
 * FC cible = FC repos + (FC max - FC repos) × %intensité
 */
export function computeHRZones(restingHR: number, maxHR: number): HRZone[] {
  const hrr = maxHR - restingHR;
  return HR_ZONE_DEFS.map((z) => ({
    zone: z.zone,
    name: z.name,
    minHR: Math.round(restingHR + hrr * z.minPct),
    maxHR: Math.round(restingHR + hrr * z.maxPct),
    minPct: Math.round(z.minPct * 100),
    maxPct: Math.round(z.maxPct * 100),
    description: z.description,
  }));
}

// ─── Allures course (Daniels / VDOT) ─────────────────────────────────────────
//
// Références : Jack Daniels' Running Formula.
// VO2 (ml/kg/min) = -4.60 + 0.182258 × v + 0.000104 × v²   (v en m/min)
// %VO2max atteint sur une durée t (min) = 0.8 + 0.1894393 × e^(-0.012778t)
//                                              + 0.2989558 × e^(-0.1932605t)
// VDOT = VO2 / %VO2max

function vo2FromVelocity(vMetersPerMin: number): number {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
}

function percentVO2Max(tMinutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMinutes) +
    0.2989558 * Math.exp(-0.1932605 * tMinutes)
  );
}

function velocityFromVO2(vo2: number): number {
  // Résolution de 0.000104·v² + 0.182258·v - (vo2 + 4.6) = 0
  const a = 0.000104;
  const b = 0.182258;
  const c = -(vo2 + 4.6);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function paceSecPerKmFromVelocity(vMetersPerMin: number): number {
  return (1000 / vMetersPerMin) * 60;
}

/** VDOT à partir d'une performance course (distance en m, temps en s). */
export function calculateVDOTFromRace(
  distanceMeters: number,
  timeSeconds: number
): number {
  const velocity = distanceMeters / (timeSeconds / 60); // m/min
  const vo2 = vo2FromVelocity(velocity);
  const pct = percentVO2Max(timeSeconds / 60);
  return vo2 / pct;
}

/** VDOT approximatif à partir d'une allure seuil connue (sec/km), seuil ≈ 88% VO2max. */
export function estimateVDOTFromThresholdPace(
  thresholdPaceSecPerKm: number
): number {
  const velocity = (1000 / thresholdPaceSecPerKm) * 60; // m/min
  const vo2 = vo2FromVelocity(velocity);
  return vo2 / 0.88;
}

const PACE_ZONE_DEFS: {
  key: PaceZoneKey;
  name: string;
  code: string;
  minPct: number;
  maxPct: number;
  description: string;
}[] = [
  {
    key: "EASY",
    name: "Endurance",
    code: "E",
    minPct: 0.59,
    maxPct: 0.74,
    description: "Footing facile, construction aérobie",
  },
  {
    key: "MARATHON",
    name: "Marathon",
    code: "M",
    minPct: 0.75,
    maxPct: 0.84,
    description: "Allure marathon, soutenable longtemps",
  },
  {
    key: "THRESHOLD",
    name: "Seuil",
    code: "T",
    minPct: 0.83,
    maxPct: 0.88,
    description: "Tempo/seuil lactique, effort « confortablement dur »",
  },
  {
    key: "INTERVAL",
    name: "Intervalles",
    code: "I",
    minPct: 0.95,
    maxPct: 1.0,
    description: "VO2max, répétitions de 3-5 min",
  },
  {
    key: "REPETITION",
    name: "Répétitions",
    code: "R",
    minPct: 1.05,
    maxPct: 1.2,
    description: "Vitesse/économie de course, répétitions courtes",
  },
];

/** Zones d'allure course construites à partir du VDOT. */
export function computePaceZones(vdot: number): PaceZone[] {
  return PACE_ZONE_DEFS.map((z) => {
    // % le plus haut => vitesse la plus rapide => allure (sec/km) la plus basse
    const vFast = velocityFromVO2(vdot * z.maxPct);
    const vSlow = velocityFromVO2(vdot * z.minPct);
    return {
      key: z.key,
      name: z.name,
      code: z.code,
      minPaceSecPerKm: Math.round(paceSecPerKmFromVelocity(vFast)),
      maxPaceSecPerKm: Math.round(paceSecPerKmFromVelocity(vSlow)),
      description: z.description,
    };
  });
}

export function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

// ─── Puissance vélo (% FTP, zones Coggan) ────────────────────────────────────

const POWER_ZONE_DEFS = [
  {
    zone: 1,
    name: "Récupération active",
    minPct: 0,
    maxPct: 0.55,
    description: "Récupération, très facile",
  },
  {
    zone: 2,
    name: "Endurance",
    minPct: 0.55,
    maxPct: 0.75,
    description: "Endurance de base",
  },
  {
    zone: 3,
    name: "Tempo",
    minPct: 0.75,
    maxPct: 0.9,
    description: "Tempo, effort soutenu",
  },
  {
    zone: 4,
    name: "Seuil",
    minPct: 0.9,
    maxPct: 1.05,
    description: "Seuil fonctionnel (FTP)",
  },
  {
    zone: 5,
    name: "VO2max",
    minPct: 1.05,
    maxPct: 1.2,
    description: "VO2max, 3-8 min",
  },
  {
    zone: 6,
    name: "Anaérobie",
    minPct: 1.2,
    maxPct: 1.5,
    description: "Capacité anaérobie, <2 min",
  },
  {
    zone: 7,
    name: "Neuromusculaire",
    minPct: 1.5,
    maxPct: null,
    description: "Sprint, puissance neuromusculaire",
  },
] as const;

/** Zones de puissance en % de la FTP (modèle Coggan à 7 zones). */
export function computePowerZones(ftp: number): PowerZone[] {
  return POWER_ZONE_DEFS.map((z) => ({
    zone: z.zone,
    name: z.name,
    minWatts: Math.round(ftp * z.minPct),
    maxWatts: z.maxPct !== null ? Math.round(ftp * z.maxPct) : null,
    minPct: Math.round(z.minPct * 100),
    maxPct: z.maxPct !== null ? Math.round(z.maxPct * 100) : null,
    description: z.description,
  }));
}

// ─── Agrégateur ──────────────────────────────────────────────────────────────

export interface ZoneProfileInput {
  restingHR: number | null;
  maxHR: number | null;
  vo2max: number | null;
  thresholdPace: number | null; // sec/km
  ftp: number | null;
}

/** Calcule toutes les zones disponibles à partir des données du profil athlète. */
export function computeAthleteZones(input: ZoneProfileInput): AthleteZones {
  const hr =
    input.restingHR !== null && input.maxHR !== null
      ? computeHRZones(input.restingHR, input.maxHR)
      : null;

  let vdot: number | null = null;
  if (input.vo2max !== null) {
    vdot = input.vo2max;
  } else if (input.thresholdPace !== null) {
    vdot = estimateVDOTFromThresholdPace(input.thresholdPace);
  }
  const pace = vdot !== null ? computePaceZones(vdot) : null;

  const power = input.ftp !== null ? computePowerZones(input.ftp) : null;

  return { hr, pace, power, vdot };
}
