// Diff parsing utilities

export interface ReviewComment {
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

export interface DiffLine {
  content: string;
  type: 'add' | 'remove' | 'context' | 'header';
  lineNumber?: { old?: number; new?: number };
}

export interface DiffFile {
  path: string;
  lines: DiffLine[];
}

export interface FileStats {
  path: string;
  additions: number;
  deletions: number;
  modifications: number;
}

/**
 * Parse unified diff format into structured file data
 */
export function parseDiff(diffText: string): DiffFile[] {
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

/**
 * Split raw diff text into file chunks (before parsing)
 * Returns array of raw diff strings, one per file
 */
export function splitDiffByFile(diffText: string): string[] {
  const chunks: string[] = [];
  const lines = diffText.split('\n');
  let currentChunk: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
      }
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }
  return chunks;
}

/**
 * Parse a single file chunk from diff text
 */
export function parseDiffChunk(chunkText: string): DiffFile | null {
  const lines = chunkText.split('\n');
  let currentFile: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
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
  return currentFile;
}

/**
 * Calculate file statistics from parsed diff
 */
export function getFileStats(files: DiffFile[]): FileStats[] {
  return files.map(file => ({
    path: file.path,
    additions: file.lines.filter(l => l.type === 'add').length,
    deletions: file.lines.filter(l => l.type === 'remove').length,
    modifications: 0 // Could be computed by pairing +/- lines
  }));
}
