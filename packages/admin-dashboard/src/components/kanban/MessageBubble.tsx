import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Reply, CornerDownRight, CheckCircle } from "lucide-react";

interface MessageData {
  id?: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  isRead?: boolean;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  images?: Array<{ dataUrl: string; name?: string }>;
}

interface MessageBubbleProps {
  message: MessageData;
  parentMessage?: MessageData | null;
  hasAgentReply: boolean;
  assignedTo?: string;
  isReplyTarget: boolean;
  rounds: string;
  onReply: (msgId: string) => void;
  onPreviewImage: (url: string) => void;
}

/**
 * Renders a single message bubble in the message thread.
 * Handles user messages, agent messages, replies, images, and read status.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  parentMessage,
  hasAgentReply,
  assignedTo,
  isReplyTarget,
  rounds,
  onReply,
  onPreviewImage
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 animate-message-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] p-3 text-xs shadow-sm ${rounds} ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-slate-800 text-slate-100 border border-slate-700'
        } ${isReplyTarget ? 'ring-2 ring-yellow-400' : ''}`}
      >
        {/* Reply context */}
        {parentMessage && (
          <div className="flex items-center gap-1 mb-2 text-compact opacity-70 bg-black/20 px-2 py-1 -mx-1">
            <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate italic">Re: {parentMessage.content.slice(0, 40)}...</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`font-bold ${isUser ? 'text-primary' : 'text-blue-400'}`}>
            {isUser ? 'YOU' : (message.metadata?.agentId as string || assignedTo || 'AGENT')}
          </span>
          <span className="text-compact opacity-50">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {/* Status badges for user messages */}
          {isUser && message.isRead === false && (
            <Badge className={`bg-amber-500 text-white text-compact px-1 py-0 ${rounds}`}>PENDING</Badge>
          )}
          {isUser && message.isRead === true && !hasAgentReply && (
            <Badge className={`bg-yellow-500 text-black text-compact px-1 py-0 ${rounds}`}>PENDING</Badge>
          )}
          {isUser && hasAgentReply && (
            <span title="Replied"><CheckCircle className="h-3 w-3 text-green-500" /></span>
          )}
        </div>

        {/* Content */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {message.images.map((img, imgIdx) => (
              <img
                key={imgIdx}
                src={img.dataUrl}
                alt={img.name || 'Image'}
                className={`max-h-24 border border-primary/20 cursor-pointer hover:opacity-80 ${rounds}`}
                onClick={() => onPreviewImage(img.dataUrl)}
              />
            ))}
          </div>
        )}

        {/* Reply button for agent messages */}
        {message.id && message.role === 'agent' && (
          <button
            onClick={() => onReply(message.id!)}
            className="mt-1 flex items-center gap-1 text-compact text-primary/50 hover:text-primary"
          >
            <Reply className="h-3 w-3" /> Reply
          </button>
        )}
      </div>
    </div>
  );
};
