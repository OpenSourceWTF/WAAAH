import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Square } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTheme } from '@/contexts/ThemeContext';

interface ActivityEvent {
  type: string;
  timestamp: number;
  category: 'AGENT' | 'TASK' | 'SYSTEM' | 'ERROR';
  message: string;
  metadata?: any;
}

export function ActivityFeed() {
  const { t } = useTheme();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [events, autoScroll]);

  useEffect(() => {
    const eventSource = new EventSource('/admin/delegations/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        let newEvent: ActivityEvent | null = null;
        const now = Date.now();

        if (data.type === 'activity') {
          newEvent = data;
        } else if (data.type === 'delegation') {
          newEvent = {
            type: 'delegation',
            timestamp: now,
            category: 'TASK',
            message: `Task delegated: ${data.payload.id} -> ${data.payload.to?.agentId || data.payload.to?.role || 'POOL'}`,
            metadata: data.payload
          };
        } else if (data.type === 'completion') {
          newEvent = {
            type: 'completion',
            timestamp: now,
            category: 'TASK',
            message: `Task completed: ${data.payload.id} [${data.payload.status}]`,
            metadata: data.payload
          };
        }

        if (newEvent) {
          setEvents(prev => [...prev, newEvent!].slice(-100));
        }
      } catch (e) {
        console.error('Failed to parse SSE', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Fetch initial logs
  useEffect(() => {
    fetch('/admin/logs')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEvents(prev => {
            // Dedupe against any events that streamed in while fetching
            const existingSigs = new Set(prev.map(e => `${e.timestamp}-${e.message}`));
            const uniqueHistory = data.filter(e => !existingSigs.has(`${e.timestamp}-${e.message}`));
            // Prepend history (assuming data is oldest->newest)
            return [...uniqueHistory, ...prev].slice(-100);
          });
        }
      })
      .catch(err => console.error('Failed to fetch logs', err));
  }, []);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getColor = (category: string) => {
    switch (category) {
      case 'AGENT': return 'text-primary font-bold'; // Neon Green
      case 'TASK': return 'text-blue-400';
      case 'ERROR': return 'text-red-500 font-bold';
      default: return 'text-foreground opacity-80';
    }
  };

  return (
    <Card className="h-full flex flex-col bg-card border-2 border-primary shadow-[0_0_10px_hsl(var(--glow)/0.2)] rounded-none">
      <CardHeader className="py-2 px-3 border-b-2 border-primary bg-primary/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Square className="h-3 w-3 text-primary fill-primary" />
            <CardTitle className="text-xs font-black tracking-widest text-primary">{t('LOGS_TITLE')}</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("inline-block w-2 h-2 bg-primary animate-pulse", events.length > 0 ? "opacity-100" : "opacity-30")} />
            <span className="text-primary font-bold">LOUD</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 bg-card font-mono text-xs overflow-hidden relative">
        <ScrollArea
          className="h-full w-full"
          ref={scrollRef}
          onMouseEnter={() => setAutoScroll(false)}
          onMouseLeave={() => setAutoScroll(true)}
        >
          <div className="p-4 space-y-1">
            {events.length === 0 && (
              <div className="text-primary/50 italic animate-pulse">LISTENING FOR WAAAH...</div>
            )}
            {events.map((evt, i) => (
              <div key={i} className="flex gap-2 hover:bg-primary/20 p-1 -mx-2 transition-colors border-l-2 border-transparent hover:border-primary">
                <span className="text-primary/70 select-none">[{formatTime(evt.timestamp)}]</span>
                <span className={cn(getColor(evt.category), "break-words")}>
                  {evt.message.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        {!autoScroll && (
          <div className="absolute bottom-2 right-2 bg-primary text-black font-bold text-[10px] px-2 py-1 border border-black shadow-lg pointer-events-none opacity-90 uppercase">
            SCROLL PAUSED
          </div>
        )}
      </CardContent>
    </Card>
  );
}
