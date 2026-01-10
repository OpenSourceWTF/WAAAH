import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, Reply, CornerDownRight, ImagePlus, Send, CheckCircle } from "lucide-react";
import type { Task } from './types';

interface MessageThreadProps {
  task: Task;
  width: number;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: Array<{ id: string; dataUrl: string; mimeType: string; name: string }>) => void;
  onPreviewImage: (url: string) => void;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  task,
  width,
  onSendComment,
  onPreviewImage
}) => {
  // Reply state
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const replyToMsg = task.messages?.find(m => m.id === replyToId);

  // Input state
  const [inputMessage, setInputMessage] = useState('');

  // Image upload state
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; dataUrl: string; name: string; mimeType: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }, 50);
    return () => clearTimeout(timer);
  }, [task.id, task.messages?.length]);

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/') && pendingImages.length < 5) {
        const file = items[i].getAsFile();
        if (file && file.size <= 2 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = () => setPendingImages(prev => [...prev, { id: crypto.randomUUID(), dataUrl: reader.result as string, name: file.name || 'pasted.png', mimeType: file.type }]);
          reader.readAsDataURL(file);
        }
      }
    }
  }, [pendingImages.length]);

  // Handle file upload
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length && pendingImages.length < 5; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') && file.size <= 2 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => setPendingImages(prev => [...prev, { id: crypto.randomUUID(), dataUrl: reader.result as string, name: file.name, mimeType: file.type }]);
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  }, [pendingImages.length]);

  const handleReply = (msgId: string) => setReplyToId(msgId);
  const handleCancelReply = () => setReplyToId(null);

  const handleSendMessage = () => {
    if (inputMessage.trim() || pendingImages.length > 0) {
      onSendComment(task.id, inputMessage.trim(), replyToId || undefined, pendingImages.length > 0 ? pendingImages : undefined);
      setInputMessage('');
      setPendingImages([]);
      handleCancelReply();
    }
  };

  return (
    <div
      className="flex-shrink-0 flex flex-col border-l-2 border-primary/30"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-primary">MESSAGES</span>
          {(task.messages?.filter(m => m.role === 'user' && m.isRead === false).length ?? 0) > 0 && (
            <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0.5">
              {task.messages?.filter(m => m.role === 'user' && m.isRead === false).length} PENDING
            </Badge>
          )}
        </div>
      </div>

      {/* Message List with Interleaved Timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-black/20">
        {/* Prompt Injection */}
        <div className="flex gap-2 justify-start">
          <div className="max-w-[90%] p-2 rounded text-xs bg-amber-600 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-amber-800 text-white text-[10px] px-1 py-0">PROMPT</Badge>
              <span className="text-[10px] opacity-70">
                {new Date(task.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="whitespace-pre-wrap break-words">{task.prompt}</div>
          </div>
        </div>

        {/* Build interleaved timeline: messages + status events */}
        {(() => {
          type TimelineItem =
            | { type: 'message'; data: NonNullable<typeof task.messages>[0]; timestamp: number }
            | { type: 'status'; data: NonNullable<typeof task.history>[0]; timestamp: number };

          const items: TimelineItem[] = [];

          // Add messages
          task.messages?.forEach(msg => {
            items.push({ type: 'message', data: msg, timestamp: msg.timestamp });
          });

          // Add status history events
          task.history?.forEach(evt => {
            items.push({ type: 'status', data: evt, timestamp: evt.timestamp });
          });

          // Sort chronologically
          items.sort((a, b) => a.timestamp - b.timestamp);

          if (items.length === 0) {
            return (
              <div className="text-center text-primary/40 text-xs py-4">
                No messages yet. Send a comment below.
              </div>
            );
          }

          return items.map((item, idx) => {
            if (item.type === 'status') {
              // Status event indicator
              const evt = item.data;
              return (
                <div key={`status-${idx}`} className="flex justify-center">
                  <div className="flex items-center gap-2 text-[10px] text-primary/50 bg-primary/10 px-2 py-1 border border-primary/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                    <span className="font-mono">{evt.status}</span>
                    {evt.agentId && <span>• {evt.agentId}</span>}
                    <span>{new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            }

            // Message
            const msg = item.data;
            const parentMsg = msg.replyTo ? task.messages?.find(m => m.id === msg.replyTo) : null;
            const hasAgentReply = msg.role === 'user' && task.messages?.some(m => m.replyTo === msg.id && m.role === 'agent');

            return (
              <div
                key={`msg-${idx}`}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-2 rounded text-xs ${msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-100'
                    } ${replyToId === msg.id ? 'ring-2 ring-yellow-400' : ''}`}
                >
                  {parentMsg && (
                    <div className="flex items-center gap-1 mb-1 text-[10px] opacity-60">
                      <CornerDownRight className="h-2.5 w-2.5" />
                      <span className="truncate">↳ {parentMsg.content.slice(0, 30)}...</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-bold ${msg.role === 'user' ? 'text-primary' : 'text-blue-400'}`}>
                      {msg.role === 'user' ? 'YOU' : (msg.metadata?.agentId as string || task.assignedTo || 'AGENT')}
                    </span>
                    <span className="text-[10px] opacity-50">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    {msg.role === 'user' && msg.isRead === false && (
                      <Badge className="bg-amber-500 text-white text-[10px] px-1 py-0">PENDING</Badge>
                    )}
                    {msg.role === 'user' && msg.isRead === true && !hasAgentReply && (
                      <Badge className="bg-yellow-500 text-black text-[10px] px-1 py-0">PENDING</Badge>
                    )}
                    {msg.role === 'user' && hasAgentReply && (
                      <span title="Replied"><CheckCircle className="h-3 w-3 text-green-500" /></span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {/* Images */}
                  {msg.metadata?.images && Array.isArray(msg.metadata.images) && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {(msg.metadata.images as Array<{ dataUrl: string; name?: string }>).map((img, imgIdx) => (
                        <img
                          key={imgIdx}
                          src={img.dataUrl}
                          alt={img.name || 'Image'}
                          className="max-h-24 rounded border border-primary/20 cursor-pointer hover:opacity-80"
                          onClick={() => onPreviewImage(img.dataUrl)}
                        />
                      ))}
                    </div>
                  )}
                  {msg.id && msg.role === 'agent' && (
                    <button onClick={() => handleReply(msg.id!)} className="mt-1 flex items-center gap-1 text-[10px] text-primary/50 hover:text-primary">
                      <Reply className="h-3 w-3" /> Reply
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex flex-col bg-primary/5 border-t border-primary/20">
        {replyToId && replyToMsg && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/20">
            <CornerDownRight className="h-3 w-3 text-primary/60" />
            <span className="text-[10px] text-primary/60 truncate flex-1">
              Replying: {replyToMsg.content.slice(0, 50)}...
            </span>
            <button onClick={handleCancelReply} className="text-primary/40 hover:text-primary text-xs">×</button>
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="flex gap-3 px-3 py-3 border-b border-primary/20 bg-black/10 overflow-x-auto">
            {pendingImages.map((img) => (
              <div key={img.id} className="relative shrink-0 w-20 h-20 rounded-lg border-2 border-primary/40 overflow-visible cursor-pointer shadow-sm hover:shadow-md transition-shadow">
                <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover rounded-lg" onClick={() => onPreviewImage(img.dataUrl)} />
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingImages(prev => prev.filter(i => i.id !== img.id)); }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center shadow-lg hover:scale-110"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
        <div className="flex items-start gap-2 p-2">
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
              if (e.key === 'Escape' && replyToId) handleCancelReply();
            }}
            placeholder={replyToId ? "Type a reply..." : "Type a comment..."}
            className="flex-1 min-h-[32px] px-3 py-1.5 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary resize-none overflow-hidden"
            style={{ maxHeight: '120px' }}
          />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary/60 hover:text-primary" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button variant="default" size="sm" className="h-8 w-8 p-0 bg-primary hover:bg-primary/80" onClick={handleSendMessage} disabled={!inputMessage.trim() && pendingImages.length === 0}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
