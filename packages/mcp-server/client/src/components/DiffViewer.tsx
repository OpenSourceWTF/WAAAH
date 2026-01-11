import React, { useState, useRef, useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { getFileStats } from '@/utils/diffParser';
import { FileNavigator } from './diff/FileNavigator';
import { useDiffData } from '@/hooks/useDiffData';
import { FileDiff } from './diff/FileDiff';

interface DiffViewerProps {
  taskId: string;
  onAddComment: (filePath: string, lineNumber: number | null, content: string) => void;
}

export function DiffViewer({ taskId, onAddComment }: DiffViewerProps) {
  const { files, comments, loading, error, fetchComments } = useDiffData(taskId);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [commentingLine, setCommentingLine] = useState<{ file: string; line: number | null } | null>(null);
  const [newComment, setNewComment] = useState('');

  // Refs for file sections to enable jump-to
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-expand files when loaded
  React.useEffect(() => {
    if (files.length > 0) {
      setExpandedFiles(new Set(files.map(f => f.path)));
    }
  }, [files]);

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

  if (loading && files.length === 0) return <div className="text-center p-8">Loading diff...</div>;
  if (error) return <div className="text-red-500 p-4">Error loading diff: {error}</div>;
  if (files.length === 0) return <div className="text-center p-8 text-muted-foreground">No changes in this task.</div>;

  return (
    <div className="flex flex-col h-full bg-black/40 border border-primary/20 rounded-md overflow-hidden">
      <FileNavigator
        files={files}
        expandedFiles={expandedFiles}
        onToggleFile={toggleFile}
        fileStats={fileStats}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
        onJumpToFile={jumpToFile}
      />

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
        <FileDiff
          key={file.path}
          file={file}
          isExpanded={expandedFiles.has(file.path)}
          onToggle={toggleFile}
          getCommentsForLine={getCommentsForLine}
          getReplies={getReplies}
          commentingLine={commentingLine}
          setCommentingLine={setCommentingLine}
          newComment={newComment}
          setNewComment={setNewComment}
          onAddComment={handleAddComment}
          fileRef={el => { if (el) fileRefs.current.set(file.path, el); }}
        />
      ))}
    </div>
  );
}