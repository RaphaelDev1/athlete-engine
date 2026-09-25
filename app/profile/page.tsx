"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  profileSchema,
  ProfileFormValues,
  defaultProfileValues,
} from "@/lib/validations/profile";
import { Card, CardHeader, CardTitle, Button, Input, Select } from "@/components/ui";
import {
  User,
  Timer,
  Dumbbell,
  Bike,
  Waves,
  Save,
  RotateCcw,
  Watch,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GarminDerivedMetrics } from "@/app/api/profile/route";

function GarminMetric({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="rounded-lg border border-surface-700/60 bg-surface-800/40 px-4 py-3">
      <p className="text-xs text-surface-500">{label}</p>
      <p className="text-lg font-semibold text-surface-100 mt-0.5">{value ?? "—"}</p>
      {hint && <p className="text-[11px] text-surface-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function ProfilePage() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [garmin, setGarmin] = useState<GarminDerivedMetrics | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaultProfileValues,
  });

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then(({ data, garmin }) => {
        if (data) reset(data);
        setGarmin(garmin ?? null);
      })
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { data: savedProfile, garmin: savedGarmin } = await res.json();
        reset(savedProfile);
        setGarmin(savedGarmin ?? null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error("Erreur sauvegarde profil:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-surface-800/60 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-800/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Profil Athlète</h1>
          <p className="text-sm text-surface-400 mt-1">
            Tes données biométriques et performances actuelles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-sm text-success-400 animate-pulse">
              Sauvegardé
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reset()}
            disabled={!isDirty}
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit(onSubmit)}
            loading={saving}
            disabled={!isDirty}
          >
            <Save className="w-4 h-4" />
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* ─── Métriques Garmin (lecture seule) ───────────────────── */}
      <Card padding="lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Watch className="w-5 h-5 text-brand-500" />
            <CardTitle>Métriques Garmin</CardTitle>
          </div>
        </CardHeader>

        {garmin?.garminConnected ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <GarminMetric label="FC repos" value={garmin.restingHR !== null ? `${garmin.restingHR} bpm` : null} />
              <GarminMetric label="FC max" value={garmin.maxHR !== null ? `${garmin.maxHR} bpm` : null} hint="Max observé sur 12 mois" />
              <GarminMetric label="VO2max" value={garmin.vo2max !== null ? `${garmin.vo2max} ml/kg/min` : null} />
              <GarminMetric label="Allure seuil" value={garmin.thresholdPace ? `${garmin.thresholdPace}/km` : null} hint="Estimée depuis le VO2max" />
              <GarminMetric label="Volume hebdo course" value={garmin.weeklyVolumeRunning !== null ? `${garmin.weeklyVolumeRunning} km` : null} hint="7 derniers jours" />
              <GarminMetric label="Volume hebdo vélo" value={garmin.weeklyVolumeCycling !== null ? `${garmin.weeklyVolumeCycling} km` : null} hint="7 derniers jours" />
              <GarminMetric label="Volume hebdo natation" value={garmin.weeklyVolumeSwimming !== null ? `${garmin.weeklyVolumeSwimming} km` : null} hint="7 derniers jours" />
            </div>
            <p className="text-xs text-surface-500 mt-3">
              Synchronisé depuis Garmin le {formatSyncDate(garmin.lastSyncAt)} — ces valeurs ne se
              saisissent plus à la main.{" "}
              <Link href="/recovery" className="text-brand-500 hover:underline inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Resynchroniser
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-surface-400">
            Garmin n&apos;est pas encore connecté — ces métriques (FC repos, FC max, VO2max, allure
            seuil, volume hebdo) se rempliront automatiquement dès la première synchronisation
            depuis{" "}
            <Link href="/recovery" className="text-brand-500 hover:underline">
              la page Récupération
            </Link>
            .
          </p>
        )}
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ─── Biométrie ────────────────────────────────────────── */}
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-brand-500" />
              <CardTitle>Biométrie</CardTitle>
            </div>
          </CardHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Taille"
              type="number"
              step="0.1"
              suffix="cm"
              placeholder="175"
              error={errors.height?.message}
              {...register("height")}
            />
            <Input
              label="Poids"
              type="number"
              step="0.1"
              suffix="kg"
              placeholder="78"
              error={errors.weight?.message}
              {...register("weight")}
            />
            <Input
              label="Date de naissance"
              type="date"
              error={errors.dateOfBirth?.message}
              {...register("dateOfBirth")}
            />
            <Select
              label="Sexe"
              placeholder="Sélectionner"
              options={[
                { value: "MALE", label: "Homme" },
                { value: "FEMALE", label: "Femme" },
              ]}
              error={errors.sex?.message}
              {...register("sex")}
            />
            <Input
              label="Masse grasse"
              type="number"
              step="0.1"
              suffix="%"
              placeholder="15"
              hint="Optionnel — affine les calculs"
              error={errors.bodyFatPct?.message}
              {...register("bodyFatPct")}
            />
            <Select
              label="Objectif de poids"
              options={[
                { value: "DEFICIT", label: "Perdre du poids" },
                { value: "MAINTENANCE", label: "Maintenir le poids" },
                { value: "SURPLUS", label: "Prendre du poids" },
              ]}
              error={errors.weightGoalDirection?.message}
              {...register("weightGoalDirection")}
            />
          </div>
        </Card>

        {/* ─── Course ───────────────────────────────────────────── */}
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-brand-500" />
              <CardTitle>Course à pied</CardTitle>
            </div>
          </CardHeader>

          <div className="space-y-4">
            {/* PRs course */}
            <div>
              <p className="text-sm font-medium text-surface-300 mb-3">
                Records personnels
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  label="5K"
                  type="text"
                  placeholder="20:30"
                  hint="MM:SS"
                  error={errors.pr5k?.message}
                  {...register("pr5k")}
                />
                <Input
                  label="10K"
                  type="text"
                  placeholder="42:15"
                  hint="MM:SS"
                  error={errors.pr10k?.message}
                  {...register("pr10k")}
                />
                <Input
                  label="Semi-marathon"
                  type="text"
                  placeholder="1:32:00"
                  hint="H:MM:SS"
                  error={errors.prHalf?.message}
                  {...register("prHalf")}
                />
                <Input
                  label="Marathon"
                  type="text"
                  placeholder="3:15:00"
                  hint="H:MM:SS"
                  error={errors.prMarathon?.message}
                  {...register("prMarathon")}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Musculation ──────────────────────────────────────── */}
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-info-500" />
              <CardTitle>Musculation</CardTitle>
            </div>
          </CardHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Niveau d'expérience"
                placeholder="Sélectionner"
                options={[
                  { value: "BEGINNER", label: "Débutant (< 1 an)" },
                  { value: "INTERMEDIATE", label: "Intermédiaire (1-3 ans)" },
                  { value: "ADVANCED", label: "Avancé (3+ ans)" },
                ]}
                error={errors.experienceLevel?.message}
                {...register("experienceLevel")}
              />
              <Input
                label="Fréquence hebdo"
                type="number"
                suffix="séances/sem"
                placeholder="4"
                error={errors.weeklyFrequency?.message}
                {...register("weeklyFrequency")}
              />
            </div>

            {/* 1RM */}
            <div className="pt-4 border-t border-surface-700">
              <p className="text-sm font-medium text-surface-300 mb-3">
                1RM — Records personnels
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  label="Squat"
                  type="number"
                  step="0.5"
                  suffix="kg"
                  placeholder="120"
                  error={errors.prSquat?.message}
                  {...register("prSquat")}
                />
                <Input
                  label="Bench Press"
                  type="number"
                  step="0.5"
                  suffix="kg"
                  placeholder="90"
                  error={errors.prBench?.message}
                  {...register("prBench")}
                />
                <Input
                  label="Deadlift"
                  type="number"
                  step="0.5"
                  suffix="kg"
                  placeholder="150"
                  error={errors.prDeadlift?.message}
                  {...register("prDeadlift")}
                />
                <Input
                  label="OHP"
                  type="number"
                  step="0.5"
                  suffix="kg"
                  placeholder="55"
                  error={errors.prOHP?.message}
                  {...register("prOHP")}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Vélo ─────────────────────────────────────────────── */}
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bike className="w-5 h-5 text-success-500" />
              <CardTitle>Vélo / Triathlon</CardTitle>
            </div>
          </CardHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="FTP"
              type="number"
              suffix="watts"
              placeholder="250"
              hint="Functional Threshold Power"
              error={errors.ftp?.message}
              {...register("ftp")}
            />
            <Input
              label="Watts/kg"
              type="number"
              step="0.01"
              suffix="W/kg"
              placeholder="3.2"
              error={errors.wattsPerKg?.message}
              {...register("wattsPerKg")}
            />
            <Input
              label="Cadence préférée"
              type="number"
              suffix="RPM"
              placeholder="90"
              error={errors.preferredCadence?.message}
              {...register("preferredCadence")}
            />
          </div>
        </Card>

        {/* ─── Natation ─────────────────────────────────────────── */}
        <Card padding="lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Waves className="w-5 h-5 text-info-500" />
              <CardTitle>Natation</CardTitle>
            </div>
          </CardHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Allure"
              type="text"
              suffix="min/100m"
              placeholder="1:45"
              hint="Format MM:SS"
              error={errors.swimPace100m?.message}
              {...register("swimPace100m")}
            />
            <Input
              label="Volume hebdo actuel"
              type="number"
              step="0.1"
              suffix="km"
              placeholder="3"
              error={errors.weeklySwimVolume?.message}
              {...register("weeklySwimVolume")}
            />
            <Input
              label="Record 400m"
              type="text"
              placeholder="7:30"
              hint="MM:SS"
              error={errors.pr400mSwim?.message}
              {...register("pr400mSwim")}
            />
          </div>
        </Card>

        {/* Save button (bottom) */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="secondary"
            type="button"
            onClick={() => reset()}
            disabled={!isDirty}
          >
            Annuler les modifications
          </Button>
          <Button type="submit" loading={saving} disabled={!isDirty}>
            <Save className="w-4 h-4" />
            Sauvegarder le profil
          </Button>
        </div>
      </form>
    </div>
  );
}
