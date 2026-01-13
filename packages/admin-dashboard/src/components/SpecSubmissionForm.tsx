/**
 * SpecSubmissionForm - Form component for submitting new spec requests
 *
 * Fields: Problem, Users, Requirements, Success Metrics, Out of Scope
 * Required: Problem, Requirements
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useFormSubmission } from '../hooks/useFormSubmission';
import { FormActions } from './FormActions';
import './SpecSubmissionForm.css';

interface Workspace {
  path: string;
  agentCount: number;
}

export interface SpecFormData {
  workspace: string;
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

const initialFormData: SpecFormData = {
  workspace: '',
  problem: '',
  users: '',
  requirements: '',
  successMetrics: '',
  outOfScope: '',
};

export function SpecSubmissionForm({ onSubmit, onCancel }: SpecSubmissionFormProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const validate = useCallback((data: SpecFormData): Partial<Record<keyof SpecFormData, string>> => {
    const errors: Partial<Record<keyof SpecFormData, string>> = {};

    if (!data.workspace) {
      errors.workspace = 'Workspace selection is required';
    }
    if (!data.problem.trim()) {
      errors.problem = 'Problem statement is required';
    }
    if (!data.requirements.trim()) {
      errors.requirements = 'Requirements are required';
    }

    return errors;
  }, []);

  const {
    formData,
    setFormData,
    errors,
    isSubmitting,
    handleSubmit,
    handleFieldChange,
  } = useFormSubmission({
    initialData: initialFormData,
    validate,
    onSubmit,
  });

  // Fetch workspaces on mount
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const data = await apiFetch<Workspace[]>('/admin/workspaces');
        setWorkspaces(data);
        // Auto-select if only one workspace
        if (data.length === 1) {
          setFormData(prev => ({ ...prev, workspace: data[0].path }));
        }
      } catch (err) {
        console.error('Failed to fetch workspaces:', err);
      } finally {
        setLoadingWorkspaces(false);
      }
    };
    fetchWorkspaces();
  }, [setFormData]);

  const handleTextareaChange = (field: keyof SpecFormData) => (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    handleFieldChange(field, e.target.value);
  };

  return (
    <form
      className="spec-submission-form"
      onSubmit={handleSubmit}
      aria-label="Spec Submission Form"
    >
      <h2 className="spec-form__title">Submit New Spec Request</h2>

      {/* Workspace Selection */}
      <div className="spec-form__field">
        <label htmlFor="workspace" className="spec-form__label">
          Workspace <span className="spec-form__required">*</span>
        </label>
        <select
          id="workspace"
          name="workspace"
          className={`spec-form__select ${errors.workspace ? 'spec-form__select--error' : ''}`}
          value={formData.workspace}
          onChange={(e) => handleFieldChange('workspace', e.target.value)}
          disabled={loadingWorkspaces}
          aria-required="true"
          aria-invalid={!!errors.workspace}
          aria-describedby={errors.workspace ? 'workspace-error' : undefined}
        >
          <option value="">
            {loadingWorkspaces ? 'Loading workspaces...' : 'Select a workspace'}
          </option>
          {workspaces.map((ws) => (
            <option key={ws.path} value={ws.path}>
              {ws.path} ({ws.agentCount} agent{ws.agentCount !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
        {errors.workspace && (
          <span id="workspace-error" className="spec-form__error" role="alert">
            {errors.workspace}
          </span>
        )}
      </div>

      <div className="spec-form__field">
        <label htmlFor="problem" className="spec-form__label">
          Problem Statement <span className="spec-form__required">*</span>
        </label>
        <textarea
          id="problem"
          name="problem"
          className={`spec-form__textarea ${errors.problem ? 'spec-form__textarea--error' : ''}`}
          value={formData.problem}
          onChange={handleTextareaChange('problem')}
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
          onChange={handleTextareaChange('users')}
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
          onChange={handleTextareaChange('requirements')}
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
          onChange={handleTextareaChange('successMetrics')}
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
          onChange={handleTextareaChange('outOfScope')}
          placeholder="What specifically is NOT included?"
          aria-label="Out of Scope"
          rows={3}
        />
      </div>

      <FormActions
        isSubmitting={isSubmitting}
        submitLabel="Submit Spec Request"
        submittingLabel="Submitting..."
        onCancel={onCancel}
      />
    </form>
  );
}
