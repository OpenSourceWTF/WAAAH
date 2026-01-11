import React from 'react';
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import type { DiffFile, ReviewComment } from '@/utils/diffParser';
import { DiffLine } from './DiffLine';
import { CommentThread } from './CommentThread';
import { CommentInput } from './CommentInput';

interface DiffFileBlockProps {
  file: DiffFile;
  isExpanded: boolean;
  comments: ReviewComment[];
  commentingLine: { file: string; line: number | null } | null;
  newComment: string;
  onToggle: () => void;
  onSetRef: (el: HTMLDivElement | null) => void;
  onStartComment: (file: string, line: number | null) => void;
  onChangeComment: (value: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
}

/**
 * Renders a single diff file with header, lines, and comments
 * Extracted from DiffViewer to reduce complexity
 */
export function DiffFileBlock({
  file,
  isExpanded,
  comments,
  commentingLine,
  newComment,
  onToggle,
  onSetRef,
  onStartComment,
  onChangeComment,
  onSubmitComment,
  onCancelComment
}: DiffFileBlockProps) {
  const getCommentsForLine = (lineNumber: number | null) => {
    return comments.filter(c => c.filePath === file.path && c.lineNumber === lineNumber && !c.threadId);
  };

  const getReplies = (commentId: string) => comments.filter(c => c.threadId === commentId);
  const fileCommentCount = getCommentsForLine(null).length;

  return (
    <div className="border border-primary/30 bg-black/20" ref={onSetRef}>
      {/* File header */}
      <div
        className="flex items-center gap-2 p-2 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/20"
        onClick={onToggle}
      >
        {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
        <span className="font-mono text-sm text-primary">{file.path}</span>
        {fileCommentCount > 0 && (
          <Badge variant="outline" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />{fileCommentCount}</Badge>
        )}
      </div>

      {/* Lines */}
      {isExpanded && (
        <div className="text-xs overflow-x-auto normal-case" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>
          {file.lines.map((line, idx) => {
            const lineNum = line.lineNumber?.new || line.lineNumber?.old;
            const lineComments = lineNum ? getCommentsForLine(lineNum) : [];
            const isCommenting = commentingLine?.file === file.path && commentingLine?.line === lineNum;

            return (
              <React.Fragment key={idx}>
                <DiffLine
                  line={line}
                  lineNum={lineNum}
                  lineComments={lineComments}
                  filePath={file.path}
                  onStartComment={onStartComment}
                />

                {lineComments.map(comment => (
                  <CommentThread key={comment.id} comment={comment} replies={getReplies(comment.id)} />
                ))}

                {isCommenting && (
                  <CommentInput
                    value={newComment}
                    onChange={onChangeComment}
                    onSubmit={onSubmitComment}
                    onCancel={onCancelComment}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
