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

async function fetchTasks() {
  try {
    const response = await fetch(`${API_BASE}/tasks`);
    const tasks = await response.json();
    renderTasks(tasks);
  } catch (e) {
    console.error('Failed to fetch tasks:', e);
  }
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
        <div class="task-item priority-${task.priority}">
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

// Initial Load & Polling
document.addEventListener('DOMContentLoaded', () => {
  fetchAgents();
  fetchTasks();

  // Poll every 2 seconds
  setInterval(() => {
    fetchAgents();
    fetchTasks();
  }, 2000);
});
