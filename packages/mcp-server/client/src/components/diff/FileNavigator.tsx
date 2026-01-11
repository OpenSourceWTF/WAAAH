import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FileText, X } from "lucide-react";
import type { FileStats } from '@/utils/diffParser';

interface FileNavigatorProps {
  fileStats: FileStats[];
  totalAdditions: number;
  totalDeletions: number;
  onJumpToFile: (path: string) => void;
}

export function FileNavigator({
  fileStats,
  totalAdditions,
  totalDeletions,
  onJumpToFile
}: FileNavigatorProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleJumpToFile = (path: string) => {
    onJumpToFile(path);
    setIsOpen(false);
  };

  return (
    <div className="sticky top-0 z-[100] float-right">
      {!isOpen ? (
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 gap-2 bg-primary/90 hover:bg-primary shadow-lg border border-primary-foreground/20"
          onClick={() => setIsOpen(true)}
          title="Show file navigator"
        >
          <FileText className="h-4 w-4" />
          <span className="text-xs font-bold">Files ({fileStats.length})</span>
        </Button>
      ) : (
        <div className="bg-background/95 backdrop-blur border border-primary/30 shadow-xl w-72 max-h-[60vh] overflow-hidden flex flex-col">
          {/* Navigator Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary">FILES</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">+{totalAdditions}</span>
              <span className="text-xs text-red-400">−{totalDeletions}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary/50 hover:text-primary"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* File List */}
          <div className="overflow-y-auto p-1">
            {fileStats.map(stat => (
              <button
                key={stat.path}
                className="w-full text-left px-2 py-1.5 hover:bg-primary/10 flex items-center gap-2 group"
                onClick={() => handleJumpToFile(stat.path)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-primary truncate" title={stat.path}>
                    {stat.path.split('/').pop()}
                  </p>
                  <p className="text-[10px] text-primary/40 truncate">{stat.path}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {stat.additions > 0 && (
                    <span className="text-[10px] px-1 bg-green-500/20 text-green-400 rounded">
                      +{stat.additions}
                    </span>
                  )}
                  {stat.deletions > 0 && (
                    <span className="text-[10px] px-1 bg-red-500/20 text-red-400 rounded">
                      −{stat.deletions}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
