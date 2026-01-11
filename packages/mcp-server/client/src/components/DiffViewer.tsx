import React from 'react';
import { Badge } from "@/components/ui/badge";
import { FileNavigator } from './diff/FileNavigator';
import { DiffFile } from './diff/DiffFile';
import { useDiffViewer } from '@/hooks/useDiffViewer';

interface DiffViewerProps {
  taskId: string;
  onAddComment: (filePath: string, lineNumber: number | null, content: string) => void;
}

export function DiffViewer({ taskId, onAddComment }: DiffViewerProps) {
  const {
    files, loading, error, expandedFiles, commentingLine, setCommentingLine,
    newComment, setNewComment, fileRefs,
    toggleFile, jumpToFile, handleAddComment, getCommentsForLine, getReplies,
    unresolvedCount, fileStats, totalAdditions, totalDeletions
  } = useDiffViewer(taskId, onAddComment);

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
      {/* Floating File Navigator */}
      <FileNavigator
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
        <DiffFile
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
          ref={el => { if (el) fileRefs.current.set(file.path, el); }}
        />
      ))}
    </div>
  );
}