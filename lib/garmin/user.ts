import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_EMAIL } from "./config";

// V1 mono-utilisateur : toute l'app (et l'intégration Garmin) tourne pour un
// seul compte, identifié par l'email du propriétaire de l'app.
export async function getDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL },
  });
}
