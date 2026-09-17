"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Moon, Trophy, AlertTriangle, CheckCheck } from "lucide-react";

interface NotificationItem {
  id: string;
  type: "SLEEP_ALERT" | "PR_CELEBRATION" | "OVERTRAINING_ALERT";
  severity: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<NotificationItem["type"], typeof Bell> = {
  SLEEP_ALERT: Moon,
  PR_CELEBRATION: Trophy,
  OVERTRAINING_ALERT: AlertTriangle,
};

const SEVERITY_COLOR: Record<NotificationItem["severity"], string> = {
  INFO: "text-info-400 bg-info-500/10",
  SUCCESS: "text-success-400 bg-success-500/10",
  WARNING: "text-warning-400 bg-warning-500/10",
  DANGER: "text-danger-400 bg-danger-500/10",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return `il y a ${Math.round(diffH / 24)} j`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/notifications");
    const json = await res.json();
    setNotifications(json.data ?? []);
    setUnreadCount(json.unreadCount ?? 0);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className="relative p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 sticky top-0 bg-surface-900">
            <span className="text-sm font-semibold text-surface-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-400"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tout marquer lu
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-8 px-4">
              Aucune notification pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-surface-800">
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type];
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => !n.read && markRead(n.id)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-850 transition-colors ${
                        !n.read ? "bg-surface-850/50" : ""
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${SEVERITY_COLOR[n.severity]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-100">{n.title}</p>
                        <p className="text-xs text-surface-400 mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[11px] text-surface-500 mt-1">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
