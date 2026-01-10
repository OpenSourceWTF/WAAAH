/**
 * Monitor module exports.
 */

export {
  LoopDetector,
  type LoopDetectionResult,
  type LoopExitCallback,
} from './loop-detector.js';

export {
  RestartHandler,
  type RestartEvent,
  type RestartEventType,
  type RestartHandlerOptions,
} from './restart-handler.js';
