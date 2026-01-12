/**
 * TaskCreationForm - Form component for creating new tasks
 *
 * Fields: Title (optional), Prompt (required), Priority, Workspace, Capabilities, Images
 */
import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './SpecSubmissionForm.css';

interface Agent {
  id: string;
  displayName: string;
  role: string;
  capabilities: string[];
  workspaceRoot?: string;
  metadata?: { workspaceRoot?: string };
}

interface Workspace {
  id: string;
  path: string;
  agentCount: number;
  capabilities: string[];
}

interface ImageAttachment {
  file: File;
  preview: string;
  dataUrl: string;
}

export interface TaskFormData {
  title: string;
  prompt: string;
  priority: 'normal' | 'high' | 'critical';
  workspaceId: string;
  capabilities: string[];
  images: ImageAttachment[];
}

interface TaskCreationFormProps {
  onSubmit: (data: TaskFormData) => Promise<void>;
  onCancel?: () => void;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export function TaskCreationForm({ onSubmit, onCancel }: TaskCreationFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    prompt: '',
    priority: 'normal',
    workspaceId: '',
    capabilities: [],
    images: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof TaskFormData, string>>>({});
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch workspaces and their capabilities on mount
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await apiFetch('/admin/agents/status');
        const agents: Agent[] = await response.json();

        // Extract unique workspaces from agents
        const workspaceMap = new Map<string, Workspace>();

        for (const agent of agents) {
          const wsPath = agent.workspaceRoot || agent.metadata?.workspaceRoot;
          if (!wsPath) continue;

          const existing = workspaceMap.get(wsPath);
          if (existing) {
            existing.agentCount++;
            // Merge capabilities
            for (const cap of agent.capabilities || []) {
              if (!existing.capabilities.includes(cap)) {
                existing.capabilities.push(cap);
              }
            }
          } else {
            workspaceMap.set(wsPath, {
              id: wsPath,
              path: wsPath,
              agentCount: 1,
              capabilities: [...(agent.capabilities || [])]
            });
          }
        }

        const workspaceList = Array.from(workspaceMap.values());
        setWorkspaces(workspaceList);

        // Auto-select if only one workspace
        if (workspaceList.length === 1) {
          setFormData(prev => ({ ...prev, workspaceId: workspaceList[0].id }));
        }
      } catch (err) {
        console.error('Failed to fetch workspaces:', err);
      } finally {
        setLoadingWorkspaces(false);
      }
    };
    fetchWorkspaces();
  }, []);

  // Get capabilities for selected workspace
  const selectedWorkspace = workspaces.find(ws => ws.id === formData.workspaceId);
  const availableCapabilities = selectedWorkspace?.capabilities || [];

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof TaskFormData, string>> = {};

    if (!formData.workspaceId) {
      newErrors.workspaceId = 'Workspace selection is required';
    }
    if (!formData.prompt.trim()) {
      newErrors.prompt = 'Prompt is required';
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

  const handleTextChange = (field: 'title' | 'prompt') => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCapabilityToggle = (capability: string) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter(c => c !== capability)
        : [...prev.capabilities, capability]
    }));
  };

  // Image handling
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remainingSlots = MAX_IMAGES - formData.images.length;

    if (remainingSlots <= 0) {
      setErrors(prev => ({ ...prev, images: `Maximum ${MAX_IMAGES} images allowed` }));
      return;
    }

    const filesToProcess = fileArray.slice(0, remainingSlots);
    const newImages: ImageAttachment[] = [];

    for (const file of filesToProcess) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        continue;
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setErrors(prev => ({
          ...prev,
          images: `Image "${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB limit`
        }));
        continue;
      }

      // Read file as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        dataUrl
      });
    }

    if (newImages.length > 0) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...newImages]
      }));
      setErrors(prev => ({ ...prev, images: undefined }));
    }
  }, [formData.images.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      formData.images.forEach(img => URL.revokeObjectURL(img.preview));
    };
  }, []);

  return (
    <form
      className="spec-submission-form"
      onSubmit={handleSubmit}
      aria-label="Task Creation Form"
    >
      <h2 className="spec-form__title">Create New Task</h2>

      {/* Title (optional) */}
      <div className="spec-form__field">
        <label htmlFor="title" className="spec-form__label">
          Title
        </label>
        <input
          type="text"
          id="title"
          name="title"
          className="spec-form__textarea"
          style={{ resize: 'none', height: 'auto', padding: '0.75rem' }}
          value={formData.title}
          onChange={handleTextChange('title')}
          placeholder="Optional task title..."
          aria-label="Task Title"
        />
      </div>

      {/* Prompt (required) */}
      <div className="spec-form__field">
        <label htmlFor="prompt" className="spec-form__label">
          Prompt <span className="spec-form__required">*</span>
        </label>
        <textarea
          id="prompt"
          name="prompt"
          className={`spec-form__textarea ${errors.prompt ? 'spec-form__textarea--error' : ''}`}
          value={formData.prompt}
          onChange={handleTextChange('prompt')}
          placeholder="Describe the task in detail. Supports markdown..."
          aria-required="true"
          aria-invalid={!!errors.prompt}
          aria-describedby={errors.prompt ? 'prompt-error' : undefined}
          rows={8}
        />
        {errors.prompt && (
          <span id="prompt-error" className="spec-form__error" role="alert">
            {errors.prompt}
          </span>
        )}
      </div>

      {/* Priority Dropdown */}
      <div className="spec-form__field">
        <label htmlFor="priority" className="spec-form__label">
          Priority
        </label>
        <select
          id="priority"
          name="priority"
          className="spec-form__select"
          value={formData.priority}
          onChange={(e) => setFormData(prev => ({
            ...prev,
            priority: e.target.value as 'normal' | 'high' | 'critical'
          }))}
        >
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Workspace Dropdown */}
      <div className="spec-form__field">
        <label htmlFor="workspace" className="spec-form__label">
          Workspace <span className="spec-form__required">*</span>
        </label>
        <select
          id="workspace"
          name="workspace"
          className={`spec-form__select ${errors.workspaceId ? 'spec-form__select--error' : ''}`}
          value={formData.workspaceId}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              workspaceId: e.target.value,
              capabilities: [] // Reset capabilities when workspace changes
            }));
            if (errors.workspaceId) {
              setErrors(prev => ({ ...prev, workspaceId: undefined }));
            }
          }}
          disabled={loadingWorkspaces}
          aria-required="true"
          aria-invalid={!!errors.workspaceId}
          aria-describedby={errors.workspaceId ? 'workspace-error' : undefined}
        >
          <option value="">
            {loadingWorkspaces ? 'Loading workspaces...' : 'Select a workspace'}
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.path} ({ws.agentCount} agent{ws.agentCount !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
        {errors.workspaceId && (
          <span id="workspace-error" className="spec-form__error" role="alert">
            {errors.workspaceId}
          </span>
        )}
      </div>

      {/* Role/Capability Checkboxes */}
      {formData.workspaceId && availableCapabilities.length > 0 && (
        <div className="spec-form__field">
          <label className="spec-form__label">
            Required Capabilities (optional)
          </label>
          <div className="task-form__capabilities">
            {availableCapabilities.map((cap) => (
              <label key={cap} className="task-form__capability-label">
                <input
                  type="checkbox"
                  checked={formData.capabilities.includes(cap)}
                  onChange={() => handleCapabilityToggle(cap)}
                  className="task-form__capability-checkbox"
                />
                <span className="task-form__capability-name">{cap}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Image Attachments */}
      <div className="spec-form__field">
        <label className="spec-form__label">
          Image Attachments ({formData.images.length}/{MAX_IMAGES})
        </label>
        <div
          className={`task-form__dropzone ${isDragging ? 'task-form__dropzone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          aria-label="Click or drag to upload images"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <span className="task-form__dropzone-text">
            {isDragging ? 'Drop images here' : 'Click or drag images here'}
          </span>
          <span className="task-form__dropzone-hint">
            Max {MAX_IMAGES} images, {MAX_IMAGE_SIZE_MB}MB each
          </span>
        </div>
        {errors.images && (
          <span className="spec-form__error" role="alert">
            {errors.images}
          </span>
        )}

        {/* Image Previews */}
        {formData.images.length > 0 && (
          <div className="task-form__image-previews">
            {formData.images.map((img, index) => (
              <div key={index} className="task-form__image-preview">
                <img src={img.preview} alt={`Attachment ${index + 1}`} />
                <button
                  type="button"
                  className="task-form__image-remove"
                  onClick={() => removeImage(index)}
                  aria-label={`Remove image ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
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
              Creating...
            </>
          ) : (
            'Create Task'
          )}
        </button>
      </div>
    </form>
  );
}
