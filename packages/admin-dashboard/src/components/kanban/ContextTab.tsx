import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipInput } from "@/components/ui/ChipInput";
import { X, Edit, Save } from "lucide-react";
import type { Task } from './types';
import { formatDate } from './utils';

// Hook to fetch capability suggestions from the API
function useCapabilitySuggestions() {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        const response = await fetch('/admin/capabilities');
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.capabilities || []);
        }
      } catch (error) {
        console.error('Failed to fetch capabilities:', error);
      }
    };
    fetchCapabilities();
  }, []);

  return suggestions;
}

interface ContextTabProps {
  task: Task;
  onUpdateTask?: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
}

interface WorkspaceContext {
  type: string;
  repoId: string;
  branch?: string;
  path?: string;
}

export const ContextTab: React.FC<ContextTabProps> = ({ task, onUpdateTask }) => {
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editedWorkspace, setEditedWorkspace] = useState<WorkspaceContext>(
    task.workspaceContext || { type: 'local', repoId: '', branch: '', path: '' }
  );
  const [editedCapabilities, setEditedCapabilities] = useState<string[]>(
    task.to?.requiredCapabilities || []
  );
  const capabilitySuggestions = useCapabilitySuggestions();

  // Update local state when task changes (unless currently editing)
  useEffect(() => {
    if (!isEditingContext) {
      setEditedWorkspace(task.workspaceContext || { type: 'local', repoId: '', branch: '', path: '' });
      setEditedCapabilities(task.to?.requiredCapabilities || []);
    }
  }, [task, isEditingContext]);

  const handleSaveContext = async () => {
    if (!onUpdateTask) return;
    try {
      await onUpdateTask(task.id, {
        workspaceContext: editedWorkspace,
        requiredCapabilities: editedCapabilities
      });
      setIsEditingContext(false);
    } catch (e) {
      console.error("Failed to update context", e);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-3 min-h-0">
      <div className="shrink-0 flex items-center justify-between">
        <h3 className="text-sm font-bold text-primary/70 mb-1">TASK METADATA</h3>
        {onUpdateTask && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-primary/20"
            onClick={() => setIsEditingContext(!isEditingContext)}
          >
            {isEditingContext ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-black/30 p-2 border border-primary/20">
          <span className="text-primary/50 text-xs">ID:</span>
          <p className="font-mono text-sm break-all">{task.id}</p>
        </div>
        <div className="bg-black/30 p-2 border border-primary/20">
          <span className="text-primary/50 text-xs">Status:</span>
          <p className="font-mono text-sm">{task.status}</p>
        </div>
        <div className="bg-black/30 p-2 border border-primary/20">
          <span className="text-primary/50 text-xs">Created:</span>
          <p className="font-mono text-sm">{formatDate(task.createdAt)}</p>
        </div>
        <div className="bg-black/30 p-2 border border-primary/20">
          <span className="text-primary/50 text-xs">Assigned To:</span>
          <p className="font-mono text-sm">{task.assignedTo || task.to?.agentId || 'Unassigned'}</p>
        </div>
      </div>

      {/* Routing / Workspace Context */}
      <div className="shrink-0 mt-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-primary/70">WORKSPACE CONTEXT</h3>
          {isEditingContext && (
            <Button variant="default" size="sm" className="h-6 gap-1 text-compact bg-green-600 hover:bg-green-700" onClick={handleSaveContext}>
              <Save className="h-3 w-3" /> Save Changes
            </Button>
          )}
        </div>

        {isEditingContext ? (
          <div className="bg-black/30 p-3 border border-primary/30 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-compact text-primary/50 block mb-1">Type</label>
                <select
                  className="w-full bg-black border border-primary/30 p-1 text-xs"
                  value={editedWorkspace.type || 'local'}
                  onChange={e => setEditedWorkspace({ ...editedWorkspace, type: e.target.value })}
                >
                  <option value="local">Local</option>
                  <option value="github">GitHub</option>
                </select>
              </div>
              <div>
                <label className="text-compact text-primary/50 block mb-1">Repo ID</label>
                <input
                  className="w-full bg-black border border-primary/30 p-1 text-xs"
                  value={editedWorkspace.repoId || ''}
                  onChange={e => setEditedWorkspace({ ...editedWorkspace, repoId: e.target.value })}
                  placeholder="Owner/Repo"
                />
              </div>
              <div>
                <label className="text-compact text-primary/50 block mb-1">Branch</label>
                <input
                  className="w-full bg-black border border-primary/30 p-1 text-xs"
                  value={editedWorkspace.branch || ''}
                  onChange={e => setEditedWorkspace({ ...editedWorkspace, branch: e.target.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <label className="text-compact text-primary/50 block mb-1">Path</label>
                <input
                  className="w-full bg-black border border-primary/30 p-1 text-xs"
                  value={editedWorkspace.path || ''}
                  onChange={e => setEditedWorkspace({ ...editedWorkspace, path: e.target.value })}
                  placeholder="/"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm bg-black/30 p-2 border border-primary/20">
            {task.workspaceContext ? (
              <>
                <div className="col-span-2 flex gap-4 border-b border-primary/10 pb-1 mb-1">
                  <div className="flex gap-1"><span className="text-primary/50 text-xs">Type:</span> <span className="font-mono">{task.workspaceContext.type}</span></div>
                  <div className="flex gap-1"><span className="text-primary/50 text-xs">Repo:</span> <span className="font-mono">{task.workspaceContext.repoId}</span></div>
                </div>
                <div><span className="text-primary/50 text-xs">Branch:</span> <span className="font-mono">{task.workspaceContext.branch || '-'}</span></div>
                <div><span className="text-primary/50 text-xs">Path:</span> <span className="font-mono">{task.workspaceContext.path || '-'}</span></div>
              </>
            ) : task.to && task.to.workspaceId ? (
              <>
                <div className="col-span-2 text-primary/40 italic text-xs mb-1">Target Workspace:</div>
                <div className="col-span-2 flex gap-1"><span className="text-primary/50 text-xs">ID:</span> <span className="font-mono">{task.to.workspaceId}</span></div>
              </>
            ) : (
              <div className="col-span-2 text-primary/40 italic text-xs">No workspace context defined (using inference)</div>
            )}
          </div>
        )}
      </div>

      {/* Capabilities */}
      <div className="shrink-0 mt-2">
        <h3 className="text-sm font-bold text-primary/70 mb-1">REQUIRED CAPABILITIES</h3>
        {isEditingContext ? (
          <ChipInput
            value={editedCapabilities}
            onChange={setEditedCapabilities}
            suggestions={capabilitySuggestions}
            placeholder="Add capability..."
          />
        ) : (
          <div className="bg-black/30 p-2 border border-primary/20 min-h-[40px]">
            {task.to?.requiredCapabilities && task.to.requiredCapabilities.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {task.to.requiredCapabilities.map(cap => (
                  <Badge key={cap} variant="outline" className="text-xs border-primary/40">{cap}</Badge>
                ))}
              </div>
            ) : (
              <span className="text-primary/40 italic text-xs">No specific capabilities required</span>
            )}
          </div>
        )}
      </div>

      {task.context && (
        <div className="flex-1 flex flex-col min-h-0 pt-2">
          <h3 className="text-sm font-bold text-primary/70 mb-1 shrink-0">CONTEXT OBJECT</h3>
          <pre className="whitespace-pre-wrap text-sm bg-black/30 p-4 border border-primary/20 flex-1 overflow-y-auto">{JSON.stringify(task.context, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
