// Prédictions de performance pour le Dashboard : temps 5km course (VDOT
// Daniels, cf. zones.ts), 750m natation (Critical Swim Speed), 20km vélo
// (modèle physique flat-road à partir de la FTP), et projection des PR
// potentiels en musculation (régression linéaire sur l'historique de PR).
//
// Toutes les fonctions retournent `null` quand les données du profil ne
// permettent pas de calculer une estimation fiable — le Dashboard doit
// afficher une invite à compléter le profil plutôt qu'un chiffre inventé.

import { calculateVDOTFromRace } from "./zones";

// ─── Course à pied : 5km à partir du VDOT ────────────────────────────────────

/**
 * Temps (secondes) pour parcourir `distanceMeters` à l'effort maximal
 * correspondant à un VDOT donné — inverse de calculateVDOTFromRace() par
 * dichotomie (la relation temps -> VDOT à distance fixe est monotone
 * décroissante sur la plage de vitesses humaines plausibles).
 */
export function predictRaceTimeFromVDOT(vdot: number, distanceMeters: number): number {
  let low = distanceMeters / 8; // ~2:05/km, élite
  let high = distanceMeters / 1.5; // ~11:07/km, jogging très facile
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const impliedVdot = calculateVDOTFromRace(distanceMeters, mid);
    if (impliedVdot > vdot) {
      low = mid; // ce temps demanderait plus de VO2max que l'athlète n'en a -> plus lent
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function predict5kFromVdot(vdot: number | null): number | null {
  if (vdot === null) return null;
  return Math.round(predictRaceTimeFromVDOT(vdot, 5000));
}

// ─── Natation : 750m via Critical Swim Speed ─────────────────────────────────
//
// CSS (modèle à deux points, Dekerle et al.) : à partir de deux performances à
// distances différentes (ici 100m et 400m), la vitesse "critique" (soutenable
// longtemps) est la pente de la droite temps/distance ; l'ordonnée à l'origine
// capture la réserve anaérobie (départ, virages). Avec un seul point connu, on
// retombe sur une extrapolation plus grossière (mise à l'échelle linéaire ou
// exposant de fatigue type Riegel adapté à la natation).
const SWIM_RIEGEL_EXPONENT = 1.02; // la natation fatigue moins vite que la course sur la distance

export function predictSwim750m(
  swimPace100mSec: number | null,
  pr400mSec: number | null
): number | null {
  if (swimPace100mSec !== null && pr400mSec !== null) {
    const css = (pr400mSec - swimPace100mSec) / (400 - 100); // sec/m
    const intercept = swimPace100mSec - css * 100;
    const predicted = css * 750 + intercept;
    return predicted > 0 ? Math.round(predicted) : null;
  }
  if (swimPace100mSec !== null) {
    return Math.round(swimPace100mSec * 7.5);
  }
  if (pr400mSec !== null) {
    return Math.round(pr400mSec * Math.pow(750 / 400, SWIM_RIEGEL_EXPONENT));
  }
  return null;
}

// ─── Vélo : 20km à partir de la FTP ──────────────────────────────────────────
//
// Modèle physique route plate, sans vent : puissance = traînée aéro (0.5 ×
// rho × CdA × v³) + résistance au roulement (Crr × masse × g × v). On résout
// v par Newton-Raphson pour une puissance soutenable ~90% FTP (effort d'~30-
// 40 min, cohérent avec un contre-la-montre de 20km pour un cycliste amateur).
// CdA/Crr sont des valeurs par défaut route/cocottes — pas de PR vélo distance
// dans le modèle de données actuel pour calibrer plus finement.
const AIR_DENSITY = 1.225; // kg/m³
const DEFAULT_CDA = 0.32; // position route, cocottes
const ROLLING_RESISTANCE = 0.005;
const DEFAULT_BIKE_WEIGHT_KG = 8;
const SUSTAINED_POWER_RATIO = 0.9; // % FTP soutenable ~30-40min

export function predictBikeTime20km(
  ftpWatts: number | null,
  riderWeightKg: number | null
): number | null {
  if (ftpWatts === null || ftpWatts <= 0) return null;
  const mass = (riderWeightKg ?? 70) + DEFAULT_BIKE_WEIGHT_KG;
  const sustainedPower = ftpWatts * SUSTAINED_POWER_RATIO;
  const g = 9.81;

  let v = 10; // m/s, point de départ raisonnable
  for (let i = 0; i < 50; i++) {
    const f = 0.5 * AIR_DENSITY * DEFAULT_CDA * v ** 3 + ROLLING_RESISTANCE * mass * g * v - sustainedPower;
    const fPrime = 1.5 * AIR_DENSITY * DEFAULT_CDA * v ** 2 + ROLLING_RESISTANCE * mass * g;
    v = v - f / fPrime;
  }
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(20000 / v);
}

// ─── Musculation : PR potentiel par régression linéaire ──────────────────────

export interface StrengthProjection {
  exercise: string;
  currentValue: number;
  currentAchievedAt: string;
  projectedValue: number;
  projectedDate: string;
  weeklyRateKg: number;
}

/**
 * Projette le 1RM d'un exercice à `horizonDays` dans le futur par régression
 * linéaire sur l'historique de PR — jamais en dessous du record actuel (une
 * pente négative ou nulle n'annonce pas une "régression potentielle").
 */
export function projectStrengthPR(
  exercise: string,
  points: { achievedAt: Date; value: number }[],
  horizonDays: number
): StrengthProjection | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.achievedAt.getTime() - b.achievedAt.getTime());
  const t0 = sorted[0].achievedAt.getTime();
  const xs = sorted.map((p) => (p.achievedAt.getTime() - t0) / 86400000);
  const ys = sorted.map((p) => p.value);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const lastX = xs[xs.length - 1];
  const projectedX = lastX + horizonDays;
  const projectedValue = Math.max(intercept + slope * projectedX, ys[ys.length - 1]);

  return {
    exercise,
    currentValue: ys[ys.length - 1],
    currentAchievedAt: sorted[sorted.length - 1].achievedAt.toISOString(),
    projectedValue: Math.round(projectedValue * 10) / 10,
    projectedDate: new Date(t0 + projectedX * 86400000).toISOString(),
    weeklyRateKg: Math.round(slope * 7 * 100) / 100,
  };
}
