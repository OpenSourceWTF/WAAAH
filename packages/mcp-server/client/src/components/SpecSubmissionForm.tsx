/**
 * SpecSubmissionForm - Form component for submitting new spec requests
 * 
 * Fields: Problem, Users, Requirements, Success Metrics, Out of Scope
 * Required: Problem, Requirements
 */
import { useState, FormEvent } from 'react';
import './SpecSubmissionForm.css';

export interface SpecFormData {
  problem: string;
  users: string;
  requirements: string;
  successMetrics: string;
  outOfScope: string;
}

interface SpecSubmissionFormProps {
  onSubmit: (data: SpecFormData) => Promise<void>;
  onCancel?: () => void;
}

export function SpecSubmissionForm({ onSubmit, onCancel }: SpecSubmissionFormProps) {
  const [formData, setFormData] = useState<SpecFormData>({
    problem: '',
    users: '',
    requirements: '',
    successMetrics: '',
    outOfScope: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SpecFormData, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof SpecFormData, string>> = {};

    if (!formData.problem.trim()) {
      newErrors.problem = 'Problem statement is required';
    }
    if (!formData.requirements.trim()) {
      newErrors.requirements = 'Requirements are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof SpecFormData) => (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <form
      className="spec-submission-form"
      onSubmit={handleSubmit}
      aria-label="Spec Submission Form"
    >
      <h2 className="spec-form__title">Submit New Spec Request</h2>

      <div className="spec-form__field">
        <label htmlFor="problem" className="spec-form__label">
          Problem Statement <span className="spec-form__required">*</span>
        </label>
        <textarea
          id="problem"
          name="problem"
          className={`spec-form__textarea ${errors.problem ? 'spec-form__textarea--error' : ''}`}
          value={formData.problem}
          onChange={handleChange('problem')}
          placeholder="Describe the problem you're trying to solve..."
          aria-required="true"
          aria-invalid={!!errors.problem}
          aria-describedby={errors.problem ? 'problem-error' : undefined}
          rows={4}
        />
        {errors.problem && (
          <span id="problem-error" className="spec-form__error" role="alert">
            {errors.problem}
          </span>
        )}
      </div>

      <div className="spec-form__field">
        <label htmlFor="users" className="spec-form__label">
          Target Users
        </label>
        <textarea
          id="users"
          name="users"
          className="spec-form__textarea"
          value={formData.users}
          onChange={handleChange('users')}
          placeholder="Who will use this feature?"
          aria-label="Target Users"
          rows={2}
        />
      </div>

      <div className="spec-form__field">
        <label htmlFor="requirements" className="spec-form__label">
          Requirements <span className="spec-form__required">*</span>
        </label>
        <textarea
          id="requirements"
          name="requirements"
          className={`spec-form__textarea ${errors.requirements ? 'spec-form__textarea--error' : ''}`}
          value={formData.requirements}
          onChange={handleChange('requirements')}
          placeholder="List the functional requirements..."
          aria-required="true"
          aria-invalid={!!errors.requirements}
          aria-describedby={errors.requirements ? 'requirements-error' : undefined}
          rows={6}
        />
        {errors.requirements && (
          <span id="requirements-error" className="spec-form__error" role="alert">
            {errors.requirements}
          </span>
        )}
      </div>

      <div className="spec-form__field">
        <label htmlFor="successMetrics" className="spec-form__label">
          Success Metrics
        </label>
        <textarea
          id="successMetrics"
          name="successMetrics"
          className="spec-form__textarea"
          value={formData.successMetrics}
          onChange={handleChange('successMetrics')}
          placeholder="How will we measure success?"
          aria-label="Success Metrics"
          rows={3}
        />
      </div>

      <div className="spec-form__field">
        <label htmlFor="outOfScope" className="spec-form__label">
          Out of Scope
        </label>
        <textarea
          id="outOfScope"
          name="outOfScope"
          className="spec-form__textarea"
          value={formData.outOfScope}
          onChange={handleChange('outOfScope')}
          placeholder="What specifically is NOT included?"
          aria-label="Out of Scope"
          rows={3}
        />
      </div>

      <div className="spec-form__actions">
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
              Submitting...
            </>
          ) : (
            'Submit Spec Request'
          )}
        </button>
      </div>
    </form>
  );
}
