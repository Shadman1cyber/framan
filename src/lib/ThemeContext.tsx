"use client";

import { createContext, useCallback, useContext, useEffect } from "react";

// Dark-only app: theme is always dark. This context is kept only so
// existing imports (`useTheme`) don't break.
type ThemeContextValue = {
  theme: "dark";
  resolvedTheme: "dark";
  setTheme: (theme: "dark") => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    try {
      localStorage.removeItem("theme");
    } catch {}
  }, []);

  const setTheme = useCallback(async () => {}, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", resolvedTheme: "dark", setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}