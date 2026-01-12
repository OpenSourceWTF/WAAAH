import * as readline from 'readline';
import { apiCall } from './index.js';

let activeRl: readline.Interface | null = null;

export function setEventListenerRl(rl: readline.Interface | null) {
  activeRl = rl;
}

function logInjected(message: string) {
  if (activeRl) {
    process.stdout.write('\r\x1b[K');
    console.log(message);
    activeRl.prompt(true);
  } else {
    console.log(message);
  }
}

export async function startEventListener() {
  while (true) {
    try {
      const data = await apiCall<{
        status?: string;
        type?: string;
        task?: { id: string; status: string; to?: { agentId?: string; role?: string }; response?: { message?: string; artifacts?: string[] } };
      }>('get', '/admin/events');
      if (data.status === 'TIMEOUT') continue;

      if (data.type === 'task_update') {
        const t = data.task;
        if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(t.status)) {
          const agentId = t.to.agentId || t.to.role || 'unknown';
          const icon = t.status === 'COMPLETED' ? '✅' : t.status === 'FAILED' ? '❌' : '⚠️';

          let msg = `\n${icon} [${agentId}] ${t.status}: ${t.response?.message || 'No message'}`;
          if (t.response?.artifacts?.length) {
            msg += `\n   Artifacts: ${t.response.artifacts.join(', ')}`;
          }
          logInjected(msg);
        } else if (t.status === 'ASSIGNED') {
          logInjected(`\n⏳ [${t.to.agentId || t.to.role}] Assigned task: ${t.id}`);
        }
      }
    } catch {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
