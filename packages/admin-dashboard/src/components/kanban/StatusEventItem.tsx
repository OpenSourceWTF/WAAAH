import React from 'react';

interface StatusEventItemProps {
  status: string;
  timestamp: number;
  roundsFull: string;
}

/**
 * Renders a compact status event indicator in the message timeline.
 * Shows status changes (QUEUED, ASSIGNED, IN_PROGRESS, etc.) with timestamp.
 */
export const StatusEventItem: React.FC<StatusEventItemProps> = ({
  status,
  timestamp,
  roundsFull
}) => {
  return (
    <div className="flex justify-center my-1">
      <div className={`flex items-center gap-1.5 text-compact text-primary/40 px-2 py-0.5 ${roundsFull}`}>
        <span className={`h-1 w-1 bg-primary/30 ${roundsFull}`} />
        <span className="font-mono uppercase tracking-wider">{status}</span>
        <span className="opacity-60">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};
