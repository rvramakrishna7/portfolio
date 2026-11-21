"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key === "theme") callback();
  };
  const onChange = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener("theme-change", onChange);
  mediaQuery.addEventListener("change", onChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("theme-change", onChange);
    mediaQuery.removeEventListener("change", onChange);
  };
}

function getSnapshot(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export function ThemeToggle() {
  const currentTheme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const toggleTheme = () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore storage errors
    }
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("theme-change"));

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute(
        "content",
        next === "dark" ? "#0B0B0D" : "#F5F5F7"
      );
    }
  };

  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  const label =
    nextTheme === "dark" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      className="theme-toggle"
      type="button"
      data-theme-toggle
      aria-label={label}
      onClick={toggleTheme}
    >
      {currentTheme === "dark" ? (
        // Sun icon (click to switch to light)
        <svg
          className="theme-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon icon (click to switch to dark)
        <svg
          className="theme-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
