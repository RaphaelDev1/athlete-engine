import { NextResponse } from "next/server";
import { AthleteProfile, Discipline, PersonalRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { profileSchema, ProfileFormValues } from "@/lib/validations/profile";
import { parseTimeToSeconds, formatSecondsToTime } from "@/lib/utils/time";
import { isImprovement, PrEvent } from "@/lib/engine/adaptation";
import { buildPrNotifications } from "@/lib/engine/notifications";
import { persistNotifications } from "@/lib/notifications/store";
import {
  RUNNING_PR_FIELDS,
  STRENGTH_PR_FIELDS,
  SWIMMING_PR_FIELDS,
  latestRecord,
} from "@/lib/profile/records";
import { materializePlan } from "@/lib/training/materialize";
import { computeWeeklyRunningVolumeKm } from "@/lib/training/volume";

export const dynamic = "force-dynamic";

// FC repos, FC max, VO2max, allure seuil et volume hebdo course : plus jamais
// saisis à la main, uniquement affichés (lib/garmin/profileSync.ts et
// lib/training/volume.ts sont les seuls écrivains de ces champs en base).
export interface GarminDerivedMetrics {
  restingHR: number | null;
  maxHR: number | null;
  vo2max: number | null;
  thresholdPace: string | null;
  weeklyVolume: number | null;
  garminConnected: boolean;
  lastSyncAt: string | null;
}

async function buildGarminDerivedMetrics(
  userId: string,
  profile: AthleteProfile | null
): Promise<GarminDerivedMetrics> {
  const [user, liveWeeklyVolume] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    computeWeeklyRunningVolumeKm(userId),
  ]);

  return {
    restingHR: profile?.restingHR ?? null,
    maxHR: profile?.maxHR ?? null,
    vo2max: profile?.vo2max ?? null,
    thresholdPace: formatSecondsToTime(profile?.thresholdPace ?? null),
    weeklyVolume: liveWeeklyVolume ?? profile?.weeklyVolume ?? null,
    garminConnected: !!user?.garminLastSyncAt,
    lastSyncAt: user?.garminLastSyncAt ? user.garminLastSyncAt.toISOString() : null,
  };
}

function toFormValues(
  profile: AthleteProfile,
  records: PersonalRecord[]
): ProfileFormValues {
  const pr = (discipline: Discipline, exercise: string) =>
    latestRecord(records, discipline, exercise)?.value ?? null;

  return {
    height: profile.height,
    weight: profile.weight,
    dateOfBirth: profile.dateOfBirth
      ? profile.dateOfBirth.toISOString().split("T")[0]
      : null,
    sex: profile.sex,
    bodyFatPct: profile.bodyFatPct,
    experienceLevel: profile.experienceLevel,
    weeklyFrequency: profile.weeklyFrequency,
    pr5k: formatSecondsToTime(pr("RUNNING", RUNNING_PR_FIELDS.pr5k)),
    pr10k: formatSecondsToTime(pr("RUNNING", RUNNING_PR_FIELDS.pr10k)),
    prHalf: formatSecondsToTime(pr("RUNNING", RUNNING_PR_FIELDS.prHalf)),
    prMarathon: formatSecondsToTime(pr("RUNNING", RUNNING_PR_FIELDS.prMarathon)),
    prSquat: pr("STRENGTH", STRENGTH_PR_FIELDS.prSquat),
    prBench: pr("STRENGTH", STRENGTH_PR_FIELDS.prBench),
    prDeadlift: pr("STRENGTH", STRENGTH_PR_FIELDS.prDeadlift),
    prOHP: pr("STRENGTH", STRENGTH_PR_FIELDS.prOHP),
    ftp: profile.ftp,
    wattsPerKg: profile.wattsPerKg,
    preferredCadence: profile.preferredCadence,
    swimPace100m: formatSecondsToTime(profile.swimPace100m),
    weeklySwimVolume: profile.weeklySwimVolume,
    pr400mSwim: formatSecondsToTime(pr("SWIMMING", SWIMMING_PR_FIELDS.pr400mSwim)),
  };
}

