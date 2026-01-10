/**
 * @fileoverview Abstract base class for CLI agent implementations.
 * All CLI agents (gemini, claude, etc.) extend this class to provide
 * a unified interface for PTY-based agent execution.
 */

/**
 * Configuration options for agent initialization.
 * @interface AgentConfig
 */
export interface AgentConfig {
  /** Working directory for the agent process */
  workingDirectory: string;
  /** Path to the workflow file to execute */
  workflowPath?: string;
  /** Environment variables to pass to the agent process */
  env?: Record<string, string>;
  /** Log output to file path (optional) */
  logFile?: string;
}

/**
 * Callback type for output events.
 * @callback OutputCallback
 * @param data - The output data received from the agent
 */
export type OutputCallback = (data: string) => void;

/**
 * Callback type for error events.
 * @callback ErrorCallback
 * @param data - The error data received from the agent
 */
export type ErrorCallback = (data: string) => void;

/**
 * Callback type for exit events.
 * @callback ExitCallback
 * @param code - The exit code of the agent process
 */
export type ExitCallback = (code: number) => void;

/**
 * Abstract base class for CLI agents.
 * 
 * This class provides a unified interface for spawning and managing
 * external CLI coding agents (gemini, claude, etc.) via PTY.
 * 
 * @abstract
 * @class BaseAgent
 * 
 * @example
 * ```typescript
 * class GeminiAgent extends BaseAgent {
 *   readonly name = 'gemini';
 *   readonly command = 'gemini';
 *   readonly configPath = '~/.gemini/settings.json';
 *   
 *   async spawn(): Promise<void> {
 *     // Implementation using node-pty
 *   }
 * }
 * ```
 */
export abstract class BaseAgent {
  /**
   * Human-readable name of the agent.
   * @abstract
   * @example 'Gemini', 'Claude'
   */
  abstract readonly name: string;

  /**
   * CLI command to spawn the agent process.
   * @abstract
   * @example 'gemini', 'claude'
   */
  abstract readonly command: string;

  /**
   * Path to the MCP configuration file for this agent.
   * @abstract
   * @example '~/.gemini/settings.json', '~/.claude/claude_desktop_config.json'
   */
  abstract readonly configPath: string;

  /**
   * Configuration options for this agent instance.
   * @protected
   */
  protected config: AgentConfig;

  /**
   * Registered output callbacks.
   * @protected
   */
  protected outputCallbacks: OutputCallback[] = [];

  /**
   * Registered error callbacks.
   * @protected
   */
  protected errorCallbacks: ErrorCallback[] = [];

  /**
   * Registered exit callbacks.
   * @protected
   */
  protected exitCallbacks: ExitCallback[] = [];

  /**
   * Whether the agent process is currently running.
   * @protected
   */
  protected running: boolean = false;

  /**
   * Creates an instance of BaseAgent.
   * @param config - Configuration options for the agent
   */
  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Spawns the agent process in a PTY.
   * 
   * @abstract
   * @returns A promise that resolves when the agent is ready
   * @throws {Error} If the agent fails to spawn
   * 
   * @example
   * ```typescript
   * const agent = new GeminiAgent({ workingDirectory: '/project' });
   * await agent.spawn();
   * ```
   */
  abstract spawn(): Promise<void>;

  /**
   * Terminates the agent process.
   * 
   * @abstract
   * @returns A promise that resolves when the agent is terminated
   * 
   * @example
   * ```typescript
   * await agent.kill();
   * ```
   */
  abstract kill(): Promise<void>;

  /**
   * Sends input text to the agent's stdin.
   * 
   * @abstract
   * @param text - The text to send to the agent
   * 
   * @example
   * ```typescript
   * agent.sendInput('/waaah-orc\n');
   * ```
   */
  abstract sendInput(text: string): void;

  /**
   * Registers a callback for stdout output events.
   * 
   * @param callback - The callback to invoke on output
   * 
   * @example
   * ```typescript
   * agent.onOutput((data) => console.log('Agent output:', data));
   * ```
   */
  onOutput(callback: OutputCallback): void {
    this.outputCallbacks.push(callback);
  }

  /**
   * Registers a callback for stderr error events.
   * 
   * @param callback - The callback to invoke on errors
   * 
   * @example
   * ```typescript
   * agent.onError((data) => console.error('Agent error:', data));
   * ```
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Registers a callback for process exit events.
   * 
   * @param callback - The callback to invoke on exit
   * 
   * @example
   * ```typescript
   * agent.onExit((code) => console.log('Agent exited with code:', code));
   * ```
   */
  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  /**
   * Returns whether the agent process is currently running.
   * 
   * @returns True if the agent is running, false otherwise
   * 
   * @example
   * ```typescript
   * if (agent.isRunning()) {
   *   console.log('Agent is active');
   * }
   * ```
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Emits output data to all registered output callbacks.
   * @protected
   * @param data - The output data to emit
   */
  protected emitOutput(data: string): void {
    for (const callback of this.outputCallbacks) {
      callback(data);
    }
  }

  /**
   * Emits error data to all registered error callbacks.
   * @protected
   * @param data - The error data to emit
   */
  protected emitError(data: string): void {
    for (const callback of this.errorCallbacks) {
      callback(data);
    }
  }

  /**
   * Emits exit code to all registered exit callbacks.
   * @protected
   * @param code - The exit code to emit
   */
  protected emitExit(code: number): void {
    this.running = false;
    for (const callback of this.exitCallbacks) {
      callback(code);
    }
  }
}
