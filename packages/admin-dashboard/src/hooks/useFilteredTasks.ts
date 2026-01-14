import { useMemo } from 'react';
import type { Task } from '@/components/kanban/types';
import { COLUMNS } from '@/components/kanban/types';

interface UseFilteredTasksOptions {
  tasks: Task[];
  completedTasks: Task[];
  cancelledTasks: Task[];
  searchQuery: string;
}

export function useFilteredTasks({
  tasks,
  completedTasks,
  cancelledTasks,
  searchQuery
}: UseFilteredTasksOptions) {
  return useMemo(() => {
    // Helper function to filter by search
    const matchesSearch = (task: Task): boolean => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        task.id.toLowerCase().includes(query) ||
        (task.title?.toLowerCase().includes(query) ?? false) ||
        task.prompt.toLowerCase().includes(query) ||
        task.status.toLowerCase().includes(query) ||
        (task.assignedTo?.toLowerCase().includes(query) ?? false)
      );
    };

    const cols: Record<string, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      REVIEW: [],
      APPROVED: [],
      DONE: completedTasks.filter(matchesSearch),
      CANCELLED: cancelledTasks.filter(matchesSearch)
    };

    // Group active tasks into columns
    tasks.filter(matchesSearch).forEach(task => {
      if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(task.status)) {
        const col = COLUMNS.find(c => c.statuses.includes(task.status));
        if (col) {
          cols[col.id].push(task);
        }
      }
    });

    // Add failed/cancelled tasks to CANCELLED column
    tasks.filter(matchesSearch).forEach(task => {
      if (['CANCELLED', 'FAILED'].includes(task.status)) {
        cols['CANCELLED'].push(task);
      }
    });

    return cols;
  }, [tasks, completedTasks, cancelledTasks, searchQuery]);
}
