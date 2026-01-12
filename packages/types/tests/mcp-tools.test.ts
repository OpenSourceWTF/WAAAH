import { describe, it, expect } from 'vitest';
import { MCP_TOOL_DEFINITIONS } from '../src/mcp-tools';

describe('MCP_TOOL_DEFINITIONS', () => {
  it('should be an array', () => {
    expect(Array.isArray(MCP_TOOL_DEFINITIONS)).toBe(true);
  });

  it('should contain essential tools', () => {
    const toolNames = MCP_TOOL_DEFINITIONS.map(t => t.name);
    expect(toolNames).toContain('register_agent');
    expect(toolNames).toContain('wait_for_prompt');
    expect(toolNames).toContain('send_response');
    expect(toolNames).toContain('assign_task');
  });

  it('should have valid structure for each tool', () => {
    MCP_TOOL_DEFINITIONS.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    });
  });

  it('should define assign_task correctly', () => {
    const assignTask = MCP_TOOL_DEFINITIONS.find(t => t.name === 'assign_task');
    expect(assignTask).toBeDefined();
    expect(assignTask?.inputSchema.required).toContain('workspaceId');
    expect(assignTask?.inputSchema.required).toContain('prompt');
  });

  it('should define register_agent with workspaceContext required', () => {
    const registerAgent = MCP_TOOL_DEFINITIONS.find(t => t.name === 'register_agent');
    expect(registerAgent).toBeDefined();
    expect(registerAgent?.inputSchema.required).toContain('workspaceContext');
    expect(registerAgent?.inputSchema.required).toContain('capabilities');
  });
});
