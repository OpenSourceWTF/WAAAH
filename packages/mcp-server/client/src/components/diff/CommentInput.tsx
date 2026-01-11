import React from 'react';
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface CommentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function CommentInput({ value, onChange, onSubmit, onCancel }: CommentInputProps) {
  return (
    <div className="ml-24 my-2 mr-2 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a comment..."
        className="flex-1 h-8 px-2 text-xs bg-black/50 border border-primary/50 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <Button
        variant="default"
        size="sm"
        className="h-8 w-8 p-0 bg-primary"
        onClick={onSubmit}
        disabled={!value.trim()}
      >
        <Send className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
