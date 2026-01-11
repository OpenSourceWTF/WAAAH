import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Check, Send, ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { DiffFile, ReviewComment } from '@/utils/diffParser';
import { tokenize, TOKEN_CLASSES } from '@/utils/syntaxHighlight';

interface DiffFileProps {
  file: DiffFile;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  getCommentsForLine: (path: string, line: number | null) => ReviewComment[];
  getReplies: (commentId: string) => ReviewComment[];
  commentingLine: { file: string; line: number | null } | null;
  setCommentingLine: (val: { file: string; line: number | null } | null) => void;
  newComment: string;
  setNewComment: (val: string) => void;
  onAddComment: () => void;
}

export const DiffFile = React.forwardRef<HTMLDivElement, DiffFileProps>(({
  file, isExpanded, onToggle, getCommentsForLine, getReplies,
  commentingLine, setCommentingLine, newComment, setNewComment, onAddComment
}, ref) => {
  return (
    <div
      className="border border-primary/30 bg-black/20"
      ref={ref}
    >
      {/* File header */}
      <div
        className="flex items-center gap-2 p-2 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/20"
        onClick={() => onToggle(file.path)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-primary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-primary" />
        )}
        <span className="font-mono text-sm text-primary">{file.path}</span>
        {getCommentsForLine(file.path, null).length > 0 && (
          <Badge variant="outline" className="text-xs">
            <MessageSquare className="h-3 w-3 mr-1" />
            {getCommentsForLine(file.path, null).length}
          </Badge>
        )}
      </div>

      {/* Lines */}
      {isExpanded && (
        <div className="text-xs overflow-x-auto normal-case" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>
          {file.lines.map((line, idx) => {
            const lineNum = line.lineNumber?.new || line.lineNumber?.old;
            const lineComments = lineNum ? getCommentsForLine(file.path, lineNum) : [];
            const isCommenting = commentingLine?.file === file.path && commentingLine?.line === lineNum;

            return (
              <React.Fragment key={idx}>
                <div
                  className={`flex group hover:bg-primary/5 ${line.type === 'add' ? 'bg-green-500/10' :
                    line.type === 'remove' ? 'bg-red-500/10' :
                      line.type === 'header' ? 'bg-blue-500/10 text-blue-400' : ''
                    }`}
                >
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
                        onClick={() => setCommentingLine({ file: file.path, line: lineNum })}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {/* Content with syntax highlighting */}
                  <div className={`flex-1 py-0.5 px-2 whitespace-pre ${line.type === 'add' ? 'text-green-400' :
                    line.type === 'remove' ? 'text-red-400' : 'text-foreground/70'
                    }`}>
                    {line.type === 'add' && <span className="text-green-500">+</span>}
                    {line.type === 'remove' && <span className="text-red-500">-</span>}
                    {line.type === 'context' && <span className="text-primary/20"> </span>}
                    {line.type !== 'header' ? (
                      tokenize(line.content).map((token, ti) => (
                        <span key={ti} className={TOKEN_CLASSES[token.type]}>{token.value}</span>
                      ))
                    ) : line.content}
                  </div>

                  {/* Comment indicator */}
                  {lineComments.length > 0 && (
                    <div className="px-2 flex items-center">
                      <Badge variant="outline" className="text-[10px] h-5">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {lineComments.length}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Inline comments */}
                {lineComments.map(comment => (
                  <div key={comment.id} className="ml-24 my-1 mr-2">
                    <div className={`p-2 border-l-2 ${comment.resolved ? 'border-green-500/50 bg-green-500/5' : 'border-orange-500 bg-orange-500/5'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${comment.authorRole === 'user' ? 'text-primary' : 'text-blue-400'}`}>
                          {comment.authorRole === 'user' ? 'You' : comment.authorId || 'Agent'}
                        </span>
                        <span className="text-[10px] text-primary/40">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                        {comment.resolved && (
                          <Badge className="bg-green-600 text-white text-[10px] h-4">
                            <Check className="h-2 w-2 mr-1" /> Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80">{comment.content}</p>

                      {/* Replies */}
                      {getReplies(comment.id).map(reply => (
                        <div key={reply.id} className="mt-2 pl-3 border-l border-primary/20">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-blue-400">Agent</span>
                            <span className="text-[10px] text-primary/40">
                              {new Date(reply.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* New comment input */}
                {isCommenting && (
                  <div className="ml-24 my-2 mr-2 flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 h-8 px-2 text-xs bg-black/50 border border-primary/50 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          onAddComment();
                        }
                        if (e.key === 'Escape') {
                          setCommentingLine(null);
                          setNewComment('');
                        }
                      }}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 w-8 p-0 bg-primary"
                      onClick={onAddComment}
                      disabled={!newComment.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => { setCommentingLine(null); setNewComment(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
});

DiffFile.displayName = 'DiffFile';
