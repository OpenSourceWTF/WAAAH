/**
 * useFormSubmission - Shared hook for form validation and submission
 *
 * Extracts common form handling logic used by SpecSubmissionForm and TaskCreationForm
 */
import { useState, useCallback, FormEvent } from 'react';

export interface UseFormSubmissionOptions<T> {
  initialData: T;
  validate: (data: T) => Partial<Record<keyof T, string>>;
  onSubmit: (data: T) => Promise<void>;
}

export interface UseFormSubmissionResult<T> {
  formData: T;
  setFormData: React.Dispatch<React.SetStateAction<T>>;
  errors: Partial<Record<keyof T, string>>;
  setErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof T, string>>>>;
  isSubmitting: boolean;
  handleSubmit: (e: FormEvent) => Promise<void>;
  handleFieldChange: <K extends keyof T>(field: K, value: T[K]) => void;
  clearFieldError: (field: keyof T) => void;
}

export function useFormSubmission<T extends Record<string, unknown>>({
  initialData,
  validate,
  onSubmit,
}: UseFormSubmissionOptions<T>): UseFormSubmissionResult<T> {
  const [formData, setFormData] = useState<T>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validate, onSubmit]);

  const handleFieldChange = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when field changes
    setErrors(prev => {
      if (prev[field]) {
        const { [field]: _, ...rest } = prev;
        return rest as Partial<Record<keyof T, string>>;
      }
      return prev;
    });
  }, []);

  const clearFieldError = useCallback((field: keyof T) => {
    setErrors(prev => {
      if (prev[field]) {
        const { [field]: _, ...rest } = prev;
        return rest as Partial<Record<keyof T, string>>;
      }
      return prev;
    });
  }, []);

  return {
    formData,
    setFormData,
    errors,
    setErrors,
    isSubmitting,
    handleSubmit,
    handleFieldChange,
    clearFieldError,
  };
}
