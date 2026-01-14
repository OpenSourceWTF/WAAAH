import React, { useState, useRef, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";
import type { Task } from './types';
import { useTheme } from '@/contexts/ThemeContext';
import { StatusEventItem } from './StatusEventItem';
import { ResponseBubble } from './ResponseBubble';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

interface MessageThreadProps {
  task: Task;
  width: number;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: Array<{ id: string; dataUrl: string; mimeType: string; name: string }>) => void;
  onPreviewImage: (url: string) => void;
}

type TimelineItem =
  | { type: 'message'; data: NonNullable<Task['messages']>[0]; timestamp: number }
  | { type: 'status'; data: NonNullable<Task['history']>[0]; timestamp: number }
  | { type: 'response'; timestamp: number };

function buildTimeline(task: Task): TimelineItem[] {
  const items: TimelineItem[] = [];

  task.messages?.forEach(msg => {
    items.push({ type: 'message', data: msg, timestamp: msg.timestamp });
  });

  task.history?.forEach(evt => {
    items.push({ type: 'status', data: evt, timestamp: evt.timestamp });
  });

  if (task.response && task.completedAt) {
    items.push({ type: 'response', timestamp: task.completedAt });
  }

  items.sort((a, b) => a.timestamp - b.timestamp);
  return items;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  task,
  width,
  onSendComment,
  onPreviewImage
}) => {
  const { theme } = useTheme();
  const rounds = theme === 'WAAAH' ? '' : 'rounded-md';
  const roundsLg = theme === 'WAAAH' ? '' : 'rounded-lg';
  const roundsFull = theme === 'WAAAH' ? '' : 'rounded-full';

  const [replyToId, setReplyToId] = useState<string | null>(null);
  const replyToMsg = task.messages?.find(m => m.id === replyToId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }, 50);
    return () => clearTimeout(timer);
  }, [task.id, task.messages?.length]);

  const handleReply = (msgId: string) => setReplyToId(msgId);
  const handleCancelReply = () => setReplyToId(null);

  const timelineItems = buildTimeline(task);
  const unreadCount = task.messages?.filter(m => m.role === 'user' && m.isRead === false).length ?? 0;

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
          {unreadCount > 0 && (
            <Badge className={`${rounds} bg-amber-500 text-white text-xs px-1.5 py-0.5`}>
              {unreadCount} PENDING
            </Badge>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-black/20">
        {/* Prompt */}
        <div className="flex gap-2 justify-start">
          <div className={`max-w-[90%] p-3 text-xs bg-amber-600 text-white shadow-sm ${rounds}`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`bg-amber-800 text-white text-compact px-1.5 py-0.5 ${rounds}`}>PROMPT</Badge>
              <span className="text-compact opacity-70">
                {new Date(task.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="whitespace-pre-wrap break-words font-mono">{task.prompt}</div>
          </div>
        </div>

        {/* Timeline Items */}
        {timelineItems.length === 0 ? (
          <div className="text-center text-primary/40 text-xs py-4">
            No messages yet. Send a comment below.
          </div>
        ) : (
          timelineItems.map((item, idx) => {
            if (item.type === 'status') {
              return (
                <StatusEventItem
                  key={`status-${idx}`}
                  status={item.data.status}
                  timestamp={item.timestamp}
                  roundsFull={roundsFull}
                />
              );
            }

            if (item.type === 'response') {
              return (
                <ResponseBubble
                  key={`response-${idx}`}
                  response={task.response}
                  status={task.status}
                  timestamp={item.timestamp}
                  rounds={rounds}
                />
              );
            }

            const msg = item.data;
            const parentMsg = msg.replyTo ? task.messages?.find(m => m.id === msg.replyTo) : null;
            const hasAgentReply = msg.role === 'user' && task.messages?.some(m => m.replyTo === msg.id && m.role === 'agent');

            return (
              <MessageBubble
                key={`msg-${idx}`}
                message={msg}
                parentMessage={parentMsg}
                hasAgentReply={hasAgentReply ?? false}
                assignedTo={task.assignedTo}
                isReplyTarget={replyToId === msg.id}
                rounds={rounds}
                onReply={handleReply}
                onPreviewImage={onPreviewImage}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput
        taskId={task.id}
        replyToId={replyToId}
        replyToContent={replyToMsg?.content}
        rounds={rounds}
        roundsLg={roundsLg}
        roundsFull={roundsFull}
        onSendComment={onSendComment}
        onCancelReply={handleCancelReply}
        onPreviewImage={onPreviewImage}
      />
    </div>
  );
};
