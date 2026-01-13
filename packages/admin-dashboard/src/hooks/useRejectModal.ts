import { useState, useCallback } from 'react';

interface UseRejectModalOptions {
  onRejectTask: (id: string, feedback: string) => void;
  onCloseExpanded: () => void;
}

export function useRejectModal({ onRejectTask, onCloseExpanded }: UseRejectModalOptions) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);

  const handleCloseRejectModal = useCallback(() => {
    setShowRejectModal(false);
    setRejectFeedback('');
    setRejectingTaskId(null);
  }, []);

  const handleConfirmReject = useCallback(() => {
    const trimmedFeedback = rejectFeedback.trim();
    if (!rejectingTaskId || !trimmedFeedback) return;

    onRejectTask(rejectingTaskId, trimmedFeedback);
    handleCloseRejectModal();
    onCloseExpanded();
  }, [rejectingTaskId, rejectFeedback, onRejectTask, handleCloseRejectModal, onCloseExpanded]);

  const openRejectModal = useCallback((taskId: string) => {
    setRejectingTaskId(taskId);
    setShowRejectModal(true);
  }, []);

  return {
    showRejectModal,
    rejectFeedback,
    setRejectFeedback,
    handleCloseRejectModal,
    handleConfirmReject,
    openRejectModal
  };
}
