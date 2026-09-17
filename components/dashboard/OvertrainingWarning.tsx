"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui";
import { AthleteState } from "@/lib/engine/labels";

interface OvertrainingWarningProps {
  athleteState: AthleteState;
  reasons: string[];
  onPostpone: () => void | Promise<void>;
  postponing: boolean;
}

// Bandeau d'alerte surmenage — extrait de app/training/page.tsx (où il vivait
// en dur) pour être réutilisé aussi sur le Dashboard. Condition et texte
// identiques ; ajoute un bouton d'action directe (report global du plan,
// même mécanisme que le bouton "Reporter" déjà présent sur /training) — la
// requête/l'état de chargement restent gérés par l'appelant pour rester
// cohérents avec le reste de son état de page (schedule.shiftDays, etc.).
export function OvertrainingWarning({
  athleteState,
  reasons,
  onPostpone,
  postponing,
}: OvertrainingWarningProps) {
  if (athleteState === "READY") return null;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-warning-400">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 flex items-start justify-between gap-4 flex-wrap">
        <p>
          Tes facteurs de récupération ne sont pas au vert en ce moment
          {reasons.length > 0 ? ` (${reasons.join(", ")})` : ""} — évite d&apos;ajouter une grosse
          séance sur les prochains jours dispo, ou reporte-la depuis la grille ci-dessous.
        </p>
        <Button size="sm" variant="secondary" onClick={onPostpone} loading={postponing}>
          <CalendarClock className="w-3.5 h-3.5" />
          Reporter tout le plan d&apos;1 jour
        </Button>
      </div>
    </div>
  );
}
