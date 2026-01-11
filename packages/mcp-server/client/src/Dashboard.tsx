import { useCallback, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skull, Sun, Moon, Search } from "lucide-react";
import { KanbanBoard } from './KanbanBoard';
import { useTheme } from '@/contexts/ThemeContext';
import { useTaskData, useAgentData } from './hooks';
import { useTaskActions } from './hooks/useTaskActions';
import { useAgentActions, getStatusBadgeClass } from './hooks/useAgentActions';
import { AgentSidebar } from './components/dashboard/AgentSidebar';

export function Dashboard() {
  const { theme, setTheme, t } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  // Data hooks
  const {
    activeTasks,
    recentCompleted,
    recentCancelled,
    stats,
    connected,
    refetch: refetchTasks,
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  } = useTaskData({ pollInterval: 2000, search: searchQuery });

  const { agents, getRelativeTime, refetch: refetchAgents } = useAgentData({ pollInterval: 2000 });

  // Combined refetch
  const fetchData = useCallback(() => {
    refetchTasks();
    refetchAgents();
  }, [refetchTasks, refetchAgents]);

  // Action hooks - extracted to reduce complexity
  const {
    handleCancelTask,
    handleRetryTask,
    handleApproveTask,
    handleRejectTask,
    handleSendComment,
    handleAddReviewComment
  } = useTaskActions(fetchData);

  const { handleEvictAgent } = useAgentActions(fetchData);

  return (
    <div className="flex flex-col h-screen bg-background text-primary uppercase font-mono tracking-wider">
      {/* Header */}
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

        {/* Stats */}
        <div className="flex items-center gap-8 mx-4">
          <div>
            <span className="text-primary/70 text-xs font-bold mr-2 uppercase">{t('AGENTS_TITLE')}:</span>
            <span className="font-bold text-xl">{agents.filter(a => a.status === 'PROCESSING').length} / {agents.length}</span>
          </div>
          <div>
            <span className="text-primary/70 text-xs font-bold mr-2 uppercase">{t('TASKS_TITLE')}:</span>
            <span className="font-bold text-xl">{activeTasks.length}</span>
          </div>
          <div>
            <span className="text-primary/70 text-xs font-bold mr-2 uppercase">COMPLETED:</span>
            <span className="font-bold text-xl">{stats.completed}</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 flex items-center justify-center max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-primary/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-10 pr-10 py-2 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary lowercase"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-primary/50 hover:text-primary text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-primary/10 border border-primary/20 rounded-md p-1 gap-1">
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${theme === 'LIGHT' ? 'bg-primary text-primary-foreground' : 'text-primary'}`} onClick={() => setTheme('LIGHT')} title="Light Mode"><Sun className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${theme === 'DARK' ? 'bg-primary text-primary-foreground' : 'text-primary'}`} onClick={() => setTheme('DARK')} title="Dark Mode"><Moon className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${theme === 'WAAAH' ? 'bg-primary text-primary-foreground' : 'text-primary'}`} onClick={() => setTheme('WAAAH')} title="WAAAH Mode"><Skull className="h-4 w-4" /></Button>
          </div>
          <Badge variant={connected ? "default" : "destructive"} className="gap-2 text-sm px-3 py-1 border border-primary/50">
            <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}></span>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <div className="flex-1 overflow-hidden p-4 flex flex-col bg-background min-w-0">
          <div className="flex-1 min-h-0 overflow-hidden pt-4">
            <KanbanBoard
              tasks={activeTasks}
              completedTasks={recentCompleted}
              cancelledTasks={recentCancelled}
              onCancelTask={handleCancelTask}
              onRetryTask={handleRetryTask}
              onApproveTask={handleApproveTask}
              onRejectTask={handleRejectTask}
              onSendComment={handleSendComment}
              onAddReviewComment={handleAddReviewComment}
              onLoadMoreCompleted={loadMoreCompleted}
              onLoadMoreCancelled={loadMoreCancelled}
              hasMoreCompleted={hasMoreCompleted}
              hasMoreCancelled={hasMoreCancelled}
              loadingMore={loadingMore}
            />
          </div>
        </div>

        <AgentSidebar
          agents={agents}
          getRelativeTime={getRelativeTime}
          getStatusBadgeClass={getStatusBadgeClass}
          onEvictAgent={handleEvictAgent}
          t={t}
        />
      </div>
    </div>
  );
}
