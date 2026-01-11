
import { Terminal, Monitor } from 'lucide-react';

export function SourceBadge({ source }: { source?: 'cli' | 'ide' }) {
  if (source === 'cli') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 border border-blue-500/30 font-bold">
        <Terminal className="h-2.5 w-2.5" />CLI
      </span>
    );
  }
  if (source === 'ide') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 border border-purple-500/30 font-bold">
        <Monitor className="h-2.5 w-2.5" />IDE
      </span>
    );
  }
  return null;
}
