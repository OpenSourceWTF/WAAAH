import React, { createContext, useContext, useEffect, useState } from 'react';

// 1. Text Dictionary
const TEXT_MAP = {
  WAAAH: {
    AGENTS_TITLE: "DA BOYZ",
    TASKS_TITLE: "ACTIVE MISSIONS",
    HISTORY_TITLE: "SCRIBBLINGS",
    LOGS_TITLE: "THE SHOUT",
    DISCONNECTED: "NO SIGNAL! KRUMPIN...",
    NO_TASKS: "NO MISSIONS FOR DA BOYZ!",
    NO_HISTORY: "NO ANCIENT SCRIBBLINGS FOUND",
    STATUS_WAITING: "WAITIN",
    STATUS_PROCESSING: "KRUMPIN",
    STATUS_OFFLINE: "ZOGGED",
    ID_LABEL: "ID",
    SIGNAL_CONNECTED: "WAAAH SIGNAL STRONG",
    SIGNAL_DISCONNECTED: "NO SIGNAL! KRUMPIN...",
    ZERO_BOYZ: "ZERO BOYZ!! KRUMPIN TIME?",
    END_OF_HISTORY: "END OF SCRIBBLINGS",
    APP_TITLE: "WAAAH BOSS",
    APP_SUBTITLE: "DA KOMMAND DECK",
  },
  PROFESSIONAL: { // Shared by LIGHT/DARK
    AGENTS_TITLE: "AGENTS",
    TASKS_TITLE: "ACTIVE TASKS",
    HISTORY_TITLE: "HISTORY",
    LOGS_TITLE: "ACTIVITY LOG",
    DISCONNECTED: "DISCONNECTED",
    NO_TASKS: "No active tasks.",
    NO_HISTORY: "No history found.",
    STATUS_WAITING: "WAITING",
    STATUS_PROCESSING: "PROCESSING",
    STATUS_OFFLINE: "OFFLINE",
    ID_LABEL: "Task ID",
    SIGNAL_CONNECTED: "BOT STREAMS",
    SIGNAL_DISCONNECTED: "DISCONNECTED",
    ZERO_BOYZ: "No Bots",
    END_OF_HISTORY: "End of History",
    APP_TITLE: "WAAAH DASHBOARD",
    APP_SUBTITLE: "WORK ANYWHERE AUTONOMOUS AGENT HUB",
  }
};

type Theme = 'WAAAH' | 'LIGHT' | 'DARK';
export type TextKey = keyof typeof TEXT_MAP['WAAAH'];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: TextKey) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Load from local storage or default to WAAAH
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('waaah-theme');
    return (saved as Theme) || 'DARK';
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all potential classes/attributes first
    root.classList.remove('light', 'dark');
    root.removeAttribute('data-theme');

    // Set persistence
    localStorage.setItem('waaah-theme', theme);

    // Apply new theme
    if (theme === 'WAAAH') {
      root.setAttribute('data-theme', 'waaah');
    } else if (theme === 'LIGHT') {
      root.setAttribute('data-theme', 'light');
      root.classList.add('light'); // For Tailwind dark mode logic if needed
    } else if (theme === 'DARK') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    }
  }, [theme]);

  // Text Helper
  const t = (key: TextKey): string => {
    const map = theme === 'WAAAH' ? TEXT_MAP.WAAAH : TEXT_MAP.PROFESSIONAL;
    return map[key] || key;
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
