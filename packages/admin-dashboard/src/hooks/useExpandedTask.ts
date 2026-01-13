import { useState, useEffect, useCallback } from 'react';
import type { Task } from '@/components/kanban/types';

interface UseExpandedTaskOptions {
  tasks: Task[];
  completedTasks: Task[];
  cancelledTasks: Task[];
  onExpandChange?: (isExpanded: boolean) => void;
}

export function useExpandedTask({
  tasks,
  completedTasks,
  cancelledTasks,
  onExpandChange
}: UseExpandedTaskOptions) {
  const [expandedTask, setExpandedTask] = useState<Task | null>(null);

  // Keep expanded task data fresh during polling
  useEffect(() => {
    if (expandedTask) {
      const allTasks = [...tasks, ...completedTasks, ...cancelledTasks];
      const freshTask = allTasks.find(t => t.id === expandedTask.id);
      if (freshTask && JSON.stringify(freshTask) !== JSON.stringify(expandedTask)) {
        setExpandedTask(freshTask);
      }
    }
  }, [tasks, completedTasks, cancelledTasks, expandedTask]);

  const handleCardClick = useCallback((task: Task) => {
    setExpandedTask(task);
    onExpandChange?.(true);
  }, [onExpandChange]);

  const handleCloseExpanded = useCallback(() => {
    setExpandedTask(null);
    onExpandChange?.(false);
  }, [onExpandChange]);

  return {
    expandedTask,
    handleCardClick,
    handleCloseExpanded
  };
}
