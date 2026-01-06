---
description: Send response back to CLI when task has [TASK:xxx] prefix
---

# WAAAH Response Workflow

When you receive a message starting with `[TASK:task-xxx]`, you MUST send your response back to the CLI using the HTTP callback.

## Steps

1. **Detect Task ID**: Look for `[TASK:task-xxx-yyy]` at the start of the message
2. **Complete the task**: Do whatever the user requested
3. **Send response back**: Use one of these methods:

### Option A: Run the respond script
```bash
// turbo
./packages/vscode-extension/bin/waaah-respond.js <taskId> "Your response summary here"
```

### Option B: Use curl directly
```bash
// turbo
curl -X POST http://localhost:9876/respond/<taskId> \
  -H "Content-Type: application/json" \
  -d '{"response": "Your response summary here"}'
```

## Example

If you receive:
```
[TASK:task-1736182400000-abc123]
Build a hello world app in Python
```

After completing the task, respond:
```bash
./packages/vscode-extension/bin/waaah-respond.js task-1736182400000-abc123 "Created hello.py with a basic Python hello world program. Run with: python hello.py"
```

## Important Notes

- Always include the full task ID exactly as given
- Keep responses concise but informative
- Include any file paths or commands the user needs
- The response is sent back to the CLI that submitted the task
