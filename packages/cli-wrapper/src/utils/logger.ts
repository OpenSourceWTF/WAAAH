/**
 * Logger - Logging utilities with file output and rotation
 * 
 * Provides logging functionality with file output and rotation.
 * Logs are stored in .waaah/logs/<agent>-<timestamp>.log
 * 
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

/** Default maximum log files to keep per agent */
const DEFAULT_MAX_FILES = 10;

/**
 * Log level enumeration.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log level name mapping.
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Log level threshold */
  level: LogLevel;
  /** Path to log directory */
  logDir: string;
  /** Agent type for log file naming */
  agentType: string;
  /** Maximum number of log files to keep (default: 10) */
  maxFiles?: number;
  /** Whether to also output to console (default: true) */
  console?: boolean;
}

/**
 * Provides logging functionality with file output and rotation.
 * 
 * Creates timestamped log files and automatically rotates old logs
 * to keep only the specified number of most recent files.
 * 
 * @example
 * ```typescript
 * const logger = new Logger({
 *   level: LogLevel.INFO,
 *   logDir: '/path/to/.waaah/logs',
 *   agentType: 'gemini',
 * });
 * 
 * await logger.init();
 * logger.info('Starting agent...');
 * logger.error('Something went wrong', error);
 * 
 * // Clean up old logs
 * await logger.rotate();
 * await logger.close();
 * ```
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private logFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private initialized = false;

  /**
   * Creates a new logger instance.
   * @param config - Logger configuration
   */
  constructor(config: LoggerConfig) {
    this.config = {
      ...config,
      maxFiles: config.maxFiles ?? DEFAULT_MAX_FILES,
      console: config.console ?? true,
    };
  }

  /**
   * Initializes the logger and creates log file.
   * Must be called before logging.
   * 
   * @example
   * ```typescript
   * const logger = new Logger(config);
   * await logger.init();
   * ```
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure log directory exists
    await fsPromises.mkdir(this.config.logDir, { recursive: true });

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.config.agentType}-${timestamp}.log`;
    this.logFile = path.join(this.config.logDir, filename);

    // Open write stream
    this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });

    this.initialized = true;

    // Write header
    const header = [
      `=== WAAAH Agent Log ===`,
      `Agent: ${this.config.agentType}`,
      `Started: ${new Date().toISOString()}`,
      `Log Level: ${LOG_LEVEL_NAMES[this.config.level]}`,
      `========================`,
      '',
    ].join('\n');

    await this.writeToFile(header);
  }

  /**
   * Gets the current log file path.
   * @returns Path to current log file, or null if not initialized
   */
  public getLogFile(): string | null {
    return this.logFile;
  }

  /**
   * Logs a debug message.
   * @param message - Log message
   * @param data - Optional data to log
   */
  public debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message.
   * @param message - Log message
   * @param data - Optional data to log
   */
  public info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message.
   * @param message - Log message
   * @param data - Optional data to log
   */
  public warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message.
   * @param message - Log message
   * @param error - Optional error object
   */
  public error(message: string, error?: unknown): void {
    this.log(LogLevel.ERROR, message, error);
  }

  /**
   * Logs raw output (typically agent stdout/stderr).
   * @param output - Raw output to log
   */
  public output(output: string): void {
    if (!this.initialized) return;

    const timestamp = new Date().toISOString();
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        const entry = `[${timestamp}] [OUTPUT] ${line}`;
        this.writeToFile(entry + '\n');
        if (this.config.console) {
          process.stdout.write(line + '\n');
        }
      }
    }
  }

  /**
   * Internal log method.
   * @param level - Log level
   * @param message - Log message
   * @param data - Optional data
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.config.level) return;

    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    let entry = `[${timestamp}] [${levelName}] ${message}`;

    if (data !== undefined) {
      if (data instanceof Error) {
        entry += `\n  Error: ${data.message}`;
        if (data.stack) {
          entry += `\n  Stack: ${data.stack}`;
        }
      } else if (typeof data === 'object') {
        entry += `\n  Data: ${JSON.stringify(data, null, 2)}`;
      } else {
        entry += ` ${data}`;
      }
    }

    // Console output
    if (this.config.console) {
      const consoleMethod = level >= LogLevel.ERROR ? console.error :
        level >= LogLevel.WARN ? console.warn :
          console.log;
      consoleMethod(entry);
    }

    // File output
    if (this.initialized) {
      this.writeToFile(entry + '\n');
    }
  }

  /**
   * Writes to the log file.
   * @private
   */
  private writeToFile(content: string): void {
    if (this.writeStream) {
      this.writeStream.write(content);
    }
  }

  /**
   * Rotates log files, keeping only the last N files per agent type.
   * @returns Number of files deleted
   * 
   * @example
   * ```typescript
   * const deleted = await logger.rotate();
   * console.log(`Deleted ${deleted} old log files`);
   * ```
   */
  public async rotate(): Promise<number> {
    try {
      const files = await fsPromises.readdir(this.config.logDir);

      // Filter files for this agent type
      const agentLogs = files
        .filter(f => f.startsWith(`${this.config.agentType}-`) && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
        }));

      // Get file stats for sorting by modification time
      const logsWithStats = await Promise.all(
        agentLogs.map(async (log) => {
          try {
            const stat = await fsPromises.stat(log.path);
            return { ...log, mtime: stat.mtime };
          } catch {
            return { ...log, mtime: new Date(0) };
          }
        })
      );

      // Sort by modification time (newest first)
      logsWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Delete old files beyond the limit
      const toDelete = logsWithStats.slice(this.config.maxFiles);

      for (const log of toDelete) {
        try {
          await fsPromises.unlink(log.path);
        } catch {
          // Ignore deletion errors
        }
      }

      return toDelete.length;
    } catch {
      return 0;
    }
  }

  /**
   * Closes the logger and flushes pending writes.
   * 
   * @example
   * ```typescript
   * await logger.close();
   * ```
   */
  public async close(): Promise<void> {
    if (!this.writeStream) return;

    // Write footer
    const footer = [
      '',
      `========================`,
      `Ended: ${new Date().toISOString()}`,
      `=== End of Log ===`,
      '',
    ].join('\n');

    await this.writeToFile(footer);

    // Close stream
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => {
          this.writeStream = null;
          this.initialized = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Creates a logger for a specific agent workspace.
   * Convenience factory method.
   * 
   * @param workspaceRoot - Workspace root path
   * @param agentType - Agent type (gemini, claude)
   * @param level - Log level (default: INFO)
   * @returns Configured logger instance
   * 
   * @example
   * ```typescript
   * const logger = Logger.forWorkspace('/path/to/project', 'gemini');
   * await logger.init();
   * ```
   */
  public static forWorkspace(
    workspaceRoot: string,
    agentType: string,
    level: LogLevel = LogLevel.INFO
  ): Logger {
    return new Logger({
      level,
      logDir: path.join(workspaceRoot, '.waaah', 'logs'),
      agentType,
    });
  }
}
