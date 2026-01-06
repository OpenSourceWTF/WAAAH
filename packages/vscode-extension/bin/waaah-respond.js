#!/usr/bin/env node

/**
 * waaah-respond - Send response back to CLI from agent
 * 
 * Usage (from agent):
 *   waaah-respond <taskId> "response text"
 *   waaah-respond task-123456-abc "Build completed successfully"
 * 
 * The agent can also just use curl:
 *   curl -X POST http://localhost:9876/respond/task-123 \
 *     -H "Content-Type: application/json" \
 *     -d '{"response": "Done!"}'
 */

const http = require('http');

const PORT = process.env.WAAAH_PORT || 9876;

function sendResponse(taskId, response) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ response });

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: `/respond/${taskId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: waaah-respond <taskId> "response text"');
    console.error('Example: waaah-respond task-123456-abc "Task completed!"');
    process.exit(1);
  }

  const taskId = args[0];
  const response = args.slice(1).join(' ');

  try {
    await sendResponse(taskId, response);
    console.log(`✓ Response sent for task ${taskId}`);
  } catch (err) {
    console.error(`✗ Failed to send response: ${err.message}`);
    process.exit(1);
  }
}

main();
