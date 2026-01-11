import { KanbanBoard } from './KanbanBoard';
import { AgentSidebar } from './components/dashboard/AgentSidebar';
import { useDashboard } from './hooks/useDashboard';
import { Header } from './components/dashboard/Header';

export function Dashboard() {
  const {
    theme, setTheme, t,
    searchQuery, setSearchQuery,
    activeTasks, recentCompleted, recentCancelled, stats, connected,
    loadMoreCompleted, loadMoreCancelled, hasMoreCompleted, hasMoreCancelled, loadingMore,
    agents, getRelativeTime,
    handleCancelTask, handleRetryTask, handleEvictAgent, handleApproveTask, 
    handleRejectTask, handleSendComment, handleAddReviewComment,
    getStatusBadgeClass
  } = useDashboard();

  return (
    <div className="flex flex-col h-screen bg-background text-primary uppercase font-mono tracking-wider">
      <Header 
        stats={stats}
        agents={agents}
        activeTasks={activeTasks}
        connected={connected}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        theme={theme}
        setTheme={setTheme}
        t={t}
      />

      {/* 2. Main Content Area (Flex Row) */}
      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* Left: Main Tabs Area (Scrollable within tabs) */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col bg-background min-w-0">

          {/* KanbanBoard - Primary View (tabs removed) */}
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

        {/* Right: Agent Sidebar */}
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