import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { splitDiffByFile, parseDiffChunk, getFileStats } from '@/utils/diffParser';
import type { DiffFile, ReviewComment } from '@/utils/diffParser';
import { DiffLine } from './diff/DiffLine';
import { CommentThread } from './diff/CommentThread';
import { CommentInput } from './diff/CommentInput';
import { apiFetch } from '@/lib/api';

// Fix #6: Extract inline styles
const MONOSPACE_STYLE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace'
};

interface DiffViewerProps {
  taskId: string;
  onAddComment: (filePath: string, lineNumber: number | null, content: string) => void;
  onDiffLoaded?: (fileStats: import('@/utils/diffParser').FileStats[], jumpToFile: (path: string) => void) => void;
}

export function DiffViewer({ taskId, onAddComment, onDiffLoaded }: DiffViewerProps) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false); // True while processing files
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [commentingLine, setCommentingLine] = useState<{ file: string; line: number | null } | null>(null);
  const [newComment, setNewComment] = useState('');

  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const diffLoaded = useRef(false);

  const fetchComments = useCallback(async () => {
    const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`).catch(() => null);
    res?.ok && setComments(await res.json());
  }, [taskId]);

  // Progressive diff loading - process files one at a time
  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setStreaming(false);
    setFiles([]);
    setProcessedCount(0);
    setTotalCount(0);

    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/diff`);
      if (res.ok) {
        const rawDiff = (await res.json()).diff || '';
        const chunks = splitDiffByFile(rawDiff);

        if (chunks.length === 0) {
          setError('No changes detected');
          setLoading(false);
          return;
        }

        setTotalCount(chunks.length);
        setLoading(false);
        setStreaming(true);
        diffLoaded.current = true;

        // Process files progressively with small delays to avoid blocking UI
        for (let i = 0; i < chunks.length; i++) {
          // Use requestAnimationFrame for smooth UI updates
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
              const parsedFile = parseDiffChunk(chunks[i]);
              if (parsedFile) {
                setFiles(prev => [...prev, parsedFile]);
                setExpandedFiles(prev => new Set([...prev, parsedFile.path]));
              }
              setProcessedCount(i + 1);
              resolve();
            });
          });

          // Add small delay every few files to let React batch updates
          if (i > 0 && i % 3 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        setStreaming(false);
      } else {
        setError('No diff available');
        setLoading(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { !diffLoaded.current && fetchDiff().then(fetchComments); }, [fetchDiff, fetchComments]);

  // Fix #5: Stable callback references
  const handleAddComment = useCallback(async () => {
    if (commentingLine && newComment.trim()) {
      onAddComment(commentingLine.file, commentingLine.line, newComment.trim());
      setNewComment('');
      setCommentingLine(null);
      setTimeout(fetchComments, 500);
    }
  }, [commentingLine, newComment, onAddComment, fetchComments]);

  const toggleFile = useCallback((path: string) => setExpandedFiles(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  }), []);

  const jumpToFile = useCallback((path: string) => {
    setExpandedFiles(prev => new Set([...prev, path]));
    setTimeout(() => fileRefs.current.get(path)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  // Fix #5: Stable callback reference for starting comments
  const handleStartComment = useCallback((f: string, l: number) => {
    setCommentingLine({ file: f, line: l });
  }, []);

  const handleCancelComment = useCallback(() => {
    setCommentingLine(null);
    setNewComment('');
  }, []);

  // Fix #4: Pre-index comments by line for O(1) lookup
  const commentsByLine = useMemo(() => {
    const map = new Map<string, ReviewComment[]>();
    comments.forEach(c => {
      if (!c.threadId) {
        const key = `${c.filePath}:${c.lineNumber}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    });
    return map;
  }, [comments]);

  const repliesByThreadId = useMemo(() => {
    const map = new Map<string, ReviewComment[]>();
    comments.forEach(c => {
      if (c.threadId) {
        if (!map.has(c.threadId)) map.set(c.threadId, []);
        map.get(c.threadId)!.push(c);
      }
    });
    return map;
  }, [comments]);

  // O(1) lookups instead of O(n)
  const getCommentsForLine = useCallback((filePath: string, lineNumber: number | null) => {
    return commentsByLine.get(`${filePath}:${lineNumber}`) || [];
  }, [commentsByLine]);

  const getReplies = useCallback((commentId: string) => {
    return repliesByThreadId.get(commentId) || [];
  }, [repliesByThreadId]);

  const unresolvedCount = useMemo(() => comments.filter(c => !c.resolved && !c.threadId).length, [comments]);
  const fileStats = useMemo(() => getFileStats(files), [files]);
  const totalAdditions = useMemo(() => fileStats.reduce((sum, f) => sum + f.additions, 0), [fileStats]);
  const totalDeletions = useMemo(() => fileStats.reduce((sum, f) => sum + f.deletions, 0), [fileStats]);

  useEffect(() => {
    if (files.length > 0 && !loading && !streaming) {
      onDiffLoaded?.(fileStats, jumpToFile);
    }
  }, [files, loading, streaming, fileStats, onDiffLoaded, jumpToFile]);

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-primary/50">Loading diff...</div>;
  }

  if (error || (files.length === 0 && !streaming)) {
    return (
      <div className="text-center p-8 border-2 border-dashed border-primary/30 text-primary/40">
        <p>{error || 'No changes detected'}</p>
        <p className="text-xs mt-2">Diff will appear here when the agent makes changes</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-primary/50">
          {streaming ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {processedCount}/{totalCount} files
            </span>
          ) : (
            `${files.length} file${files.length !== 1 ? 's' : ''} changed`
          )}
        </Badge>
        <Badge variant="outline" className="border-green-500/50 text-green-400">+{totalAdditions}</Badge>
        <Badge variant="outline" className="border-red-500/50 text-red-400">−{totalDeletions}</Badge>
        {unresolvedCount > 0 && <Badge className="bg-orange-500 text-white">{unresolvedCount} unresolved</Badge>}
      </div>

      {files.map(file => (
        <div key={file.path} className="border border-primary/30 bg-black/20" ref={el => { el && fileRefs.current.set(file.path, el); }}>
          <div
            className="flex items-center gap-2 p-2 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/20"
            onClick={() => toggleFile(file.path)}
          >
            {expandedFiles.has(file.path) ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
            <span className="font-mono text-sm text-primary">{file.path}</span>
            {getCommentsForLine(file.path, null).length > 0 && (
              <Badge variant="outline" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />{getCommentsForLine(file.path, null).length}</Badge>
            )}
            {(() => {
              const stats = fileStats.find(s => s.path === file.path);
              if (!stats) return null;
              return (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-green-400">+{stats.additions}</span>
                  <span className="text-xs text-red-400">−{stats.deletions}</span>
                </div>
              );
            })()}
          </div>

          {expandedFiles.has(file.path) && (
            <div className="text-xs overflow-x-auto normal-case" style={MONOSPACE_STYLE}>
              {file.lines.map((line, idx) => {
                const lineNum = line.lineNumber?.new || line.lineNumber?.old;
                const lineComments = lineNum ? getCommentsForLine(file.path, lineNum) : [];
                const isCommenting = commentingLine?.file === file.path && commentingLine?.line === lineNum;

                return (
                  <React.Fragment key={idx}>
                    <DiffLine
                      line={line}
                      lineNum={lineNum}
                      lineComments={lineComments}
                      filePath={file.path}
                      onStartComment={handleStartComment}
                    />
                    {lineComments.map(comment => (
                      <CommentThread key={comment.id} comment={comment} replies={getReplies(comment.id)} />
                    ))}
                    {isCommenting && (
                      <CommentInput
                        value={newComment}
                        onChange={setNewComment}
                        onSubmit={handleAddComment}
                        onCancel={handleCancelComment}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Streaming indicator at bottom */}
      {streaming && (
        <div className="flex items-center justify-center gap-2 p-4 text-primary/50 border border-dashed border-primary/20">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading more files... ({processedCount}/{totalCount})</span>
        </div>
      )}
    </div>
  );
}
