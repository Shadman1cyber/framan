"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { setUserTheme, getUserTheme } from "@/app/actions/theme";

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    let currentMode: ThemeMode = "system";
    let mediaQuery: MediaQueryList | null = null;

    const initialize = async () => {
      const stored = (await getUserTheme()) as ThemeMode;
      currentMode = stored;
      setThemeState(stored);

      const resolved = stored === "system" ? getSystemTheme() : stored;
      setResolvedTheme(resolved);
      applyTheme(resolved);

      if (stored === "system") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        mediaQuery.addEventListener("change", handleSystemChange);
      }
    };

    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (currentMode === "system") {
        const resolved = e.matches ? "dark" : "light";
        setResolvedTheme(resolved);
        applyTheme(resolved);
      }
    };

    initialize();

    return () => {
      mediaQuery?.removeEventListener("change", handleSystemChange);
    };
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    const resolved = newTheme === "system" ? getSystemTheme() : newTheme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {}
    await setUserTheme(newTheme);
  }, []);

  const value = mounted
    ? { theme, resolvedTheme, setTheme }
    : { theme: "system" as ThemeMode, resolvedTheme: "light" as const, setTheme: async () => {} };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: "system" as ThemeMode, resolvedTheme: "light" as const, setTheme: async () => {} };
  }
  return ctx;
}