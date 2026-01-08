import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListChecks, Skull, Search, Filter, MessageSquare, ChevronDown, ChevronUp, RefreshCw, XCircle, Power, Sun, Moon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { KanbanBoard } from './KanbanBoard';
import { ActivityFeed } from '@/components/ActivityFeed';
import { useTheme } from '@/contexts/ThemeContext';

// Types
interface Agent {
  id: string;
  role: string;
  displayName: string;
  status: 'OFFLINE' | 'WAITING' | 'PROCESSING';
  lastSeen?: number;
  currentTasks?: string[];
}

interface Task {
  id: string;
  command: string;
  prompt: string;
  status: string;
  text?: string; // For history items
  toAgentId?: string;
  toAgentRole?: string;
  response?: Record<string, unknown>;
  context?: Record<string, unknown>;
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  messages?: { timestamp: number; role: string; content: string }[];
  createdAt?: number;
  completedAt?: number;
}

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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Task[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Task[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('waaah_sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Persist Sidebar State
  useEffect(() => {
    localStorage.setItem('waaah_sidebar_open', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  // History State
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

  const [botCount, setBotCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [connected, setConnected] = useState(true);

  // Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reviewDiff, setReviewDiff] = useState<string>('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      const [agentsRes, tasksRes, botRes, statsRes, recentRes, cancelledRes] = await Promise.all([
        fetch('/admin/agents/status'),
        fetch('/admin/tasks'),
        fetch('/admin/bot/status'),
        fetch('/admin/stats'),
        fetch('/admin/tasks/history?limit=10&status=COMPLETED'),
        fetch('/admin/tasks/history?limit=10&status=CANCELLED,FAILED')
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (botRes.ok) {
        const data = await botRes.json();
        setBotCount(data.count);
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (recentRes.ok) setRecentCompleted(await recentRes.json());
      if (cancelledRes.ok) setRecentCancelled(await cancelledRes.json());

      setConnected(true);
    } catch (e) {
      console.error('Fetch error:', e);
      setConnected(false);
    }
  };

  // Poll for live data (agents, active tasks)
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Filter Active Tasks: Exclude terminal states
  const activeTasks = tasks.filter(t => !['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(t.status));

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

      const res = await fetch(`/admin/tasks/history?${queryParams.toString()}`);

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

  // Task Actions
  const handleCancelTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/admin/tasks/${id}/cancel`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to cancel task", error);
    }
  };

  const handleRetryTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/admin/tasks/${id}/retry`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to retry task", error);
    }
  };

  const handleEvictAgent = async (e: React.MouseEvent, id: string) => {
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
  };

  // Task Click Handler (Opens Generic Modal)
  const handleTaskClick = async (task: Task) => {
    setSelectedTask(task);

    // If it's a generic task, we might want to fetch fresh details if they are missing
    // But for now, we rely on the task object passed in.

    // If IN_REVIEW, pre-load diff
    if (['REVIEW', 'IN_REVIEW'].includes(task.status)) {
      setReviewLoading(true);
      setReviewDiff('Loading diff...');
      try {
        const res = await fetch(`/admin/tasks/${task.id}/diff`);
        if (res.ok) {
          const data = await res.json();
          setReviewDiff(data.diff || 'No diff returned.');
        } else {
          setReviewDiff('Failed to fetch diff.');
        }
      } catch (e) {
        setReviewDiff('Error loading diff.');
      } finally {
        setReviewLoading(false);
      }
    }
  };

  const handleApproveReview = async () => {
    if (!selectedTask) return;
    try {
      await fetch(`/admin/tasks/${selectedTask.id}/approve`, { method: 'POST' });
      setSelectedTask(null);
      fetchData();
    } catch (e) {
      alert('Failed to approve task');
    }
  };

  const handleRejectReview = async () => {
    if (!selectedTask) return;
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;

    try {
      await fetch(`/admin/tasks/${selectedTask.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      setSelectedTask(null);
      fetchData();
    } catch (e) {
      alert('Failed to reject task');
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      await fetch(`/admin/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText })
      });
      setCommentText('');
      // Refresh task details to show new comment
      const res = await fetch(`/admin/tasks/${selectedTask.id}`);
      if (res.ok) {
        const updatedTask = await res.json();
        setSelectedTask(updatedTask);
      }
    } catch (e) {
      alert('Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Helper for status badge style -- CUSTOM COLORS
  const getStatusBadgeClass = (status: string) => {
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
  };

  const formatResponse = (response: Record<string, unknown> | string | null | undefined): string => {
    if (!response) return '';
    if (typeof response === 'string') return response;

    // Check for common output fields in priority order
    if (response.output && typeof response.output === 'string') return response.output;
    if (response.message && typeof response.message === 'string') return response.message;
    if (response.content && typeof response.content === 'string') return response.content;
    if (response.error && typeof response.error === 'string') return `ERROR: ${response.error}`;

    return JSON.stringify(response, null, 2);
  };

  // ... duplicate Task interface removed ...

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
          <p className="font-bold border-l-4 border-primary pl-2 mb-2 text-foreground">{task.command}</p>

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
          <Badge variant={connected ? "default" : "destructive"} className="gap-2 text-lg px-4 py-1 border-2 border-primary">
            <span className={`inline-block h-3 w-3 ${connected ? 'bg-primary-foreground' : 'bg-primary-foreground'} animate-ping mr-2`}></span>
            {connected ? (
              botCount === 0 ? t('ZERO_BOYZ') : (
                theme === 'WAAAH'
                  ? `${t('SIGNAL_CONNECTED')}\u00a0\u00a0(${botCount})`
                  : `${botCount} ${t('SIGNAL_CONNECTED')}`
              )
            ) : t('DISCONNECTED')}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="ml-2 text-primary hover:bg-primary/10">
            {isSidebarOpen ? <PanelLeftClose className="h-6 w-6" /> : <PanelLeftOpen className="h-6 w-6" />}
          </Button>
        </div>
      </header>

      {/* 2. Main Content Area (Flex Row) */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Main Tabs Area (Scrollable within tabs) */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col bg-background">

          {/* Overview Stats */}


          {/* Tabs Content - Main Part, Flex 1 to take remaining space */}
          <div className="flex-1 min-h-0 flex flex-col">
            <Tabs defaultValue="kanban" className="flex flex-col h-full space-y-6">
              <TabsList className="bg-transparent border-b-2 border-primary w-full justify-start rounded-none p-0 h-auto gap-0 flex-none">
                <TabsTrigger value="kanban" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2">KANBAN</TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2">{t('TASKS_TITLE').toLowerCase()} ({activeTasks.length})</TabsTrigger>
                <TabsTrigger value="history" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2">{t('HISTORY_TITLE').toLowerCase()}</TabsTrigger>
                <TabsTrigger value="logs" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {t('LOGS_TITLE').toLowerCase()}</TabsTrigger>
              </TabsList>

              {/* KANBAN TAB */}
              <TabsContent value="kanban" className="flex-1 overflow-hidden m-0 pt-4 h-full">
                <KanbanBoard
                  tasks={[...activeTasks]}
                  completedTasks={recentCompleted}
                  cancelledTasks={recentCancelled}
                  onCancelTask={handleCancelTask}
                  onRetryTask={handleRetryTask}
                  onViewHistory={() => document.getElementById('tab-trigger-history')?.click() || (document.querySelector('[value="history"]') as HTMLElement)?.click()}
                  onTaskClick={handleTaskClick}
                />
              </TabsContent>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="flex-1 overflow-y-auto m-0 pt-4 pr-2 scrollbar-thin scrollbar-thumb-primary scrollbar-track-black space-y-4">
                {activeTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-primary/50 text-primary/50 bg-primary/5">
                    <ListChecks className="h-8 w-8 mb-3 opacity-50" />
                    <p>{t('NO_TASKS')}</p>
                  </div>
                )}
                {activeTasks.map(task => renderTaskCard(task))}
              </TabsContent>

              {/* HISTORY TAB */}
              <TabsContent value="history" className="flex-1 overflow-y-auto m-0 pt-4 pr-2 scrollbar-thin scrollbar-thumb-primary scrollbar-track-black space-y-4">

                {/* Search and Filter Controls */}
                <div className="flex flex-col md:flex-row gap-4 mb-6 border-b border-primary/30 pb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                    <input
                      type="text"
                      placeholder="SEARCH SCRIBBLINGS..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-input border-2 border-primary/30 p-2 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(57,255,20,0.3)] transition-all font-mono uppercase"
                    />
                  </div>

                  <div className="relative w-full md:w-64">
                    <Filter className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-input border-2 border-primary/30 p-2 pl-10 text-foreground focus:outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(57,255,20,0.3)] appearance-none cursor-pointer font-mono uppercase"
                    >
                      <option value="ALL">ALL FINISHED</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="FAILED">FAILED</option>
                      <option value="BLOCKED">BLOCKED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                    <div className="absolute right-3 top-3 pointer-events-none text-primary/50">▼</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {history.length === 0 && !isHistoryLoading && (
                    <div className="text-center p-12 border-2 border-dashed border-primary/50 text-primary/50">
                      {t('NO_HISTORY')}
                    </div>
                  )}

                  {history.map(task => renderTaskCard(task))}

                  {/* Loading Skeletons */}
                  {isHistoryLoading && (
                    <div className="space-y-2">
                      <TaskSkeleton />
                      <TaskSkeleton />
                    </div>
                  )}

                  {/* Intersection Observer Sentinel */}
                  <div ref={observerTarget} className="h-4 w-full" />

                  {!historyHasMore && history.length > 0 && (
                    <div className="text-center text-xs text-primary/50 py-4 border-t border-primary/20 mt-4">END OF SCRIBBLINGS</div>
                  )}
                </div>
              </TabsContent>

              {/* LOGS TAB */}
              <TabsContent value="logs" className="flex-1 min-h-0 flex flex-col m-0 pt-4 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden border-2 border-primary/20">
                  <ActivityFeed />
                </div>
              </TabsContent>

            </Tabs>
          </div>
        </div>

        {/* Right: Sidebar (Collapsible) */}
        <div className={`${isSidebarOpen ? 'w-96 border-l-2' : 'w-0 border-l-0'} transition-all duration-300 border-primary bg-card flex flex-col h-full overflow-hidden`}>

          {/* 1. Agent Status (Occupies full height of sidebar now, or just flexible) */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-primary scrollbar-track-black">
            <h2 className="text-lg font-black tracking-widest text-primary mb-4 border-b border-primary pb-2 flex items-center justify-between sticky top-0 bg-card z-10">
              {t('AGENTS_TITLE')}
              <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-sm">{agents.length}</span>
            </h2>
            <div className="space-y-3">
              {agents.length === 0 && <div className="text-sm text-primary/50 italic">NO AGENTS AROUND...</div>}
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between p-3 border-2 border-primary/50 hover:border-primary bg-card hover:bg-primary/10 transition-all cursor-pointer group hover:translate-x-1">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-primary group-hover:text-foreground transition-colors">{agent.displayName || agent.id}</div>
                    <div className="text-xs text-primary/60 font-mono tracking-tighter">[{agent.role}]</div>
                    {agent.currentTasks && agent.currentTasks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.currentTasks.map(taskId => (
                          <Badge key={taskId} variant="outline" className="text-[10px] h-4 px-1 border-primary/50 text-primary/80 font-mono bg-black/20">
                            {taskId}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusBadgeClass(agent.status)} ${agent.status === 'PROCESSING' ? 'animate-pulse' : ''}`}>
                      {agent.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 bg-white text-black hover:bg-blue-500 hover:text-white transition-all rounded-sm"
                      onClick={(e) => handleEvictAgent(e, agent.id)}
                      title="Shutdown Agent"
                    >
                      <Power className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Task Modal Overlay */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <div className="bg-card border-2 border-primary w-full max-w-4xl max-h-[90vh] flex flex-col shadow-lg shadow-primary/20" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-primary flex justify-between items-center bg-primary/10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Search className="h-5 w-5" /> TASK: {selectedTask.id}
                <Badge className={getStatusBadgeClass(selectedTask.status)}>{selectedTask.status}</Badge>
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setSelectedTask(null)}>
                <XCircle className="h-6 w-6 text-primary/70 hover:text-primary" />
              </Button>
            </div>

            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-2 border-b border-primary/30">
                <TabsList className="bg-transparent w-full justify-start rounded-none p-0 h-auto gap-4">
                  <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-4 py-2" onClick={e => e.stopPropagation()}>DETAILS</TabsTrigger>
                  <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-4 py-2" onClick={e => e.stopPropagation()}>TIMELINE</TabsTrigger>
                  {['REVIEW', 'IN_REVIEW', 'BLOCKED'].includes(selectedTask.status) && (
                    <TabsTrigger value="review" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-4 py-2" onClick={e => e.stopPropagation()}>REVIEW</TabsTrigger>
                  )}
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-0">
                {/* DETAILS TAB */}
                <TabsContent value="details" className="p-6 space-y-4 m-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-primary/30 bg-black/40">
                      <h3 className="text-sm font-bold opacity-70 mb-2">PROMPT</h3>
                      <p className="whitespace-pre-wrap text-sm">{selectedTask.prompt}</p>
                    </div>
                    <div className="p-4 border border-primary/30 bg-black/40">
                      <h3 className="text-sm font-bold opacity-70 mb-2">OUTPUT SUMMARY</h3>
                      <div className="text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {formatResponse(selectedTask.response)}
                      </div>
                    </div>
                  </div>
                  {selectedTask.context && (
                    <div className="p-4 border border-primary/30 bg-black/40">
                      <h3 className="text-sm font-bold opacity-70 mb-2">CONTEXT</h3>
                      <pre className="text-xs text-primary/70 overflow-x-auto">{JSON.stringify(selectedTask.context, null, 2)}</pre>
                    </div>
                  )}
                </TabsContent>

                {/* TIMELINE TAB */}
                <TabsContent value="timeline" className="p-6 space-y-4 m-0 min-h-[200px]">
                  <div className="space-y-4 border-l-2 border-primary/20 ml-2 pl-6">
                    {/* Combine History and Messages */}
                    {(() => {
                      const events = [
                        ...(selectedTask.history || []).map(h => ({ ...h, type: 'status' })),
                        ...(selectedTask.messages || []).map(m => ({ ...m, type: 'message' }))
                      ].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

                      if (events.length === 0) return <div className="italic text-primary/50">No history available for this task.</div>;

                      return events.map((event: any, i) => (
                        <div key={i} className="relative">
                          <div className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-background ${event.type === 'status' ? 'bg-primary' : 'bg-primary/50'}`}></div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs opacity-50 font-mono">
                              <span>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'}</span>
                              {event.type === 'status' && <Badge variant="outline" className="text-[10px] h-4 px-1">{event.status}</Badge>}
                              <span className="font-bold">{event.agentId || (event.role ? event.role.toUpperCase() : 'SYSTEM')}</span>
                            </div>
                            <div className={`text-sm ${event.type === 'status' ? 'font-bold' : ''}`}>
                              {event.message || event.content}
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Add Comment Input */}
                  <div className="mt-4 pt-4 border-t border-primary/20">
                    <label className="text-xs font-bold text-primary/70 block mb-2">ADD COMMENT</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        placeholder="Type your comment..."
                        className="flex-1 bg-input border border-primary/30 p-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                        disabled={isSubmittingComment}
                      />
                      <Button
                        onClick={handleAddComment}
                        disabled={!commentText.trim() || isSubmittingComment}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-4"
                      >
                        {isSubmittingComment ? 'Adding...' : 'Add Comment'}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* REVIEW TAB */}
                <TabsContent value="review" className="p-6 space-y-4 m-0">
                  <div>
                    <h3 className="text-sm font-bold opacity-70 mb-2 flex items-center gap-2">
                      GIT DIFF <span className="text-xs opacity-50 font-normal">(main...feature/{selectedTask.id})</span>
                    </h3>
                    <div className={`p-4 bg-black border border-primary/50 font-mono text-xs overflow-x-auto whitespace-pre ${reviewLoading ? 'animate-pulse opacity-50' : ''}`}>
                      {reviewDiff}
                    </div>
                  </div>
                  <div className="p-4 border-t border-primary/30 bg-primary/5 flex justify-end gap-3 mt-4">
                    <Button variant="destructive" onClick={handleRejectReview} className="bg-red-600 hover:bg-red-700 text-white font-bold border border-red-800">
                      REJECT / REQUEST CHANGES
                    </Button>
                    <Button onClick={handleApproveReview} className="bg-green-600 hover:bg-green-700 text-white font-bold border border-green-800">
                      APPROVE & MERGE
                    </Button>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
