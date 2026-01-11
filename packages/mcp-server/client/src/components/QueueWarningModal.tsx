/**
 * QueueWarningModal - Modal shown when submitting to workspace with no capable agents
 * 
 * Displays warning when no spec-writing AND no code-writing capabilities available.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import './QueueWarningModal.css';

interface WorkspaceCapabilities {
  capabilities: string[];
  hasSpecWriting: boolean;
  hasCodeWriting: boolean;
}

interface QueueWarningModalProps {
  workspacePath: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QueueWarningModal({
  workspacePath,
  isOpen,
  onConfirm,
  onCancel
}: QueueWarningModalProps) {
  const [capabilities, setCapabilities] = useState<WorkspaceCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !workspacePath) return;

    const checkCapabilities = async () => {
      setLoading(true);
      setError(null);

      try {
        const encodedPath = encodeURIComponent(workspacePath);
        const response = await apiFetch<WorkspaceCapabilities>(
          `/admin/workspaces/${encodedPath}/capabilities`
        );
        setCapabilities(response);
      } catch (err) {
        setError('Failed to check workspace capabilities');
        console.error('Capability check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkCapabilities();
  }, [isOpen, workspacePath]);

  if (!isOpen) return null;

  // Show warning if no spec-writing AND no code-writing capabilities
  const showWarning = capabilities && !capabilities.hasSpecWriting && !capabilities.hasCodeWriting;

  // If still loading or has capabilities, don't show modal
  if (loading || (capabilities && !showWarning)) {
    // Auto-proceed if capabilities exist
    if (capabilities && !showWarning) {
      onConfirm();
      return null;
    }
    return null;
  }

  return (
    <div
      className="queue-warning-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-warning-title"
      aria-describedby="queue-warning-description"
    >
      <div className="queue-warning-modal">
        <div className="queue-warning-modal__icon" aria-hidden="true">
          ⚠️
        </div>

        <h2 id="queue-warning-title" className="queue-warning-modal__title">
          No Available Agents
        </h2>

        <p id="queue-warning-description" className="queue-warning-modal__description">
          {error || 'No agents with required capabilities. Task will queue until agent connects.'}
        </p>

        {capabilities && (
          <div className="queue-warning-modal__details">
            <span className="queue-warning-modal__detail">
              <span className="queue-warning-modal__capability-icon">📝</span>
              Spec Writing: {capabilities.hasSpecWriting ? '✓' : '✗'}
            </span>
            <span className="queue-warning-modal__detail">
              <span className="queue-warning-modal__capability-icon">💻</span>
              Code Writing: {capabilities.hasCodeWriting ? '✓' : '✗'}
            </span>
          </div>
        )}

        <div className="queue-warning-modal__actions">
          <button
            type="button"
            className="queue-warning-modal__button queue-warning-modal__button--secondary"
            onClick={onCancel}
            aria-label="Cancel submission"
          >
            Cancel
          </button>
          <button
            type="button"
            className="queue-warning-modal__button queue-warning-modal__button--primary"
            onClick={onConfirm}
            aria-label="Queue task anyway"
          >
            Queue Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check workspace capabilities before submission
 */
export function useCapabilityCheck(workspacePath: string | null) {
  const [showModal, setShowModal] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null);

  const checkBeforeSubmit = async (onSubmit: () => void) => {
    if (!workspacePath) {
      onSubmit();
      return;
    }

    try {
      const encodedPath = encodeURIComponent(workspacePath);
      const response = await apiFetch<WorkspaceCapabilities>(
        `/admin/workspaces/${encodedPath}/capabilities`
      );

      // If no capabilities, show warning modal
      if (!response.hasSpecWriting && !response.hasCodeWriting) {
        setPendingSubmit(() => onSubmit);
        setShowModal(true);
      } else {
        // Has capabilities, proceed directly
        onSubmit();
      }
    } catch {
      // On error, proceed with submission
      onSubmit();
    }
  };

  const handleConfirm = () => {
    setShowModal(false);
    if (pendingSubmit) {
      pendingSubmit();
      setPendingSubmit(null);
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setPendingSubmit(null);
  };

  return {
    showModal,
    checkBeforeSubmit,
    handleConfirm,
    handleCancel,
  };
}
