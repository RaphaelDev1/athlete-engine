import { NextResponse } from "next/server";
import { getDefaultUser } from "@/lib/garmin/user";
import { postponeSchedule } from "@/lib/training/schedule";
import { materializePlan } from "@/lib/training/materialize";

export const dynamic = "force-dynamic";

// Déclenché manuellement (glisser-déposer une séance sur le lendemain, ou
// bouton "Reporter") ou via l'action d'adaptation proposée sur le dashboard
// quand la récupération est mauvaise — voir lib/engine/adaptation.ts.
export async function POST() {
  const user = await getDefaultUser();
  const schedule = await postponeSchedule(user.id);
  // Les semaines futures encore 100% PLANNED sont resynchronisées sur la
  // nouvelle ancre ; les semaines contenant une séance déjà loggée restent
  // intactes (lib/training/materialize.ts).
  await materializePlan(user.id);
  return NextResponse.json({ data: schedule });
}
