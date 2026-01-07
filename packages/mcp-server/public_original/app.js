const API_BASE = '/admin';

async function fetchAgents() {
  try {
    const response = await fetch(`${API_BASE}/agents/status`);
    const agents = await response.json();
    renderAgents(agents);
  } catch (e) {
    console.error('Failed to fetch agents:', e);
  }
}

let currentTab = 'active';

async function fetchTasks() {
  try {
    let url = `${API_BASE}/tasks`;
    if (currentTab === 'history') {
      url = `${API_BASE}/tasks/history?status=COMPLETED,FAILED,CANCELLED&limit=50`;
    }

    const response = await fetch(url);
    const tasks = await response.json();
    renderTasks(tasks);
  } catch (e) {
    console.error('Failed to fetch tasks:', e);
  }
}

function switchTab(tab) {
  currentTab = tab;
  // Update UI
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
  });
  // Fetch immediately
  renderTasks([]); // Clear momentary
  fetchTasks();
}

function renderAgents(agents) {
  const grid = document.getElementById('agent-grid');
  const badge = document.getElementById('agent-count');

  // Sort: Online/Busy first, then Offline
  agents.sort((a, b) => {
    const score = s => (s === 'OFFLINE' ? 0 : 1);
    return score(b.status) - score(a.status);
  });

  badge.textContent = agents.filter(a => a.status !== 'OFFLINE').length;

  // Simple update logic: clear and redraw (vDOM is overrated for this scale)
  grid.innerHTML = agents.map(agent => `
        <div class="agent-card ${agent.status.toLowerCase()}">
            <div class="agent-header">
                <span class="agent-name">${agent.displayName}</span>
                <div class="dot ${agent.status === 'OFFLINE' ? 'offline' : 'online'}"></div>
            </div>
            <div class="agent-role">${agent.role}</div>
            <div class="agent-status ${agent.status.toLowerCase()}">
                ${agent.status}
            </div>
            ${agent.currentTask ? `<div class="agent-current-task" title="${escapeHtml(agent.currentTask)}">Running: <span>${escapeHtml(agent.currentTask.substring(0, 30))}${agent.currentTask.length > 30 ? '...' : ''}</span></div>` : ''}
        </div>
    `).join('');
}

function renderTasks(tasks) {
  const list = document.getElementById('task-list');
  const badge = document.getElementById('task-count');

  badge.textContent = tasks.length;

  if (tasks.length === 0) {
    list.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:2rem">No active tasks</div>';
    return;
  }

  list.innerHTML = tasks.map(task => `
        <div class="task-item priority-${task.priority} status-${task.status.toLowerCase()}">
            <div class="task-info">
                <h3>${escapeHtml(task.prompt.substring(0, 80))}${task.prompt.length > 80 ? '...' : ''}</h3>
                <div class="task-meta">
                    <span>ID: ${task.id}</span>
                    <span>To: ${task.to.agentId ? getAgentName(task.to.agentId) : (task.to.role || 'Any')}</span>
                </div>
            </div>
            <div class="task-actions">
                <div class="task-status status-${task.status.toLowerCase()}">${task.status}</div>
                ${['QUEUED', 'IN_PROGRESS', 'ASSIGNED', 'PENDING_ACK'].includes(task.status) ?
      `<button class="btn-cancel" onclick="cancelTask('${task.id}')">Cancel</button>` : ''}
                ${['IN_PROGRESS', 'ASSIGNED', 'PENDING_ACK', 'CANCELLED', 'FAILED'].includes(task.status) ?
      `<button class="btn-retry" onclick="retryTask('${task.id}')">Force Retry</button>` : ''}
            </div>
        </div>
    `).join('');
}

async function cancelTask(taskId) {
  if (!confirm('Are you sure you want to cancel this task?')) return;

  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/cancel`, { method: 'POST' });
    if (res.ok) {
      fetchTasks(); // Refresh immediately
    } else {
      const err = await res.json();
      alert('Failed to cancel: ' + err.error);
    }
  } catch (e) {
    console.error('Cancel failed:', e);
    alert('Network error during cancellation');
  }
}

async function retryTask(taskId) {
  if (!confirm('Are you sure you want to FORCE RETRY this task? This will reset its status to queued.')) return;

  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/retry`, { method: 'POST' });
    if (res.ok) {
      fetchTasks(); // Refresh immediately
    } else {
      const err = await res.json();
      alert('Failed to retry: ' + err.error);
    }
  } catch (e) {
    console.error('Retry failed:', e);
    alert('Network error during retry');
  }
}

// Helper to escape HTML to prevent XSS in prompts
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Mock mapping for IDs to Names (since task only has ID sometimes if not populated fully)
// Ideally backend provides names, but tasks.to object usually has both
function getAgentName(id) {
  // We could lookup from the agent list if we stored it globally
  return id;
}

// Bot Status Polling
async function fetchBotStatus() {
  try {
    const res = await fetch(`${API_BASE}/bot/status`);
    const data = await res.json();

    const dot = document.getElementById('bot-status-dot');
    const text = document.getElementById('bot-status-text');

    if (data.connected) {
      dot.className = 'dot online';
      text.textContent = `Bot Online (${data.count})`;
      text.style.color = 'var(--success)';
    } else {
      dot.className = 'dot offline';
      text.textContent = 'Bot Offline';
      text.style.color = 'var(--text-secondary)';
    }
  } catch (e) {
    console.warn('Failed to fetch bot status', e);
  }
}

// Initial Load & Polling
document.addEventListener('DOMContentLoaded', () => {
  fetchAgents();
  fetchTasks();
  fetchBotStatus();

  // Poll every 2 seconds
  setInterval(() => {
    fetchAgents();
    fetchTasks();
    fetchBotStatus();
  }, 2000);
});
