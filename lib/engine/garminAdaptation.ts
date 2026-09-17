// Mapping entre les données Garmin (Phase 3) et les décisions du moteur
// d'adaptation d'entraînement (Phase 2 — lib/engine/periodization.ts).
//
// ┌─────────────────────────┬────────────────────────────────────────────────┐
// │ Champ Garmin             │ Décision impactée                              │
// ├─────────────────────────┼────────────────────────────────────────────────┤
// │ trainingReadiness.score  │ Signal principal : autorise/réduit la séance   │
// │                          │ du jour (loadMultiplier).                      │
// │ sleep.overallSleepScore  │ Pondère la readiness ; un score < 60 pousse    │
// │                          │ vers CAUTION même si le reste est correct.     │
// │ hrv.lastNightAvg vs      │ Une chute > 15% sous la moyenne 7j déclenche   │
// │   moyenne 7 jours        │ REST (signe de fatigue/surcharge du SNA).      │
// │ bodyBattery (dernier)    │ < 25 au réveil : séance longue/intense         │
// │                          │ déconseillée, bascule vers séance easy/repos.  │
// │ stress.avgStressLevel    │ > 50 en continu : réduit le volume prévu       │
// │                          │ des séances de force (récupération SNC).      │
// │ trainingLoad.loadRatio   │ > 1.5 (charge aiguë/chronique) : signale un    │
// │   (acute/chronic)        │ risque de surcharge, taper conseillé.         │
// │ vo2Max                   │ Recalibre les zones d'allure (lib/engine/     │
// │                          │ zones.ts) quand la valeur progresse/régresse.  │
// └─────────────────────────┴────────────────────────────────────────────────┘
//
// Ce module ne modifie pas le générateur de plan (periodization.ts) : il
// expose un signal de récupération quotidien, consommé par la page
// /recovery et destiné à informer une adaptation manuelle ou future
// automatisation des séances déjà planifiées.

export type ReadinessLevel = "READY" | "MAINTAIN" | "CAUTION" | "REST";

export interface RecoverySignals {
  trainingReadinessScore: number | null; // 0-100
  sleepScore: number | null; // 0-100
  hrvLastNight: number | null; // ms
  hrv7dAvg: number | null; // ms
  bodyBattery: number | null; // 0-100
  stressAvg: number | null; // 0-100
  loadRatio: number | null; // acute/chronic training load
}

export interface RecoveryStatus {
  level: ReadinessLevel;
  loadMultiplier: number; // à appliquer au volume/intensité prévus (1 = inchangé)
  reasons: string[];
}

const LEVEL_MULTIPLIER: Record<ReadinessLevel, number> = {
  READY: 1.1,
  MAINTAIN: 1,
  CAUTION: 0.75,
  REST: 0.4,
};

export function computeRecoveryStatus(signals: RecoverySignals): RecoveryStatus {
  const reasons: string[] = [];
  let level: ReadinessLevel = "MAINTAIN";

  const worsen = (candidate: ReadinessLevel, reason: string) => {
    const order: ReadinessLevel[] = ["READY", "MAINTAIN", "CAUTION", "REST"];
    if (order.indexOf(candidate) > order.indexOf(level)) level = candidate;
    reasons.push(reason);
  };

  if (signals.trainingReadinessScore !== null) {
    if (signals.trainingReadinessScore >= 75) {
      if (level === "MAINTAIN") level = "READY";
    } else if (signals.trainingReadinessScore < 50) {
      worsen("CAUTION", "Training Readiness Garmin faible (<50)");
    } else if (signals.trainingReadinessScore < 25) {
      worsen("REST", "Training Readiness Garmin très faible (<25)");
    }
  }

  if (signals.sleepScore !== null && signals.sleepScore < 60) {
    worsen("CAUTION", "Score de sommeil sous 60");
  }

  if (
    signals.hrvLastNight !== null &&
    signals.hrv7dAvg !== null &&
    signals.hrv7dAvg > 0 &&
    signals.hrvLastNight < signals.hrv7dAvg * 0.85
  ) {
    worsen("REST", "HRV en baisse de plus de 15% vs moyenne 7 jours");
  }

  if (signals.bodyBattery !== null && signals.bodyBattery < 25) {
    worsen("CAUTION", "Body Battery basse (<25)");
  }

  if (signals.stressAvg !== null && signals.stressAvg > 50) {
    worsen("CAUTION", "Stress moyen élevé (>50)");
  }

  if (signals.loadRatio !== null && signals.loadRatio > 1.5) {
    worsen("CAUTION", "Ratio de charge aiguë/chronique élevé (>1.5)");
  }

  if (reasons.length === 0) {
    reasons.push("Aucun signal de fatigue détecté");
  }

  return { level, loadMultiplier: LEVEL_MULTIPLIER[level], reasons };
}
