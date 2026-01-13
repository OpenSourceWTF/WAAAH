import { useCallback, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";
import { Skull, Sun, Moon, Search, Plus } from "lucide-react";
import { KanbanBoard } from './KanbanBoard';
import { useTheme } from '@/contexts/ThemeContext';
import { useTaskData, useAgentData } from './hooks';
import { AgentSidebar } from './components/dashboard/AgentSidebar';
import { apiFetch } from './lib/api';
import { getStatusBadgeClass } from './lib/statusColors';
import { TaskCreationForm } from './components/TaskCreationForm';
import type { TaskFormData } from './components/TaskCreationForm';



export function Dashboard() {
  const { theme, setTheme, t } = useTheme();
  // Use toast for API errors
  const { addToast } = useToast();

  // Search state for server-side filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Task creation form visibility
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Task expansion state for header visibility
  const [isTaskExpanded, setIsTaskExpanded] = useState(false);

  // Use custom hooks for data fetching with deduplication (prevents animation interruption)
  const {
    activeTasks,
    recentCompleted,
    recentCancelled,
    stats,
    connected,
    refetch: refetchTasks,
    // Infinite scroll controls
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  } = useTaskData({ search: searchQuery });

  const {
    agents,
    getRelativeTime,
    refetch: refetchAgents
  } = useAgentData();

  // Combined refetch for backward compatibility with fetchData calls
  const fetchData = useCallback(() => {
    refetchTasks();
    refetchAgents();
  }, [refetchTasks, refetchAgents]);

  // Task Actions - wrapped with useCallback for stable references
  const handleCancelTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/cancel`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to cancel task", error);
      addToast("Failed to cancel task", 'error');
    }
  }, []);

  const handleRetryTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/retry`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to retry task", error);
      addToast("Failed to retry task", 'error');
    }
  }, []);

  const handleEvictAgent = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to SHUTDOWN agent ${id}?`)) return;

    try {
      await apiFetch('/admin/evict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, reason: 'Admin Shutdown via Dashboard', action: 'SHUTDOWN' })
      });
      fetchData();
    } catch (error) {
      console.error("Failed to evict agent", error);
      addToast("Failed to evict agent", 'error');
    }
  }, []);

  const handleApproveTask = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      console.log(`Task ${taskId} approved`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to approve task", error);
      addToast("Failed to approve task", 'error');
    }
  }, []);

  const handleRejectTask = useCallback(async (taskId: string, feedback: string) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback })
      });
      if (!res.ok) throw new Error('Failed to reject');
      console.log(`Task ${taskId} rejected with feedback: ${feedback}`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to reject task", error);
      addToast("Failed to reject task", 'error');
    }
  }, []);

  const handleSendComment = useCallback(async (taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyTo, images })
      });
      if (!res.ok) throw new Error('Failed to send comment');
      console.log(`Comment sent to task ${taskId}${replyTo ? ` (reply to ${replyTo})` : ''}${images?.length ? ` with ${images.length} images` : ''}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to send comment", error);
      addToast("Failed to send comment", 'error');
    }
  }, [fetchData]);

  const handleAddReviewComment = useCallback(async (taskId: string, filePath: string, lineNumber: number | null, content: string) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, lineNumber, content })
      });
      if (!res.ok) throw new Error('Failed to add review comment');
      console.log(`Review comment added to ${filePath}:${lineNumber || 'file'}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to add review comment", error);
      addToast("Failed to add review comment", 'error');
    }
  }, []);

  const handleUnblockTask = useCallback(async (taskId: string, reason: string) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) throw new Error('Failed to unblock task');
      console.log(`Task ${taskId} unblocked with reason: ${reason}`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to unblock task", error);
      addToast("Failed to unblock task", 'error');
    }
  }, [fetchData]);

  const handleUpdateTask = useCallback(async (taskId: string, updates: Record<string, any>) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update task');
      console.log(`Task ${taskId} updated`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to update task", error);
    }
  }, [fetchData]);

  // Handle task creation form submission
  const handleCreateTask = useCallback(async (data: TaskFormData) => {
    try {
      // Build the prompt with optional title prefix
      const fullPrompt = data.title
        ? `# ${data.title}\n\n${data.prompt}`
        : data.prompt;

      // Prepare images for API (if any)
      const images = data.images.length > 0
        ? data.images.map(img => ({
          dataUrl: img.dataUrl,
          mimeType: img.file.type,
          name: img.file.name
        }))
        : undefined;

      const res = await apiFetch('/admin/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          priority: data.priority,
          workspaceId: data.workspaceId,
          role: data.capabilities.length > 0 ? data.capabilities : undefined,
          source: 'UI',
          images
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create task');
      }

      console.log('Task created successfully');
      setShowTaskForm(false);
      fetchData(); // Refresh to show new task
    } catch (error) {
      console.error("Failed to create task", error);
      throw error; // Re-throw to show error in form
    }
  }, [fetchData]);

  // Status badge styles - lookup map
  // Status badge styling is now centralized in lib/statusColors.ts

  return (
    <div className="flex flex-col h-screen bg-background text-primary uppercase font-mono tracking-wider">
      {/* 1. Header (Sticky Top) - slides up when task expanded */}
      <header className={`flex-none flex items-center justify-between px-8 py-6 border-b-2 border-primary bg-background z-10 sticky top-0 shadow-[0_0_15px_hsl(var(--glow)/0.3)] transition-all duration-300 ease-out ${isTaskExpanded
        ? '-translate-y-full opacity-0 pointer-events-none'
        : 'translate-y-0 opacity-100'
        }`}>
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

        {/* Search Input - flex-1 to fill available space */}
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
          {/* New Task Button */}
          <Button
            onClick={() => setShowTaskForm(true)}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white border border-green-800"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
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
              onUnblockTask={handleUnblockTask}
              onUpdateTask={handleUpdateTask}
              onLoadMoreCompleted={loadMoreCompleted}
              onLoadMoreCancelled={loadMoreCancelled}
              hasMoreCompleted={hasMoreCompleted}
              hasMoreCancelled={hasMoreCancelled}
              loadingMore={loadingMore}
              searchQuery={searchQuery}
              onExpandChange={setIsTaskExpanded}
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

      {/* Task expansion is now handled by KanbanBoard component */}

      {/* Task Creation Form Modal */}
      {showTaskForm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTaskForm(false);
          }}
        >
          <div className="max-h-[90vh] overflow-y-auto">
            <TaskCreationForm
              onSubmit={handleCreateTask}
              onCancel={() => setShowTaskForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
