
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skull, Sun, Moon, Search } from "lucide-react";
import type { TextKey } from '@/contexts/ThemeContext';

interface DashboardHeaderProps {
  t: (key: TextKey) => string;
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  connected: boolean;
  activeAgentsCount: number;
  totalAgentsCount: number;
  totalTasks: number;
  completedTasks: number;
}

export function DashboardHeader({
  t, theme, setTheme, searchQuery, setSearchQuery, connected,
  activeAgentsCount, totalAgentsCount, totalTasks, completedTasks
}: DashboardHeaderProps) {
  return (
    <header className="flex-none flex items-center justify-between px-8 py-6 border-b-2 border-primary bg-background z-10 sticky top-0 shadow-[0_0_15px_hsl(var(--glow)/0.3)]">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-primary-foreground p-2 font-bold text-2xl animate-pulse">
            <Skull className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-widest text-shadow-neon text-foreground">{t('APP_TITLE')}</h1>

            <p className="text-xs text-primary/70">{t('APP_SUBTITLE')}</p>
          </div>
        </div>

        {/* Stats moved to Header */}
        <div className="flex items-center gap-8 mx-4">
          <div>
            <span className="text-primary/70 text-xs font-bold mr-2 uppercase">{t('AGENTS_TITLE')}:</span>
            <span className="font-bold text-xl">{activeAgentsCount} / {totalAgentsCount}</span>
          </div>
          <div>
            <span className="text-primary/70 text-xs font-bold mr-2 uppercase">{t('TASKS_TITLE')}:</span>
            <span className="font-bold text-xl">{totalTasks} (✓ {completedTasks})</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-4 relative group">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="FILTER TASKS..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full h-10 w-10 border-2 hover:bg-primary hover:text-primary-foreground transition-all duration-300"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <Badge variant={connected ? "default" : "destructive"} className="gap-2 text-sm px-3 py-1 border border-primary/50">
            <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}></span>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </Badge>

        </div>
      </header>
  );
}
