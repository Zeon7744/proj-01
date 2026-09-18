'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'records.json');

// ---------------------------------------------------------------------------
// Tiny JSON "database" backed by a file on disk.
// ---------------------------------------------------------------------------
function loadDb() {
  if (!fs.existsSync(DB_FILE)) return { records: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to parse DB, starting fresh:', e.message);
    return { records: [] };
  }
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Normalize JSON request bodies to UTF-8 so Chinese characters survive
// even when the client omits charset in Content-Type.
app.use((req, res, next) => {
  const ct = req.headers['content-type'];
  if (ct && ct.includes('application/json')) {
    req.headers['content-type'] = ct.includes('charset')
      ? ct.replace(/charset=[^;\s]+/i, 'charset=utf-8')
      : ct + '; charset=utf-8';
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
// List all records
app.get('/api/records', (req, res) => {
  const db = loadDb();
  res.json({ records: db.records });
});

// Create a record
app.post('/api/records', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const record = {
    id: newId(),
    title,
    content: String(req.body.content || ''),
    status: ['todo', 'doing', 'done'].includes(req.body.status) ? req.body.status : 'todo',
    priority: ['low', 'medium', 'high'].includes(req.body.priority) ? req.body.priority : 'medium',
    dueDate: req.body.dueDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const db = loadDb();
  db.records.push(record);
  saveDb(db);
  res.status(201).json({ record });
});

// Update a record
app.put('/api/records/:id', (req, res) => {
  const db = loadDb();
  const idx = db.records.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'record not found' });

  const current = db.records[idx];
  const updated = {
    ...current,
    title: req.body.title !== undefined ? String(req.body.title).trim() : current.title,
    content: req.body.content !== undefined ? String(req.body.content) : current.content,
    status: req.body.status !== undefined ? req.body.status : current.status,
    priority: req.body.priority !== undefined ? req.body.priority : current.priority,
    dueDate: req.body.dueDate !== undefined ? req.body.dueDate : current.dueDate,
    updatedAt: new Date().toISOString(),
  };
  if (!updated.title) return res.status(400).json({ error: 'title cannot be empty' });
  db.records[idx] = updated;
  saveDb(db);
  res.json({ record: updated });
});

// Delete a record
app.delete('/api/records/:id', (req, res) => {
  const db = loadDb();
  const before = db.records.length;
  db.records = db.records.filter((r) => r.id !== req.params.id);
  if (db.records.length === before) return res.status(404).json({ error: 'record not found' });
  saveDb(db);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
