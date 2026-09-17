"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ArrowLeft, Check, Activity } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import {
  onboardingSchema,
  OnboardingFormValues,
  defaultOnboardingValues,
  AthleteFocus,
} from "@/lib/validations/onboarding";
import { defaultProfileValues } from "@/lib/validations/profile";

const STEPS = ["Identité", "Discipline", "Récap"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<AthleteFocus>("RUNNING");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: defaultOnboardingValues,
  });

  const values = watch();

  async function goNext() {
    const fieldsToValidate: (keyof OnboardingFormValues)[] =
      step === 0 ? ["height", "weight", "dateOfBirth", "sex"] : [];
    const valid = fieldsToValidate.length === 0 || (await trigger(fieldsToValidate));
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const onSubmit = async (data: OnboardingFormValues) => {
    setSubmitting(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...defaultProfileValues, ...data }),
      });
      router.push("/");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-10 h-10 rounded-lg gradient-brand flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Bienvenue sur Athlete Engine</h1>
            <p className="text-xs text-surface-500">Configurons ton profil en 3 étapes</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  i <= step ? "bg-brand-500" : "bg-surface-800"
                }`}
              />
              <p
                className={`text-[11px] mt-1.5 text-center ${
                  i <= step ? "text-surface-300" : "text-surface-600"
                }`}
              >
                {label}
              </p>
            </div>
          ))}
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {step === 0 && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-sm text-surface-400">
                  Tes données biométriques de base — tu pourras tout affiner plus tard
                  dans ton profil.
                </p>
                <div className="grid grid-cols-2 gap-4">
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
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-sm text-surface-400">
                  Quelle est ta discipline principale ? Ça nous aide à te poser les
                  bonnes questions.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "RUNNING", label: "🏃 Course" },
                      { key: "STRENGTH", label: "🏋️ Force" },
                      { key: "CYCLING", label: "🚴 Vélo" },
                      { key: "MIXED", label: "🔄 Mixte" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFocus(opt.key)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        focus === opt.key
                          ? "border-brand-500 bg-brand-500/10 text-brand-400"
                          : "border-surface-700 text-surface-400 hover:border-surface-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  {(focus === "RUNNING" || focus === "MIXED") && (
                    <p className="col-span-2 text-xs text-surface-500">
                      FC repos/max, VO2max et volume hebdo se rempliront automatiquement dès ta
                      première synchronisation Garmin (page Récupération) — rien à saisir ici.
                    </p>
                  )}
                  {(focus === "STRENGTH" || focus === "MIXED") && (
                    <>
                      <Select
                        label="Niveau"
                        placeholder="Sélectionner"
                        options={[
                          { value: "BEGINNER", label: "Débutant" },
                          { value: "INTERMEDIATE", label: "Intermédiaire" },
                          { value: "ADVANCED", label: "Avancé" },
                        ]}
                        error={errors.experienceLevel?.message}
                        {...register("experienceLevel")}
                      />
                      <Input
                        label="Fréquence hebdo"
                        type="number"
                        suffix="séances"
                        placeholder="4"
                        error={errors.weeklyFrequency?.message}
                        {...register("weeklyFrequency")}
                      />
                    </>
                  )}
                  {focus === "CYCLING" && (
                    <Input
                      label="FTP"
                      type="number"
                      suffix="watts"
                      placeholder="250"
                      error={errors.ftp?.message}
                      {...register("ftp")}
                    />
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-surface-400 mb-2">
                  Vérifie tes infos — tu pourras tout modifier plus tard dans ton profil.
                </p>
                <RecapRow label="Taille" value={values.height ? `${values.height} cm` : "—"} />
                <RecapRow label="Poids" value={values.weight ? `${values.weight} kg` : "—"} />
                <RecapRow label="Discipline principale" value={focus} />
                {(focus === "STRENGTH" || focus === "MIXED") && (
                  <RecapRow label="Niveau" value={values.experienceLevel ?? "—"} />
                )}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-surface-700">
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                disabled={step === 0}
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Suivant
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button type="submit" loading={submitting}>
                  <Check className="w-4 h-4" />
                  Terminer
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-800 last:border-0">
      <span className="text-sm text-surface-400">{label}</span>
      <span className="text-sm font-medium text-surface-100">{value}</span>
    </div>
  );
}
