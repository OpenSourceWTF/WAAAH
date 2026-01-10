import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, PanelLeftClose, PanelLeftOpen, Pin, Cpu, Power, ChevronDown, ChevronUp } from 'lucide-react';
import type { TextKey } from '@/contexts/ThemeContext';

interface Agent {
  id: string;
  displayName?: string;
  role: string;
  status: string;
  currentTasks?: string[];
  lastSeen?: number;
  createdAt?: number;
  capabilities?: string[];
}

interface AgentSidebarProps {
  agents: Agent[];
  getRelativeTime: (timestamp: number | undefined) => string;
  getStatusBadgeClass: (status: string) => string;
  onEvictAgent: (e: React.MouseEvent, id: string) => void;
  t: (key: TextKey) => string;
}

export function AgentSidebar({
  agents,
  getRelativeTime,
  getStatusBadgeClass,
  onEvictAgent,
  t
}: AgentSidebarProps) {
  // Sidebar state
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [pinnedAgents, setPinnedAgents] = useState<Set<string>>(new Set());
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const toggleAgentPin = useCallback((agentId: string) => {
    setPinnedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const getIndicatorColor = useCallback((agent: Agent) => {
    if (agent.status === 'OFFLINE') return 'border-gray-500 bg-gray-500/20';
    if (agent.status === 'PROCESSING') return 'border-yellow-400 bg-yellow-400/20 animate-pulse';
    const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
    if (lastSeenMs > 60000) return 'border-red-500 bg-red-500/20';
    return 'border-green-500 bg-green-500/20';
  }, []);

  const getInitials = useCallback((agent: Agent) => {
    const name = agent.displayName || agent.id;
    const words = name.split(/[\s-_]+/);
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }, []);

  return (
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
        <div className="flex-1 overflow-hidden py-2 px-2 scrollbar-none">
          <div className="flex flex-col items-center gap-2">
            {agents.length === 0 && (
              <div className="w-10 h-10 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                <span className="text-primary/30 text-xs">?</span>
              </div>
            )}
            {agents.map(agent => {
              const currentTask = agent.currentTasks && agent.currentTasks.length > 0
                ? agent.currentTasks[agent.currentTasks.length - 1] : null;

              return (
                <div key={agent.id} className="relative group">
                  <div
                    className={`w-10 h-10 border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:shadow-[0_0_15px_hsl(var(--glow)/0.5)] ${getIndicatorColor(agent)}`}
                    onClick={() => setIsSidebarExpanded(true)}
                  >
                    <span className="text-xs font-bold text-foreground">{getInitials(agent)}</span>
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
        <div className="flex-1 overflow-y-auto scrollbar-none p-3">
          <div className="space-y-2">
            {agents.length === 0 && (
              <div className="w-full p-3 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                <span className="text-primary/30 text-sm">NO AGENTS</span>
              </div>
            )}
            {agents.map(agent => {
              const isExpanded = pinnedAgents.has(agent.id) || hoveredAgent === agent.id;
              const currentTask = agent.currentTasks && agent.currentTasks.length > 0
                ? agent.currentTasks[agent.currentTasks.length - 1] : null;

              return (
                <div
                  key={agent.id}
                  className={`border-2 transition-all duration-200 cursor-pointer ${isExpanded ? 'border-primary bg-primary/5' : 'border-primary/30 bg-card hover:border-primary/60'}`}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  onClick={() => toggleAgentPin(agent.id)}
                >
                  {/* Collapsed Card Header */}
                  <div className="p-2 flex items-center gap-2">
                    <div className={`w-8 h-8 border-2 rounded-sm flex items-center justify-center shrink-0 ${getIndicatorColor(agent)}`}>
                      <span className="text-xs font-bold text-foreground">{getInitials(agent)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-primary truncate">{agent.displayName || agent.id}</span>
                        {pinnedAgents.has(agent.id) && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      </div>
                      <div className="text-[10px] text-primary/60 font-mono">[{agent.role}]</div>
                    </div>
                    <Badge className={`${getStatusBadgeClass(agent.status)} text-[10px] shrink-0`}>{agent.status}</Badge>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-primary shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-primary/50 shrink-0" />}
                  </div>

                  {/* Expanded Content */}
                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-2 pb-2 pt-1 border-t border-primary/20 bg-primary/5 space-y-2">
                      {/* Time Info */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-primary/70">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Created: {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'Unknown'}</span>
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
                            {agent.capabilities.slice(0, 5).map(cap => (
                              <span key={cap} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20">
                                {cap}
                              </span>
                            ))}
                            {agent.capabilities.length > 5 && (
                              <span className="text-[9px] text-primary/50">+{agent.capabilities.length - 5} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-primary/40 italic">None listed</span>
                        )}
                      </div>

                      {/* Current Task */}
                      {currentTask && (
                        <div>
                          <div className="text-[10px] text-primary/50 uppercase mb-1">Current Task:</div>
                          <div className="text-xs text-foreground font-mono bg-black/20 p-2 border border-primary/20 truncate">
                            {currentTask}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex justify-end pt-2 border-t border-primary/20">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 gap-1 text-[10px] font-mono uppercase bg-red-600 hover:bg-red-700"
                          onClick={(e) => onEvictAgent(e, agent.id)}
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
  );
}