export async function GET() {
  const user = await getDefaultUser();
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
    include: { personalRecords: true },
  });

  const garmin = await buildGarminDerivedMetrics(user.id, profile);

  if (!profile) {
    return NextResponse.json({ data: null, garmin });
  }

  return NextResponse.json({ data: toFormValues(profile, profile.personalRecords), garmin });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const user = await getDefaultUser();

    const profile = await prisma.athleteProfile.upsert({
      where: { userId: user.id },
      update: {
        height: data.height,
        weight: data.weight,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        sex: data.sex,
        bodyFatPct: data.bodyFatPct,
        experienceLevel: data.experienceLevel,
        weeklyFrequency: data.weeklyFrequency,
        ftp: data.ftp,
        wattsPerKg: data.wattsPerKg,
        preferredCadence: data.preferredCadence,
        swimPace100m: parseTimeToSeconds(data.swimPace100m),
        weeklySwimVolume: data.weeklySwimVolume,
      },
      create: {
        userId: user.id,
        height: data.height,
        weight: data.weight,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        sex: data.sex,
        bodyFatPct: data.bodyFatPct,
        experienceLevel: data.experienceLevel,
        weeklyFrequency: data.weeklyFrequency,
        ftp: data.ftp,
        wattsPerKg: data.wattsPerKg,
        preferredCadence: data.preferredCadence,
        swimPace100m: parseTimeToSeconds(data.swimPace100m),
        weeklySwimVolume: data.weeklySwimVolume,
      },
    });

    const existingRecords = await prisma.personalRecord.findMany({
      where: { profileId: profile.id },
    });

    const prEvents: PrEvent[] = [];

    const maybeCreatePr = async (
      discipline: Discipline,
      exercise: string,
      newValue: number | null,
      unit: string
    ) => {
      if (newValue === null) return;
      const previous = latestRecord(existingRecords, discipline, exercise);
      const improved = !previous || isImprovement(unit, previous.value, newValue);
      if (!improved) return;

      const created = await prisma.personalRecord.create({
        data: {
          profileId: profile.id,
          discipline,
          exercise,
          value: newValue,
          unit,
          achievedAt: new Date(),
        },
      });
      prEvents.push({
        recordId: created.id,
        discipline,
        exercise,
        previousValue: previous?.value ?? null,
        newValue,
        unit,
      });
    };

    await maybeCreatePr("RUNNING", RUNNING_PR_FIELDS.pr5k, parseTimeToSeconds(data.pr5k), "seconds");
    await maybeCreatePr("RUNNING", RUNNING_PR_FIELDS.pr10k, parseTimeToSeconds(data.pr10k), "seconds");
    await maybeCreatePr("RUNNING", RUNNING_PR_FIELDS.prHalf, parseTimeToSeconds(data.prHalf), "seconds");
    await maybeCreatePr(
      "RUNNING",
      RUNNING_PR_FIELDS.prMarathon,
      parseTimeToSeconds(data.prMarathon),
      "seconds"
    );
    await maybeCreatePr("STRENGTH", STRENGTH_PR_FIELDS.prSquat, data.prSquat, "kg");
    await maybeCreatePr("STRENGTH", STRENGTH_PR_FIELDS.prBench, data.prBench, "kg");
    await maybeCreatePr("STRENGTH", STRENGTH_PR_FIELDS.prDeadlift, data.prDeadlift, "kg");
    await maybeCreatePr("STRENGTH", STRENGTH_PR_FIELDS.prOHP, data.prOHP, "kg");
    await maybeCreatePr(
      "SWIMMING",
      SWIMMING_PR_FIELDS.pr400mSwim,
      parseTimeToSeconds(data.pr400mSwim),
      "seconds"
    );

    if (prEvents.length > 0) {
      await persistNotifications(user.id, buildPrNotifications(prEvents));
    }

    if (data.weight !== null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.weightLog.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: { weight: data.weight, bodyFatPct: data.bodyFatPct },
        create: {
          userId: user.id,
          date: today,
          weight: data.weight,
          bodyFatPct: data.bodyFatPct,
        },
      });
    }

    const allRecords = await prisma.personalRecord.findMany({
      where: { profileId: profile.id },
    });

    // Poids/PRs/zones ont pu changer — resynchronise les semaines futures pas
    // encore loggées (lib/training/materialize.ts).
    await materializePlan(user.id);

    const garmin = await buildGarminDerivedMetrics(user.id, profile);
    return NextResponse.json({ data: toFormValues(profile, allRecords), garmin });
  } catch (err) {
    console.error("Erreur sauvegarde profil:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
