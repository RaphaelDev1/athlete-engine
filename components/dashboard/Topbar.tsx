"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/profile": "Profil",
  "/goals": "Objectifs",
  "/training": "Entraînement",
  "/nutrition": "Nutrition",
  "/recovery": "Récupération",
  "/onboarding": "Bienvenue",
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES).find(
    (key) => key !== "/" && pathname.startsWith(key)
  );
  return match ? PAGE_TITLES[match] : "Athlete Engine";
}

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between h-14 px-4 sm:px-6 border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="p-2 -ml-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-surface-100 md:hidden">
          {resolveTitle(pathname)}
        </span>
      </div>
      <NotificationBell />
    </header>
  );
}
