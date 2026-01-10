/**
 * WorkflowInjector - Send workflow content to CLI agents
 * 
 * Reads workflow files from `.agent/workflows/<name>.md` and injects
 * them as initial prompts to CLI agents via stdin.
 * 
 * @packageDocumentation
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/** Default chunk size for large workflows (in bytes) */
const DEFAULT_CHUNK_SIZE = 4096;

/** Default delay between chunks (in milliseconds) */
const DEFAULT_CHUNK_DELAY = 50;

/**
 * Options for workflow injection.
 */
export interface InjectOptions {
  /** Size of each chunk for large workflows (default: 4096 bytes) */
  chunkSize?: number;
  /** Delay between chunks in milliseconds (default: 50ms) */
  chunkDelay?: number;
  /** Callback for logging injection progress */
  onProgress?: (message: string) => void;
}

/**
 * Result of a workflow injection operation.
 */
export interface InjectResult {
  /** Whether injection succeeded */
  success: boolean;
  /** Number of characters sent */
  charsSent: number;
  /** Number of chunks sent */
  chunksSent: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Error thrown when workflow file is not found.
 */
export class WorkflowNotFoundError extends Error {
  readonly workflowName: string;
  readonly searchedPath: string;

  constructor(workflowName: string, searchedPath: string) {
    super(`Workflow not found: ${workflowName} (searched: ${searchedPath})`);
    this.name = 'WorkflowNotFoundError';
    this.workflowName = workflowName;
    this.searchedPath = searchedPath;
  }
}

/**
 * Handles reading and injecting workflows into CLI agents.
 * 
 * @example
 * ```typescript
 * const injector = new WorkflowInjector('/path/to/project');
 * const content = await injector.read('waaah-orc');
 * 
 * // Send to agent
 * await injector.inject(content, (text) => agent.sendInput(text), {
 *   onProgress: (msg) => console.log(msg)
 * });
 * ```
 */
export class WorkflowInjector {
  private workspaceRoot: string;

  /**
   * Creates a new WorkflowInjector.
   * @param workspaceRoot - Root directory of the workspace (git root)
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Gets the path to a workflow file.
   * @param workflowName - Name of the workflow (without .md extension)
   * @returns Absolute path to the workflow file
   */
  public getWorkflowPath(workflowName: string): string {
    // Remove leading slash if present (e.g., /waaah-orc -> waaah-orc)
    const cleanName = workflowName.startsWith('/')
      ? workflowName.slice(1)
      : workflowName;

    return path.join(this.workspaceRoot, '.agent', 'workflows', `${cleanName}.md`);
  }

  /**
   * Checks if a workflow file exists.
   * @param workflowName - Name of the workflow
   * @returns Promise resolving to true if the workflow exists
   */
  public async exists(workflowName: string): Promise<boolean> {
    const workflowPath = this.getWorkflowPath(workflowName);
    try {
      await fs.access(workflowPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lists all available workflows in the workspace.
   * @returns Promise resolving to array of workflow names (without .md)
   */
  public async list(): Promise<string[]> {
    const workflowsDir = path.join(this.workspaceRoot, '.agent', 'workflows');

    try {
      const files = await fs.readdir(workflowsDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''));
    } catch {
      return [];
    }
  }

  /**
   * Reads the content of a workflow file.
   * @param workflowName - Name of the workflow
   * @returns Promise resolving to the workflow content
   * @throws {WorkflowNotFoundError} If the workflow file doesn't exist
   * 
   * @example
   * ```typescript
   * const content = await injector.read('waaah-orc');
   * console.log(content); // "# WAAAH Orchestrator\n..."
   * ```
   */
  public async read(workflowName: string): Promise<string> {
    const workflowPath = this.getWorkflowPath(workflowName);

    try {
      return await fs.readFile(workflowPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new WorkflowNotFoundError(workflowName, workflowPath);
      }
      throw error;
    }
  }

  /**
   * Injects workflow content into an agent via stdin.
   * 
   * For large workflows, content is split into chunks with delays
   * to prevent overwhelming the agent's input buffer.
   * 
   * @param content - The workflow content to inject
   * @param sendInput - Function to send input to the agent (e.g., agent.sendInput)
   * @param options - Injection options
   * @returns Promise resolving to the injection result
   * 
   * @example
   * ```typescript
   * const result = await injector.inject(
   *   workflowContent,
   *   (text) => agent.sendInput(text),
   *   {
   *     chunkSize: 2048,
   *     chunkDelay: 100,
   *     onProgress: (msg) => console.log('[Inject]', msg)
   *   }
   * );
   * 
   * if (result.success) {
   *   console.log(`Sent ${result.charsSent} chars in ${result.chunksSent} chunks`);
   * }
   * ```
   */
  public async inject(
    content: string,
    sendInput: (text: string) => void,
    options: InjectOptions = {}
  ): Promise<InjectResult> {
    const {
      chunkSize = DEFAULT_CHUNK_SIZE,
      chunkDelay = DEFAULT_CHUNK_DELAY,
      onProgress,
    } = options;

    const log = onProgress || (() => { });

    try {
      // Prepare the content with workflow invocation prefix
      // This simulates the user typing @[/workflow-name]
      const preparedContent = content.trim() + '\n';

      log(`Injecting workflow (${preparedContent.length} chars)`);

      let charsSent = 0;
      let chunksSent = 0;

      // Split into chunks if content is large
      if (preparedContent.length <= chunkSize) {
        // Small content - send all at once
        sendInput(preparedContent);
        charsSent = preparedContent.length;
        chunksSent = 1;
        log(`Sent complete workflow (1 chunk)`);
      } else {
        // Large content - chunk it
        const totalChunks = Math.ceil(preparedContent.length / chunkSize);
        log(`Splitting into ${totalChunks} chunks`);

        for (let i = 0; i < preparedContent.length; i += chunkSize) {
          const chunk = preparedContent.slice(i, i + chunkSize);
          sendInput(chunk);
          charsSent += chunk.length;
          chunksSent++;

          log(`Sent chunk ${chunksSent}/${totalChunks} (${chunk.length} chars)`);

          // Delay between chunks (except for last chunk)
          if (i + chunkSize < preparedContent.length) {
            await this.delay(chunkDelay);
          }
        }
      }

      log(`Injection complete: ${charsSent} chars, ${chunksSent} chunks`);

      return {
        success: true,
        charsSent,
        chunksSent,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Injection failed: ${errorMessage}`);

      return {
        success: false,
        charsSent: 0,
        chunksSent: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Convenience method to read and inject a workflow by name.
   * 
   * @param workflowName - Name of the workflow to inject
   * @param sendInput - Function to send input to the agent
   * @param options - Injection options
   * @returns Promise resolving to the injection result
   * @throws {WorkflowNotFoundError} If the workflow file doesn't exist
   * 
   * @example
   * ```typescript
   * const result = await injector.injectWorkflow(
   *   'waaah-orc',
   *   (text) => agent.sendInput(text),
   *   { onProgress: console.log }
   * );
   * ```
   */
  public async injectWorkflow(
    workflowName: string,
    sendInput: (text: string) => void,
    options: InjectOptions = {}
  ): Promise<InjectResult> {
    const content = await this.read(workflowName);
    return this.inject(content, sendInput, options);
  }

  /**
   * Helper to create a delay.
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
