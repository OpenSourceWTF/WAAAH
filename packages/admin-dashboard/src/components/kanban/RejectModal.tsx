import React from 'react';

interface RejectModalProps {
  isOpen: boolean;
  feedback: string;
  onFeedbackChange: (feedback: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  feedback,
  onFeedbackChange,
  onConfirm,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border-2 border-primary p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-bold text-primary mb-4">Reject Task</h3>
        <p className="text-sm text-primary/70 mb-4">Please provide feedback for why this task is being rejected:</p>
        <textarea
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          placeholder="Enter rejection feedback..."
          className="w-full h-24 p-3 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary resize-none"
        />
        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-primary/30 text-primary/70 hover:bg-primary/10">Cancel</button>
          <button onClick={onConfirm} disabled={!feedback.trim()} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Confirm Reject</button>
        </div>
      </div>
    </div>
  );
};
