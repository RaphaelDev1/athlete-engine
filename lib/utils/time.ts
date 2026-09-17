// Conversion entre les formats "MM:SS" / "H:MM:SS" saisis dans le profil
// (allure, PRs course) et les secondes stockées en base.

export function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;

  if (parts.length === 2) {
    const [min, sec] = parts;
    return min * 60 + sec;
  }
  if (parts.length === 3) {
    const [h, min, sec] = parts;
    return h * 3600 + min * 60 + sec;
  }
  return null;
}

export function formatSecondsToTime(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const total = Math.round(value);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;

  if (h > 0) {
    return `${h}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
