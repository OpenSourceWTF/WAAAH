import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, ListChecks, Skull, Search, Filter, MessageSquare, ChevronDown, ChevronUp, RefreshCw, XCircle, Power, Sun, Moon } from "lucide-react";
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
      const [agentsRes, tasksRes, botRes, statsRes] = await Promise.all([
        fetch('/admin/agents/status'),
        fetch('/admin/tasks'),
        fetch('/admin/bot/status'),
        fetch('/admin/stats')
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (botRes.ok) {
        const data = await botRes.json();
        setBotCount(data.count);
      }
      if (statsRes.ok) setStats(await statsRes.json());
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


  // Helper for status badge style -- CUSTOM COLORS
  const getStatusBadgeClass = (status: string) => {
    const base = "text-xs font-bold px-2 py-1 border border-black";
    switch (status) {
      case 'COMPLETED': return `${base} bg-primary text-primary-foreground border-primary`; // Green / White
      case 'FAILED':
      case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`; // Red / White
      case 'PROCESSING': return `${base} bg-cyan-500 text-white border-cyan-700`; // Cyan / White
      case 'ASSIGNED': // Fallthrough
      case 'WAITING': // Fallthrough
      case 'QUEUED': return `${base} bg-yellow-500 text-white border-yellow-700`; // Yellow / White
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
        </div>
      </header>

      {/* 2. Main Content Area (Flex Row) */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Main Tabs Area (Scrollable within tabs) */}
        <div className="flex-1 overflow-hidden p-8 flex flex-col bg-background">

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-none mb-8">
            <Card className="border-2 border-primary bg-background shadow-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-primary/30">
                <CardTitle className="text-sm font-bold text-primary">{t('AGENTS_TITLE')}</CardTitle>
                <Users className="h-6 w-6 text-primary" />
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-4xl font-black tracking-tighter text-shadow-neon">{agents.length}</div>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary bg-background shadow-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-primary/30">
                <CardTitle className="text-sm font-bold text-primary">{t('TASKS_TITLE')}</CardTitle>
                <ListChecks className="h-6 w-6 text-primary" />
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-4xl font-black tracking-tighter text-shadow-neon">{activeTasks.length}</div>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary bg-background shadow-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-primary/30">
                <CardTitle className="text-sm font-bold text-primary">COMPLETED</CardTitle>
                <ListChecks className="h-6 w-6 text-primary" />
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-4xl font-black tracking-tighter text-shadow-neon">{stats.completed} <span className="text-2xl opacity-50">/ {stats.total}</span></div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Content - Main Part, Flex 1 to take remaining space */}
          <div className="flex-1 min-h-0 flex flex-col">
            <Tabs defaultValue="tasks" className="flex flex-col h-full space-y-6">
              <TabsList className="bg-transparent border-b-2 border-primary w-full justify-start rounded-none p-0 h-auto gap-0 flex-none">
                <TabsTrigger value="tasks" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2">{t('TASKS_TITLE').toLowerCase()} ({activeTasks.length})</TabsTrigger>
                <TabsTrigger value="history" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2">{t('HISTORY_TITLE').toLowerCase()}</TabsTrigger>
                <TabsTrigger value="logs" className="rounded-none border-x-2 border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xl px-6 py-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {t('LOGS_TITLE').toLowerCase()}</TabsTrigger>
              </TabsList>

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

        {/* Right: Sidebar (Fixed Width, Flex Column, Scrollable Content) */}
        <div className="w-96 border-l-2 border-primary bg-card flex flex-col h-full overflow-hidden">

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
    </div>
  );
}
