import { useCallback, useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { useTheme } from '@/contexts/ThemeContext';
import { useTaskData, useAgentData } from './hooks';
import { AgentSidebar } from './components/dashboard/AgentSidebar';
import { DashboardHeader } from './components/dashboard/DashboardHeader';
import { useDashboardActions } from './hooks/useDashboardActions';
import { getStatusBadgeClass } from './lib/ui-utils';

export function Dashboard() {
  const { theme, setTheme, t } = useTheme();

  // Search state for server-side filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Use custom hooks for data fetching with deduplication
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

  const {
    agents,
    getRelativeTime,
    refetch: refetchAgents
  } = useAgentData({ pollInterval: 2000 });

  // Combined refetch for backward compatibility
  const fetchData = useCallback(() => {
    refetchTasks();
    refetchAgents();
  }, [refetchTasks, refetchAgents]);

  const actions = useDashboardActions(fetchData);

  return (
    <div className="flex flex-col h-screen bg-background text-primary uppercase font-mono tracking-wider">
      <DashboardHeader
        t={t}
        theme={theme}
        setTheme={setTheme}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        connected={connected}
        activeAgentsCount={agents.filter(a => a.status === 'PROCESSING').length}
        totalAgentsCount={agents.length}
        totalTasks={stats.total}
        completedTasks={stats.completed}
      />

      {/* 2. Main Content Area (Flex Row) */}
      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* Left: Main Tabs Area (Scrollable within tabs) */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col bg-background min-w-0">

          {/* KanbanBoard - Primary View */}
          <div className="flex-1 min-h-0 overflow-hidden pt-4">
            <KanbanBoard
              tasks={activeTasks}
              completedTasks={recentCompleted}
              cancelledTasks={recentCancelled}
              onCancelTask={actions.handleCancelTask}
              onRetryTask={actions.handleRetryTask}
              onApproveTask={actions.handleApproveTask}
              onRejectTask={actions.handleRejectTask}
              onSendComment={actions.handleSendComment}
              onAddReviewComment={actions.handleAddReviewComment}
              onLoadMoreCompleted={loadMoreCompleted}
              onLoadMoreCancelled={loadMoreCancelled}
              hasMoreCompleted={hasMoreCompleted}
              hasMoreCancelled={hasMoreCancelled}
              loadingMore={loadingMore}
            />
          </div>
        </div>

        {/* Right: Agent Sidebar */}
        <AgentSidebar
          agents={agents}
          getRelativeTime={getRelativeTime}
          getStatusBadgeClass={getStatusBadgeClass}
          onEvictAgent={actions.handleEvictAgent}
          t={t}
        />

      </div>
    </div>
  );
}