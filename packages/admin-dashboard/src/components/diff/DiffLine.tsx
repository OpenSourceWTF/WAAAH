import React, { useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Plus } from "lucide-react";
import { tokenize, TOKEN_CLASSES } from '@/utils/syntaxHighlight';
import type { DiffLine as DiffLineType } from '@/utils/diffParser';

interface DiffLineProps {
  line: DiffLineType;
  lineNum: number | undefined;
  lineComments: { id: string }[];
  filePath: string;
  onStartComment: (file: string, line: number) => void;
}

export const DiffLine = React.memo(function DiffLine({ line, lineNum, lineComments, filePath, onStartComment }: DiffLineProps) {
  const bgClass = line.type === 'add' ? 'bg-green-500/10' :
    line.type === 'remove' ? 'bg-red-500/10' :
      line.type === 'header' ? 'bg-blue-500/10 text-blue-400' : '';

  const textClass = line.type === 'add' ? 'text-green-400' :
    line.type === 'remove' ? 'text-red-400' : 'text-foreground/70';

  // Fix #2: Cache tokenization
  const tokens = useMemo(() => tokenize(line.content), [line.content]);

  return (
    <div className={`flex group hover:bg-primary/5 ${bgClass}`}>
      {/* Line numbers */}
      <div className="w-12 text-right px-2 py-0.5 text-primary/30 border-r border-primary/10 select-none shrink-0">
        {line.lineNumber?.old || ''}
      </div>
      <div className="w-12 text-right px-2 py-0.5 text-primary/30 border-r border-primary/10 select-none shrink-0">
        {line.lineNumber?.new || ''}
      </div>

      {/* Add comment button */}
      <div className="w-8 flex items-center justify-center shrink-0">
        {line.type !== 'header' && lineNum && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-primary/50 hover:text-primary"
            onClick={() => onStartComment(filePath, lineNum)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Content with syntax highlighting */}
      <div className={`flex-1 py-0.5 px-2 whitespace-pre ${textClass}`}>
        {line.type === 'add' && <span className="text-green-500">+</span>}
        {line.type === 'remove' && <span className="text-red-500">-</span>}
        {line.type === 'context' && <span className="text-primary/20"> </span>}
        {line.type !== 'header' ? (
          tokens.map((token, ti) => (
            <span key={ti} className={TOKEN_CLASSES[token.type]}>{token.value}</span>
          ))
        ) : line.content}
      </div>

      {/* Comment indicator */}
      {lineComments.length > 0 && (
        <div className="px-2 flex items-center">
          <Badge variant="outline" className="text-compact h-5">
            <MessageSquare className="h-3 w-3 mr-1" />
            {lineComments.length}
          </Badge>
        </div>
      )}
    </div>
  );
});
