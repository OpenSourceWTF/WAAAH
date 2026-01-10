/**
 * PTYManager Tests
 * 
 * Tests for the PTY lifecycle manager using node-pty.
 * These tests exercise the full PTY lifecycle including spawn, write, resize, and kill.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PTYManager, PTYSpawnOptions } from './manager.js';

describe('PTYManager', () => {
  let manager: PTYManager;

  beforeEach(() => {
    manager = new PTYManager();
  });

  afterEach(async () => {
    // Clean up any running processes
    if (manager.isRunning()) {
      manager.kill();
      // Wait for process to terminate
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  describe('spawn', () => {
    it('should spawn a simple command and capture output', async () => {
      const output: string[] = [];

      manager.onData((data) => {
        output.push(data);
      });

      await manager.spawn({
        command: '/bin/echo',
        args: ['hello world'],
      });

      // Wait for the process to complete and output to be captured
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for exit')), 5000);
        manager.onExit(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const fullOutput = output.join('');
      expect(fullOutput).toContain('hello world');
    });

    it('should spawn with custom working directory', async () => {
      const output: string[] = [];

      manager.onData((data) => {
        output.push(data);
      });

      await manager.spawn({
        command: '/bin/pwd',
        cwd: '/tmp',
      });

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      const fullOutput = output.join('');
      expect(fullOutput).toContain('/tmp');
    });

    it('should spawn with custom environment variables', async () => {
      const output: string[] = [];

      manager.onData((data) => {
        output.push(data);
      });

      await manager.spawn({
        command: '/bin/bash',
        args: ['-c', 'echo $MY_CUSTOM_VAR'],
        env: { ...process.env, MY_CUSTOM_VAR: 'custom_value_123' },
      });

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      const fullOutput = output.join('');
      expect(fullOutput).toContain('custom_value_123');
    });

    it('should handle spawn errors gracefully (process exits with error)', async () => {
      // node-pty doesn't throw for non-existent commands on most systems.
      // Instead, the shell spawns but the command execution fails with non-zero exit.
      let exitCode: number | undefined;

      manager.onExit((code) => {
        exitCode = code;
      });

      await manager.spawn({
        command: '/bin/bash',
        args: ['-c', '/nonexistent/command'],
      });

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      // The process should exit with a non-zero exit code
      expect(exitCode).toBeDefined();
      expect(exitCode).not.toBe(0);
    });
  });

  describe('write', () => {
    it('should write data to stdin of an interactive process', async () => {
      const output: string[] = [];

      manager.onData((data) => {
        output.push(data);
      });

      // Use cat to test stdin writing
      await manager.spawn({
        command: '/bin/cat',
      });

      // Wait a bit for cat to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Write to stdin
      manager.write('test input\n');

      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 200));

      // Kill the process (cat would otherwise wait forever)
      manager.kill();

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      const fullOutput = output.join('');
      expect(fullOutput).toContain('test input');
    });

    it('should throw if PTY not spawned', () => {
      expect(() => manager.write('test')).toThrow('PTY not spawned');
    });
  });

  describe('resize', () => {
    it('should resize the terminal', async () => {
      await manager.spawn({
        command: '/bin/bash',
        cols: 80,
        rows: 24,
      });

      // Resize should not throw
      expect(() => manager.resize(120, 40)).not.toThrow();

      manager.kill();
    });

    it('should throw if PTY not spawned', () => {
      expect(() => manager.resize(80, 24)).toThrow('PTY not spawned');
    });
  });

  describe('kill', () => {
    it('should kill a running process', async () => {
      let exitCalled = false;

      manager.onExit(() => {
        exitCalled = true;
      });

      // Spawn a long-running process
      await manager.spawn({
        command: '/bin/sleep',
        args: ['100'],
      });

      expect(manager.isRunning()).toBe(true);

      manager.kill();

      // Wait for exit callback
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(exitCalled).toBe(true);
      expect(manager.isRunning()).toBe(false);
    });

    it('should throw if PTY not spawned', () => {
      expect(() => manager.kill()).toThrow('PTY not spawned');
    });
  });

  describe('isRunning', () => {
    it('should return false when not spawned', () => {
      expect(manager.isRunning()).toBe(false);
    });

    it('should return true when process is running', async () => {
      await manager.spawn({
        command: '/bin/sleep',
        args: ['100'],
      });

      expect(manager.isRunning()).toBe(true);

      manager.kill();
    });

    it('should return false after process exits', async () => {
      await manager.spawn({
        command: '/bin/echo',
        args: ['done'],
      });

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('event forwarding', () => {
    it('should call onExit with exit code', async () => {
      let capturedExitCode: number | undefined;

      manager.onExit((exitCode) => {
        capturedExitCode = exitCode;
      });

      await manager.spawn({
        command: '/bin/bash',
        args: ['-c', 'exit 42'],
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(capturedExitCode).toBe(42);
    });

    it('should support multiple data callbacks', async () => {
      const output1: string[] = [];
      const output2: string[] = [];

      manager.onData((data) => output1.push(data));
      manager.onData((data) => output2.push(data));

      await manager.spawn({
        command: '/bin/echo',
        args: ['multi'],
      });

      await new Promise<void>((resolve) => {
        manager.onExit(() => resolve());
      });

      expect(output1.join('')).toContain('multi');
      expect(output2.join('')).toContain('multi');
    });

    it('should support multiple exit callbacks', async () => {
      let exit1Called = false;
      let exit2Called = false;

      manager.onExit(() => { exit1Called = true; });
      manager.onExit(() => { exit2Called = true; });

      await manager.spawn({
        command: '/bin/echo',
        args: ['done'],
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(exit1Called).toBe(true);
      expect(exit2Called).toBe(true);
    });
  });
});
