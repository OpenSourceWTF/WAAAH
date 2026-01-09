import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Check, Send, ChevronDown, ChevronRight, Plus, FileText, X } from "lucide-react";

interface ReviewComment {
  id: string;
  taskId: string;
  filePath: string;
  lineNumber: number | null;
  content: string;
  authorRole: 'user' | 'agent';
  authorId?: string;
  threadId?: string;
  resolved: boolean;
  resolvedBy?: string;
  createdAt: number;
}

interface DiffLine {
  content: string;
  type: 'add' | 'remove' | 'context' | 'header';
  lineNumber?: { old?: number; new?: number };
}

interface DiffFile {
  path: string;
  lines: DiffLine[];
}

interface FileStats {
  path: string;
  additions: number;
  deletions: number;
  modifications: number;
}

interface DiffViewerProps {
  taskId: string;
  onAddComment: (filePath: string, lineNumber: number | null, content: string) => void;
}

// Parse unified diff format
function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  let currentFile: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      const match = line.match(/b\/(.+)$/);
      currentFile = { path: match?.[1] || 'unknown', lines: [] };
    } else if (line.startsWith('@@')) {
      if (!currentFile) continue;
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        oldLine = parseInt(match[1]);
        newLine = parseInt(match[2]);
      }
      currentFile.lines.push({ content: line, type: 'header' });
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.lines.push({
          content: line.slice(1),
          type: 'add',
          lineNumber: { new: newLine++ }
        });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.lines.push({
          content: line.slice(1),
          type: 'remove',
          lineNumber: { old: oldLine++ }
        });
      } else if (line.startsWith(' ') || line === '') {
        currentFile.lines.push({
          content: line.slice(1) || '',
          type: 'context',
          lineNumber: { old: oldLine++, new: newLine++ }
        });
      }
    }
  }
  if (currentFile) files.push(currentFile);
  return files;
}

// Calculate file stats
function getFileStats(files: DiffFile[]): FileStats[] {
  return files.map(file => ({
    path: file.path,
    additions: file.lines.filter(l => l.type === 'add').length,
    deletions: file.lines.filter(l => l.type === 'remove').length,
    modifications: 0 // Could be computed by pairing +/- lines
  }));
}

export function DiffViewer({ taskId, onAddComment }: DiffViewerProps) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [commentingLine, setCommentingLine] = useState<{ file: string; line: number | null } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  // Refs for file sections to enable jump-to
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const diffLoaded = useRef(false);

  // Fetch comments only (doesn't reset scroll)
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/admin/tasks/${taskId}/review-comments`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch comments', e);
    }
  }, [taskId]);

  // Fetch diff (only on initial load)
  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/admin/tasks/${taskId}/diff`);

      if (res.ok) {
        const data = await res.json();
        const parsed = parseDiff(data.diff || '');
        setFiles(parsed);
        setExpandedFiles(new Set(parsed.map(f => f.path)));
        diffLoaded.current = true;
      } else {
        setError('No diff available');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Initial load: fetch both
  useEffect(() => {
    if (!diffLoaded.current) {
      fetchDiff().then(() => fetchComments());
    }
  }, [fetchDiff, fetchComments]);

  const handleAddComment = async () => {
    if (!commentingLine || !newComment.trim()) return;

    onAddComment(commentingLine.file, commentingLine.line, newComment.trim());
    setNewComment('');
    setCommentingLine(null);

    // Only refresh comments (not diff) - preserves scroll
    setTimeout(fetchComments, 500);
  };

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const jumpToFile = (path: string) => {
    // Expand the file first
    setExpandedFiles(prev => new Set([...prev, path]));
    setNavOpen(false);

    // Scroll to file after a tick
    setTimeout(() => {
      const el = fileRefs.current.get(path);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const getCommentsForLine = (filePath: string, lineNumber: number | null) => {
    return comments.filter(c =>
      c.filePath === filePath &&
      c.lineNumber === lineNumber &&
      !c.threadId
    );
  };

  const getReplies = (commentId: string) => {
    return comments.filter(c => c.threadId === commentId);
  };

  const unresolvedCount = comments.filter(c => !c.resolved && !c.threadId).length;

  // File stats for navigator
  const fileStats = useMemo(() => getFileStats(files), [files]);
  const totalAdditions = fileStats.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileStats.reduce((sum, f) => sum + f.deletions, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-primary/50">
        Loading diff...
      </div>
    );
  }

  if (error || files.length === 0) {
    return (
      <div className="text-center p-8 border-2 border-dashed border-primary/30 text-primary/40">
        <p>{error || 'No changes detected'}</p>
        <p className="text-xs mt-2">Diff will appear here when the agent makes changes</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {/* Floating File Navigator Button */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50">
        {!navOpen ? (
          <Button
            variant="default"
            size="sm"
            className="h-10 w-10 p-0 bg-primary/90 hover:bg-primary shadow-lg border border-primary-foreground/20"
            onClick={() => setNavOpen(true)}
            title="Show file navigator"
          >
            <FileText className="h-5 w-5" />
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
                  onClick={() => setNavOpen(false)}
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
                  onClick={() => jumpToFile(stat.path)}
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

      {/* Header with stats */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50">
            {files.length} file{files.length !== 1 && 's'} changed
          </Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-400">
            +{totalAdditions}
          </Badge>
          <Badge variant="outline" className="border-red-500/50 text-red-400">
            −{totalDeletions}
          </Badge>
          {unresolvedCount > 0 && (
            <Badge className="bg-orange-500 text-white">
              {unresolvedCount} unresolved
            </Badge>
          )}
        </div>
      </div>

      {/* Files */}
      {files.map(file => (
        <div
          key={file.path}
          className="border border-primary/30 bg-black/20"
          ref={el => { if (el) fileRefs.current.set(file.path, el); }}
        >
          {/* File header */}
          <div
            className="flex items-center gap-2 p-2 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/20"
            onClick={() => toggleFile(file.path)}
          >
            {expandedFiles.has(file.path) ? (
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
          {expandedFiles.has(file.path) && (
            <div className="font-mono text-xs overflow-x-auto">
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

                      {/* Content */}
                      <div className={`flex-1 py-0.5 px-2 whitespace-pre ${line.type === 'add' ? 'text-green-400' :
                        line.type === 'remove' ? 'text-red-400' : 'text-foreground/70'
                        }`}>
                        {line.type === 'add' && <span className="text-green-500">+</span>}
                        {line.type === 'remove' && <span className="text-red-500">-</span>}
                        {line.type === 'context' && <span className="text-primary/20"> </span>}
                        {line.content}
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
                              handleAddComment();
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
                          onClick={handleAddComment}
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
      ))}
    </div>
  );
}
