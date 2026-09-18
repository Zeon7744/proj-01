'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let records = [];
let searchTerm = '';
let statusFilter = '';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const modalOverlay = el('modalOverlay');
const recordForm = el('recordForm');
const recordList = el('recordList');
const searchInput = el('searchInput');
const filterSelect = el('filterSelect');

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiGet() {
  const res = await fetch('/api/records');
  const data = await res.json();
  records = data.records;
}

async function apiCreate(payload) {
  const res = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function apiUpdate(id, payload) {
  const res = await fetch(`/api/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function apiDelete(id) {
  const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const statusMap = { todo: '待办', doing: '进行中', done: '已完成' };
  const priorityMap = { low: '低', medium: '中', high: '高' };
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let filtered = records.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (searchTerm && !r.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) {
    recordList.innerHTML =
      '<div class="empty-state">暂无任务，点击"新建任务"开始。</div>';
  } else {
    recordList.innerHTML = filtered
      .map((r) => {
        const overdue =
          r.dueDate && new Date(r.dueDate + 'T00:00:00') < now && r.status !== 'done';
        return `
          <div class="record" data-id="${r.id}">
            <div class="record-title">
              <h3>${escapeHtml(r.title)}</h3>
              ${r.content ? `<p>${escapeHtml(r.content)}</p>` : ''}
            </div>
            <span class="badge badge-${r.status}">${statusMap[r.status] || r.status}</span>
            <span class="priority-badge priority-${r.priority}">${priorityMap[r.priority] || r.priority}</span>
            ${r.dueDate ? `<span class="due ${overdue ? 'overdue' : ''}">📅 ${r.dueDate}${overdue ? ' 逾期' : ''}</span>` : ''}
            <button class="btn btn-danger" data-del="${r.id}" title="删除">删除</button>
          </div>`;
      })
      .join('');
  }

  // Summary
  el('sumAll').textContent = records.length;
  el('sumTodo').textContent = records.filter((r) => r.status === 'todo').length;
  el('sumDoing').textContent = records.filter((r) => r.status === 'doing').length;
  el('sumDone').textContent = records.filter((r) => r.status === 'done').length;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value;
  render();
});

filterSelect.addEventListener('change', () => {
  statusFilter = filterSelect.value;
  render();
});

el('addBtn').addEventListener('click', () => openModal(null));

recordList.addEventListener('click', (e) => {
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) {
    e.stopPropagation();
    if (confirm('确定删除此任务？')) {
      apiDelete(delBtn.dataset.del).then(() => apiGet().then(render));
    }
    return;
  }
  const recordEl = e.target.closest('.record');
  if (recordEl && !delBtn) {
    const rec = records.find((r) => r.id === recordEl.dataset.id);
    if (rec) openModal(rec);
  }
});

el('cancelBtn').addEventListener('click', () => closeModal());
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

recordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el('fId').value;
  const payload = {
    title: el('fTitle').value,
    content: el('fContent').value,
    status: el('fStatus').value,
    priority: el('fPriority').value,
    dueDate: el('fDueDate').value || null,
  };
  try {
    if (id) await apiUpdate(id, payload);
    else await apiCreate(payload);
    closeModal();
    await apiGet();
    render();
  } catch (err) {
    alert('保存失败：' + err.message);
  }
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function openModal(record) {
  el('modalTitle').textContent = record ? '编辑任务' : '新建任务';
  el('fId').value = record ? record.id : '';
  el('fTitle').value = record ? record.title : '';
  el('fContent').value = record ? record.content : '';
  el('fStatus').value = record ? record.status : 'todo';
  el('fPriority').value = record ? record.priority : 'medium';
  el('fDueDate').value = record && record.dueDate ? record.dueDate : '';
  modalOverlay.hidden = false;
  el('fTitle').focus();
}

function closeModal() {
  recordForm.reset();
  el('fId').value = '';
  modalOverlay.hidden = true;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  await apiGet();
  render();
})();
