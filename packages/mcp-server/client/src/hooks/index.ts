/**
 * Custom hooks for Dashboard data management
 * 
 * These hooks encapsulate data fetching with deduplication to prevent
 * unnecessary re-renders that interrupt CSS animations.
 */

export { useTaskData, type Task } from './useTaskData';
export { useAgentData, type Agent, type AgentStatusColor } from './useAgentData';
export { useWebSocket, type WebSocketStatus, type SyncFullPayload, type UseWebSocketOptions, type UseWebSocketResult } from './useWebSocket';
