import React, { useState, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { CornerDownRight, ImagePlus, Send } from "lucide-react";

interface PendingImage {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
}

interface MessageInputProps {
  taskId: string;
  replyToId: string | null;
  replyToContent?: string;
  rounds: string;
  roundsLg: string;
  roundsFull: string;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: PendingImage[]) => void;
  onCancelReply: () => void;
  onPreviewImage: (url: string) => void;
}

/**
 * Message input area with image upload support.
 * Handles text input, image paste/upload, and sending.
 */
export const MessageInput: React.FC<MessageInputProps> = ({
  taskId,
  replyToId,
  replyToContent,
  rounds,
  roundsLg,
  roundsFull,
  onSendComment,
  onCancelReply,
  onPreviewImage
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/') && pendingImages.length < 5) {
        const file = items[i].getAsFile();
        if (file && file.size <= 2 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = () => setPendingImages(prev => [...prev, {
            id: crypto.randomUUID(),
            dataUrl: reader.result as string,
            name: file.name || 'pasted.png',
            mimeType: file.type
          }]);
          reader.readAsDataURL(file);
        }
      }
    }
  }, [pendingImages.length]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length && pendingImages.length < 5; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') && file.size <= 2 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => setPendingImages(prev => [...prev, {
          id: crypto.randomUUID(),
          dataUrl: reader.result as string,
          name: file.name,
          mimeType: file.type
        }]);
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  }, [pendingImages.length]);

  const handleSendMessage = () => {
    if (inputMessage.trim() || pendingImages.length > 0) {
      onSendComment(taskId, inputMessage.trim(), replyToId || undefined, pendingImages.length > 0 ? pendingImages : undefined);
      setInputMessage('');
      setPendingImages([]);
      onCancelReply();
    }
  };

  const removeImage = (id: string) => {
    setPendingImages(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="flex flex-col bg-primary/5 border-t border-primary/20">
      {replyToId && replyToContent && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/20">
          <CornerDownRight className="h-3 w-3 text-primary/60" />
          <span className="text-compact text-primary/60 truncate flex-1">
            Replying: {replyToContent.slice(0, 50)}...
          </span>
          <button onClick={onCancelReply} className="text-primary/40 hover:text-primary text-xs">×</button>
        </div>
      )}
      {pendingImages.length > 0 && (
        <div className="flex gap-3 px-3 py-3 border-b border-primary/20 bg-black/10 overflow-x-auto">
          {pendingImages.map((img) => (
            <div key={img.id} className={`relative shrink-0 w-20 h-20 border-2 border-primary/40 overflow-visible cursor-pointer shadow-sm hover:shadow-md transition-shadow ${roundsLg}`}>
              <img src={img.dataUrl} alt={img.name} className={`w-full h-full object-cover ${roundsLg}`} onClick={() => onPreviewImage(img.dataUrl)} />
              <button
                onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center shadow-lg hover:scale-110 ${roundsFull}`}
              >×</button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
      <div className="flex items-end gap-2 p-3">
        <textarea
          rows={1}
          value={inputMessage}
          onChange={(e) => {
            setInputMessage(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (inputMessage.trim() || pendingImages.length > 0)) {
              e.preventDefault();
              handleSendMessage();
              e.currentTarget.style.height = 'auto';
            }
            if (e.key === 'Escape' && replyToId) onCancelReply();
          }}
          placeholder={replyToId ? "Type a reply..." : "Type a comment..."}
          className={`flex-1 min-h-[36px] px-3 py-2 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 resize-none overflow-hidden font-mono ${rounds}`}
          style={{ maxHeight: '120px' }}
        />
        <Button variant="ghost" size="sm" className={`h-9 w-9 p-0 text-primary/60 hover:text-primary hover:bg-primary/10 ${rounds}`} onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className={`h-9 px-4 bg-primary hover:bg-primary/90 text-black font-bold gap-1.5 shadow-md hover:shadow-lg transition-shadow ${rounds}`}
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() && pendingImages.length === 0}
        >
          <Send className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider">Send</span>
        </Button>
      </div>
    </div>
  );
};
