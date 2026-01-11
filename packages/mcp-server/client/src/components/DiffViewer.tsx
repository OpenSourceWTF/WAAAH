import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import { parseDiff, getFileStats } from '@/utils/diffParser';
import type { DiffFile, ReviewComment } from '@/utils/diffParser';
import { FileNavigator } from './diff/FileNavigator';
import { DiffLine } from './diff/DiffLine';
import { CommentThread } from './diff/CommentThread';
import { CommentInput } from './diff/CommentInput';
import { apiFetch } from '@/lib/api';

interface DiffViewerProps {
  taskId: string;
  onAddComment: (filePath: string, lineNumber: number | null, content: string) => void;
}

export function DiffViewer({ taskId, onAddComment }: DiffViewerProps) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [commentingLine, setCommentingLine] = useState<{ file: string; line: number | null } | null>(null);
  const [newComment, setNewComment] = useState('');

  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const diffLoaded = useRef(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch comments', e);
    }
  }, [taskId]);

  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/admin/tasks/${taskId}/diff`);

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
    setExpandedFiles(prev => new Set([...prev, path]));
    setTimeout(() => {
      const el = fileRefs.current.get(path);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const getCommentsForLine = (filePath: string, lineNumber: number | null) => {
    return comments.filter(c => c.filePath === filePath && c.lineNumber === lineNumber && !c.threadId);
  };

  const getReplies = (commentId: string) => comments.filter(c => c.threadId === commentId);

  const unresolvedCount = comments.filter(c => !c.resolved && !c.threadId).length;
  const fileStats = useMemo(() => getFileStats(files), [files]);
  const totalAdditions = fileStats.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileStats.reduce((sum, f) => sum + f.deletions, 0);

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-primary/50">Loading diff...</div>;
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
      <FileNavigator fileStats={fileStats} totalAdditions={totalAdditions} totalDeletions={totalDeletions} onJumpToFile={jumpToFile} />

      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50">{files.length} file{files.length !== 1 && 's'} changed</Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-400">+{totalAdditions}</Badge>
          <Badge variant="outline" className="border-red-500/50 text-red-400">−{totalDeletions}</Badge>
          {unresolvedCount > 0 && <Badge className="bg-orange-500 text-white">{unresolvedCount} unresolved</Badge>}
        </div>
      </div>

      {/* Files */}
      {files.map(file => (
        <div key={file.path} className="border border-primary/30 bg-black/20" ref={el => { if (el) fileRefs.current.set(file.path, el); }}>
          {/* File header */}
          <div className="flex items-center gap-2 p-2 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/20" onClick={() => toggleFile(file.path)}>
            {expandedFiles.has(file.path) ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
            <span className="font-mono text-sm text-primary">{file.path}</span>
            {getCommentsForLine(file.path, null).length > 0 && (
              <Badge variant="outline" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />{getCommentsForLine(file.path, null).length}</Badge>
            )}
          </div>

          {/* Lines */}
          {expandedFiles.has(file.path) && (
            <div className="text-xs overflow-x-auto normal-case" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>
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
                      onStartComment={(f, l) => setCommentingLine({ file: f, line: l })}
                    />

                    {lineComments.map(comment => (
                      <CommentThread key={comment.id} comment={comment} replies={getReplies(comment.id)} />
                    ))}

                    {isCommenting && (
                      <CommentInput
                        value={newComment}
                        onChange={setNewComment}
                        onSubmit={handleAddComment}
                        onCancel={() => { setCommentingLine(null); setNewComment(''); }}
                      />
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
