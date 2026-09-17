import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/garmin/user";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getDefaultUser();
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!profile) {
    redirect("/onboarding");
  }

  return <DashboardContent />;
}
