import React from 'react';
import { Badge } from "@/components/ui/badge";

interface ResponseBubbleProps {
  response: unknown;
  status: string;
  timestamp: number;
  rounds: string;
}

/**
 * Renders the final response or blocked reason in the message timeline.
 * Handles both completed responses and blocked task messages.
 */
export const ResponseBubble: React.FC<ResponseBubbleProps> = ({
  response,
  status,
  timestamp,
  rounds
}) => {
  const resp = response as Record<string, unknown>;
  const isBlocked = status === 'BLOCKED';
  const blockedReason = resp?.blockedReason as string || resp?.message as string || '';

  const bgColor = isBlocked ? 'bg-orange-700' : 'bg-green-700';
  const badgeBgColor = isBlocked ? 'bg-orange-900' : 'bg-green-900';
  const badgeText = isBlocked ? 'BLOCKED' : 'RESPONSE';

  const renderContent = () => {
    if (isBlocked && blockedReason) {
      return blockedReason;
    }
    if (typeof response === 'string') return response;
    if (resp?.message && typeof resp.message === 'string') return resp.message;
    if (resp?.output && typeof resp.output === 'string') return resp.output;
    return JSON.stringify(response, null, 2);
  };

  return (
    <div className="flex gap-2 justify-start">
      <div className={`max-w-[90%] p-3 text-xs ${bgColor} text-white shadow-sm ${rounds}`}>
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`${badgeBgColor} text-white text-compact px-1.5 py-0.5 ${rounds}`}>
            {badgeText}
          </Badge>
          <span className="text-compact opacity-70">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="whitespace-pre-wrap break-words">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
