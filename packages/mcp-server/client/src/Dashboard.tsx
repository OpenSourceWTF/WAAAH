import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Tabs removed - KanbanBoard is now the sole/primary view
import { Skull, ChevronDown, ChevronUp, RefreshCw, XCircle, Power, Sun, Moon, Clock, PanelLeftClose, PanelLeftOpen, Pin, Cpu } from "lucide-react";
import { KanbanBoard } from './KanbanBoard';
import { useTheme } from '@/contexts/ThemeContext';
import { useTaskData, useAgentData, type Task } from './hooks';

// Types imported from hooks
// Agent and Task types are now in hooks/useAgentData.ts and hooks/useTaskData.ts

function TaskSkeleton() {
  return (
    <div className="border border-primary bg-card text-primary p-4 space-y-2 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-primary/20 rounded-none"></div>
        <div className="h-4 w-16 bg-primary/20 rounded-none"></div>
      </div>
      <div className="space-y-1 pt-2">
        <div className="h-4 w-3/4 bg-primary/20 rounded-none"></div>
        <div className="h-3 w-1/2 bg-primary/20 rounded-none"></div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { theme, setTheme, t } = useTheme();

  // Use custom hooks for data fetching with deduplication (prevents animation interruption)
  const {
    activeTasks,
    recentCompleted,
    recentCancelled,
    stats,
    connected,
    refetch: refetchTasks  // Used by handlers after mutations
  } = useTaskData(2000);

  const {
    agents,
    getRelativeTime,
    refetch: refetchAgents
  } = useAgentData(2000);

  // Combined refetch for backward compatibility with fetchData calls
  const fetchData = useCallback(() => {
    refetchTasks();
    refetchAgents();
  }, [refetchTasks, refetchAgents]);



  // History State (kept inline for now - infinite scroll logic is complex)
  const [history, setHistory] = useState<Task[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const observerTarget = useRef(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Expandable Cards State
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Sidebar collapsed/expanded state (collapsed = indicator bar only, expanded = overlay panel)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);

  // Agent pin/hover state for expanded view
  const [pinnedAgents, setPinnedAgents] = useState<Set<string>>(new Set());
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Infinite Scroll Fetch Logic
  const fetchHistory = useCallback(async (isInitial = false) => {
    if (isHistoryLoading || (!historyHasMore && !isInitial)) return;

    setIsHistoryLoading(true);
    try {
      const currentOffset = isInitial ? 0 : historyOffset;
      const limit = 20;

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString()
      });

      if (debouncedSearch) queryParams.append('q', debouncedSearch);

      // Strict Partition: History only shows terminal states by default
      if (statusFilter === 'ALL') {
        queryParams.append('status', 'COMPLETED,FAILED,BLOCKED,CANCELLED');
      } else {
        queryParams.append('status', statusFilter);
      }

      const res = await fetch(`/admin/tasks?${queryParams.toString()}`);

      if (res.ok) {
        const newItems = await res.json();

        if (isInitial) {
          setHistory(newItems);
          setHistoryOffset(limit);
        } else {
          setHistory(prev => [...prev, ...newItems]);
          setHistoryOffset(prev => prev + limit);
        }

        setHistoryHasMore(newItems.length === limit);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [historyOffset, historyHasMore, isHistoryLoading, debouncedSearch, statusFilter]);

  // Refetch when filters change
  useEffect(() => {
    setHistory([]);
    setHistoryOffset(0);
    setHistoryHasMore(true);
    fetchHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

  // Intersection Observer
  useEffect(() => {
    const currentTarget = observerTarget.current;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && historyHasMore) {
          fetchHistory();
        }
      },
      { threshold: 0.1 }
    );

    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [fetchHistory, historyHasMore]);

  // Task Actions - wrapped with useCallback for stable references
  const handleCancelTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/admin/tasks/${id}/cancel`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to cancel task", error);
    }
  }, []);

  const handleRetryTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/admin/tasks/${id}/retry`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to retry task", error);
    }
  }, []);

  const handleEvictAgent = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to SHUTDOWN agent ${id}?`)) return;

    try {
      await fetch('/admin/evict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, reason: 'Admin Shutdown via Dashboard', action: 'SHUTDOWN' })
      });
      fetchData();
    } catch (error) {
      console.error("Failed to evict agent", error);
    }
  }, []);

  const handleApproveTask = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/admin/tasks/${taskId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      console.log(`Task ${taskId} approved`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to approve task", error);
    }
  }, []);

  const handleRejectTask = useCallback(async (taskId: string, feedback: string) => {
    try {
      const res = await fetch(`/admin/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback })
      });
      if (!res.ok) throw new Error('Failed to reject');
      console.log(`Task ${taskId} rejected with feedback: ${feedback}`);
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to reject task", error);
    }
  }, []);

  const handleSendComment = useCallback(async (taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]) => {
    try {
      const res = await fetch(`/admin/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyTo, images })
      });
      if (!res.ok) throw new Error('Failed to send comment');
      console.log(`Comment sent to task ${taskId}${replyTo ? ` (reply to ${replyTo})` : ''}${images?.length ? ` with ${images.length} images` : ''}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to send comment", error);
    }
  }, [fetchData]);

  const handleAddReviewComment = useCallback(async (taskId: string, filePath: string, lineNumber: number | null, content: string) => {
    try {
      const res = await fetch(`/admin/tasks/${taskId}/review-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, lineNumber, content })
      });
      if (!res.ok) throw new Error('Failed to add review comment');
      console.log(`Review comment added to ${filePath}:${lineNumber || 'file'}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to add review comment", error);
    }
  }, []);

  // Task click handler removed - KanbanBoard handles expansion inline

  // handleApproveReview, handleRejectReview, handleAddComment removed - KanbanBoard handles actions

  // Helper for status badge style -- CUSTOM COLORS (memoized)
  const getStatusBadgeClass = useCallback((status: string) => {
    const base = "text-xs font-bold px-2 py-1 border border-black";
    switch (status) {
      case 'COMPLETED': return `${base} bg-green-600 text-white border-green-800`;
      case 'FAILED':
      case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`;
      case 'ASSIGNED':
      case 'IN_PROGRESS':
      case 'PROCESSING': return `${base} bg-blue-600 text-white border-blue-800`;
      case 'QUEUED':
      case 'PENDING_ACK':
      case 'WAITING': return `${base} bg-yellow-500 text-black border-yellow-700`;
      case 'BLOCKED':
      case 'PENDING':
      case 'PENDING_RES':
      case 'REVIEW':
      case 'IN_REVIEW': return `${base} bg-white text-black border-gray-400`;
      default: return `${base} bg-gray-600 text-white`;
    }
  }, []);

  const formatResponse = useCallback((response: Record<string, unknown> | string | null | undefined): string => {
    if (!response) return '';
    if (typeof response === 'string') return response;

    // Check for common output fields in priority order
    if (response.output && typeof response.output === 'string') return response.output;
    if (response.message && typeof response.message === 'string') return response.message;
    if (response.content && typeof response.content === 'string') return response.content;
    if (response.error && typeof response.error === 'string') return `ERROR: ${response.error}`;

    return JSON.stringify(response, null, 2);
  }, []);

  // ... duplicate Task interface removed ...

  // Handler for viewing history tab from KanbanBoard
  const handleViewHistory = useCallback(() => {
    document.getElementById('tab-trigger-history')?.click() ||
      (document.querySelector('[value="history"]') as HTMLElement)?.click();
  }, []);

  // ... existing code ...

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const getDuration = (start?: number, end?: number) => {
    if (!start) return '';
    const endTime = end || Date.now();
    const diff = Math.max(0, endTime - start);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 60) {
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m`;
    }
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Format task title: task.title || truncated prompt || command
  const formatTaskTitle = (task: Task) => {
    if (task.title) return task.title;
    if (task.prompt) {
      const firstLine = task.prompt.split('\n')[0].trim();
      return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
    }
    return task.command || 'Untitled Task';
  };

  // Toggle Task Expansion
  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Toggle agent pin for expanded view
  const toggleAgentPin = (agentId: string) => {
    setPinnedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  // getRelativeTime is now provided by useAgentData hook

  const renderTaskCard = (task: Task) => {
    const isExpanded = expandedTasks.has(task.id);

    const canCancel = ['QUEUED', 'ASSIGNED', 'PROCESSING', 'PENDING_ACK'].includes(task.status);
    const canRetry = ['FAILED', 'CANCELLED', 'ASSIGNED', 'QUEUED', 'PENDING_ACK'].includes(task.status);

    return (
      <Card key={task.id}
        onClick={() => toggleTask(task.id)}
        className="border-2 border-primary bg-card shadow-sm hover:bg-primary/5 transition-colors cursor-pointer group rounded-none mb-3 last:mb-0">
        <CardHeader className="p-4 pb-2 border-b border-primary/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground px-1 text-xs">{t('ID_LABEL')}</span> {task.id}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-4 text-sm font-mono text-primary/80">
          <p className="font-bold border-l-4 border-primary pl-2 mb-2 text-foreground">{formatTaskTitle(task)}</p>

          <div className="flex justify-between items-center text-[10px] text-primary/50 mb-2 font-mono">
            {task.createdAt && <span>Created: {formatDate(task.createdAt)}</span>}
            {(!['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) && task.createdAt) && (
              <span className="text-blue-500">Run: {getDuration(task.createdAt)}</span>
            )}
            {(['COMPLETED', 'FAILED'].includes(task.status) && task.completedAt && task.createdAt) && (
              <span>Duration: {getDuration(task.createdAt, task.completedAt)}</span>
            )}
          </div>

          {/* Expanded Content */}
          {isExpanded ? (
            <div className="mt-4 space-y-4 border-t border-primary/20 pt-4 bg-primary/5 -mx-4 px-4 pb-2">
              <div>
                <span className="text-xs text-primary/50 block mb-1">FULL PROMPT:</span>
                <p className="text-foreground whitespace-pre-wrap">{task.prompt}</p>
              </div>

              {(task.toAgentId || task.toAgentRole) && (
                <div>
                  <span className="text-xs text-primary/50 block mb-1">ASSIGNED TO:</span>
                  <div className="flex items-center gap-2">
                    {task.toAgentId && <Badge variant="outline" className="border-primary text-primary">{task.toAgentId}</Badge>}
                    {task.toAgentRole && <Badge variant="outline" className="border-primary/50 text-primary/70">{task.toAgentRole}</Badge>}
                  </div>
                </div>
              )}

              {task.response && (
                <div>
                  <span className="text-xs text-primary/50 block mb-1">RESPONSE PAYLOAD:</span>
                  <pre className="top-0 p-2 bg-muted border border-primary/20 text-xs text-primary whitespace-pre-wrap break-words font-mono">
                    {formatResponse(task.response)}
                  </pre>
                </div>
              )}

              {/* Timestamps Detail */}
              <div className="grid grid-cols-2 gap-2 text-xs text-primary/60 border-t border-primary/10 pt-2">
                {task.createdAt && <div>Created: {new Date(task.createdAt).toLocaleString()}</div>}
                {task.completedAt && <div>Completed: {new Date(task.completedAt).toLocaleString()}</div>}
              </div>

              {/* Action Buttons */}
              {(canCancel || canRetry) && (
                <div className="flex justify-end gap-2 pt-2 border-t border-primary/20 mt-2">
                  {canCancel && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-2 font-mono uppercase bg-red-600 hover:bg-red-700 text-white"
                      onClick={(e) => handleCancelTask(e, task.id)}
                    >
                      <XCircle className="h-4 w-4" /> Cancel Task
                    </Button>
                  )}
                  {canRetry && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2 font-mono uppercase border-primary text-primary hover:bg-primary hover:text-black"
                      onClick={(e) => handleRetryTask(e, task.id)}
                    >
                      <RefreshCw className="h-4 w-4" /> Retry
                    </Button>
                  )}
                </div>
              )}

            </div>
          ) : (
            <p className="opacity-80 line-clamp-2 italic">"{task.prompt}"</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-primary uppercase font-mono tracking-wider">
      {/* 1. Header (Sticky Top) */}
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

      {/* 2. Main Content Area (Flex Row) */}
      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* Left: Main Tabs Area (Scrollable within tabs) */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col bg-background min-w-0">

          {/* Overview Stats */}


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
            />
          </div>
        </div>

        {/* Right: Agent Sidebar (Inline expanding - pushes content) */}
        <div
          className={`border-l-2 border-primary bg-card flex flex-col h-full transition-all duration-300 ${(isSidebarExpanded || isSidebarPinned) ? 'w-80' : 'w-14'}`}
          onMouseEnter={() => setIsSidebarExpanded(true)}
          onMouseLeave={() => { if (!isSidebarPinned) setIsSidebarExpanded(false); }}
        >
          {/* Header / Toggle */}
          <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-primary/30 bg-primary/10">
            {(isSidebarExpanded || isSidebarPinned) && (
              <h2 className="text-sm font-black tracking-widest text-primary flex items-center gap-2">
                {t('AGENTS_TITLE')}
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">{agents.length}</span>
              </h2>
            )}
            <button
              onClick={() => {
                if (isSidebarPinned) {
                  setIsSidebarPinned(false);
                  setIsSidebarExpanded(false);
                } else {
                  setIsSidebarPinned(true);
                  setIsSidebarExpanded(true);
                }
              }}
              className={`w-10 h-10 flex items-center justify-center hover:bg-primary/20 transition-colors rounded-sm border-2 ${isSidebarPinned ? 'bg-primary/20 border-primary' : 'border-transparent'} ${!(isSidebarExpanded || isSidebarPinned) ? 'mx-auto' : 'ml-auto'}`}
              title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
            >
              {(isSidebarExpanded || isSidebarPinned)
                ? <PanelLeftClose className={`h-4 w-4 ${isSidebarPinned ? 'text-foreground' : 'text-primary'}`} />
                : <PanelLeftOpen className="h-4 w-4 text-primary" />}
            </button>
          </div>

          {/* Collapsed View: Agent Indicators */}
          {!(isSidebarExpanded || isSidebarPinned) && (
            <div className="flex-1 overflow-y-auto py-2 px-2">
              <div className="flex flex-col items-center gap-2">
                {agents.length === 0 && (
                  <div className="w-10 h-10 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                    <span className="text-primary/30 text-xs">?</span>
                  </div>
                )}
                {agents.map(agent => {
                  const getIndicatorColor = () => {
                    if (agent.status === 'OFFLINE') return 'border-gray-500 bg-gray-500/20';
                    if (agent.status === 'PROCESSING') return 'border-yellow-400 bg-yellow-400/20 animate-pulse';
                    const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
                    if (lastSeenMs > 60000) return 'border-red-500 bg-red-500/20';
                    return 'border-green-500 bg-green-500/20';
                  };

                  const currentTask = agent.currentTasks && agent.currentTasks.length > 0
                    ? agent.currentTasks[agent.currentTasks.length - 1] : null;

                  const getInitials = () => {
                    const name = agent.displayName || agent.id;
                    const words = name.split(/[\s-_]+/);
                    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
                    return name.substring(0, 2).toUpperCase();
                  };

                  return (
                    <div key={agent.id} className="relative group">
                      <div
                        className={`w-10 h-10 border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:shadow-[0_0_15px_hsl(var(--glow)/0.5)] ${getIndicatorColor()}`}
                        onClick={() => setIsSidebarExpanded(true)}
                      >
                        <span className="text-xs font-bold text-foreground">{getInitials()}</span>
                      </div>
                      {/* Tooltip */}
                      <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                        <div className="bg-card border-2 border-primary p-3 shadow-lg shadow-primary/20 min-w-[200px] max-w-[280px]">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-bold text-sm text-primary truncate">{agent.displayName || agent.id}</span>
                            <Badge className={`${getStatusBadgeClass(agent.status)} text-[10px] shrink-0`}>{agent.status}</Badge>
                          </div>
                          <div className="text-xs text-primary/60 font-mono mb-2">[{agent.role}]</div>
                          {currentTask && (
                            <div className="border-t border-primary/20 pt-2 mt-2">
                              <div className="text-[10px] text-primary/50 uppercase mb-1">Current Task:</div>
                              <div className="text-xs text-foreground font-mono truncate">{currentTask}</div>
                            </div>
                          )}
                          <div className="text-[10px] text-primary/40 mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />{getRelativeTime(agent.lastSeen)}
                          </div>
                        </div>
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-primary"></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expanded View: Full Agent Cards */}
          {(isSidebarExpanded || isSidebarPinned) && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {agents.length === 0 && (
                  <div className="w-full p-3 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                    <span className="text-primary/30 text-sm">NO AGENTS</span>
                  </div>
                )}
                {agents.map(agent => {
                  const isPinned = pinnedAgents.has(agent.id);
                  const isHovered = hoveredAgent === agent.id;
                  const isExpanded = isPinned || isHovered;

                  return (
                    <div
                      key={agent.id}
                      className={`border-2 transition-all cursor-pointer group ${isPinned
                        ? 'border-primary bg-primary/10 shadow-[0_0_10px_hsl(var(--glow)/0.3)]'
                        : 'border-primary/50 hover:border-primary bg-card hover:bg-primary/10'
                        }`}
                      onClick={() => toggleAgentPin(agent.id)}
                      onMouseEnter={() => setHoveredAgent(agent.id)}
                      onMouseLeave={() => setHoveredAgent(null)}
                    >
                      {/* Header Row */}
                      <div className="flex items-center justify-between p-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-primary group-hover:text-foreground transition-colors truncate">
                              {agent.displayName || agent.id}
                            </span>
                            {isPinned && <Pin className="h-3 w-3 text-primary flex-shrink-0" />}
                          </div>
                          <div className="text-[10px] text-primary/60 font-mono">[{agent.role}]</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Badge className={`${getStatusBadgeClass(agent.status)} text-[10px] ${agent.status === 'PROCESSING' ? 'animate-pulse' : ''}`}>
                            {agent.status}
                          </Badge>
                          {isExpanded ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary opacity-50" />}
                        </div>
                      </div>

                      {/* Expanded Content */}
                      <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-2 pb-2 pt-1 border-t border-primary/20 bg-primary/5 space-y-2">
                          {/* Time Info */}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-primary/70">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>Created: {agent.createdAt ? formatDate(agent.createdAt) : 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Seen: {getRelativeTime(agent.lastSeen)}</span>
                            </div>
                          </div>

                          {/* Capabilities */}
                          <div>
                            <div className="flex items-center gap-1 text-[10px] text-primary/50 mb-1">
                              <Cpu className="h-3 w-3" /><span>CAPABILITIES:</span>
                            </div>
                            {agent.capabilities && agent.capabilities.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {agent.capabilities.map((cap, i) => (
                                  <Badge key={i} variant="outline" className="text-[9px] h-4 px-1 border-primary/30 text-primary/70 bg-black/20 font-mono">
                                    {cap}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-primary/40 italic font-mono">NONE</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex justify-between items-center pt-1 border-t border-primary/10">
                            <div className="text-[9px] text-primary/40 font-mono truncate">{agent.id}</div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 gap-1 bg-white text-black hover:bg-red-500 hover:text-white transition-all rounded-sm text-[10px]"
                              onClick={(e) => handleEvictAgent(e, agent.id)}
                            >
                              <Power className="h-3 w-3" /> Kill
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Task expansion is now handled by KanbanBoard component */}
    </div>
  );
}
