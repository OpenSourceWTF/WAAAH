import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import type { ReviewComment } from '@/utils/diffParser';

interface CommentThreadProps {
  comment: ReviewComment;
  replies: ReviewComment[];
}

export function CommentThread({ comment, replies }: CommentThreadProps) {
  return (
    <div className="ml-24 my-1 mr-2">
      <div className={`p-2 border-l-2 ${comment.resolved ? 'border-green-500/50 bg-green-500/5' : 'border-orange-500 bg-orange-500/5'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold ${comment.authorRole === 'user' ? 'text-primary' : 'text-blue-400'}`}>
            {comment.authorRole === 'user' ? 'You' : comment.authorId || 'Agent'}
          </span>
          <span className="text-[10px] text-primary/40">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
          {comment.resolved && (
            <Badge className="bg-green-600 text-white text-[10px] h-4">
              <Check className="h-2 w-2 mr-1" /> Resolved
            </Badge>
          )}
        </div>
        <p className="text-xs text-foreground/80">{comment.content}</p>

        {/* Replies */}
        {replies.map(reply => (
          <div key={reply.id} className="mt-2 pl-3 border-l border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-400">Agent</span>
              <span className="text-[10px] text-primary/40">
                {new Date(reply.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-foreground/80">{reply.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
