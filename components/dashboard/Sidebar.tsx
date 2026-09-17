"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Target,
  Dumbbell,
  Apple,
  Moon,
  Activity,
  History,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profil", icon: User },
  { href: "/goals", label: "Objectifs", icon: Target },
  { href: "/training", label: "Entraînement", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/recovery", label: "Récupération", icon: Moon },
  { href: "/history", label: "Historique", icon: History },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden animate-fade-in"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col h-screen bg-surface-950 border-r border-surface-800
          transition-all duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0
          ${collapsed ? "md:w-[72px]" : "md:w-[240px]"}
          w-[240px]
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-800">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg gradient-brand flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-surface-100 truncate">
                Athlete Engine
              </span>
              <span className="text-[10px] text-surface-500 uppercase tracking-widest">
                Training
              </span>
            </div>
          )}
          <button
            onClick={onCloseMobile}
            className="ml-auto p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-200 group relative
                  ${
                    isActive
                      ? "bg-brand-500/10 text-brand-500"
                      : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/50"
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r" />
                )}
                <Icon
                  className={`w-5 h-5 flex-shrink-0 ${
                    isActive
                      ? "text-brand-500"
                      : "text-surface-500 group-hover:text-surface-300"
                  }`}
                />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="p-2 border-t border-surface-800 hidden md:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg
                       text-surface-500 hover:text-surface-300 hover:bg-surface-800/50
                       transition-colors duration-200"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
