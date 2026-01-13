/**
 * FormActions - Shared submit/cancel button component
 *
 * Extracts common form action buttons used by SpecSubmissionForm and TaskCreationForm
 */
import React from 'react';

interface FormActionsProps {
  isSubmitting: boolean;
  submitLabel: string;
  submittingLabel?: string;
  onCancel?: () => void;
  className?: string;
}

export function FormActions({
  isSubmitting,
  submitLabel,
  submittingLabel = 'Submitting...',
  onCancel,
  className = 'spec-form__actions',
}: FormActionsProps) {
  return (
    <div className={className}>
      {onCancel && (
        <button
          type="button"
          className="spec-form__button spec-form__button--secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        className="spec-form__button spec-form__button--primary"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="spec-form__spinner" aria-hidden="true" />
            {submittingLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  );
}
