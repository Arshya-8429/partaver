import Database from 'better-sqlite3';
import { parentPort, workerData } from 'node:worker_threads';
import type { SearchRequest } from '@partsfinder/contracts';
import { searchCatalogue, SearchServiceError } from './search.js';

interface SearchTask {
  id: number;
  request: SearchRequest;
}

if (!parentPort) throw new Error('Search worker must run in a Worker thread.');
const workerPort = parentPort!;

const cancelled = new Set<number>();
const queue: SearchTask[] = [];
let draining = false;
let db: Database.Database | null = null;
let activeTaskId: number | null = null;

async function drain(): Promise<void> {
  if (draining || !db) return;
  draining = true;
  try {
    while (queue.length) {
      const task = queue.shift();
      if (!task || cancelled.delete(task.id)) continue;
      activeTaskId = task.id;
      try {
        const result = await searchCatalogue(db, task.request);
        if (!cancelled.delete(task.id)) workerPort.postMessage({ type: 'result', id: task.id, result });
      } catch (error) {
        if (cancelled.delete(task.id)) continue;
        const code = error instanceof SearchServiceError ? error.code : 'SEARCH_FAILED';
        const statusCode = error instanceof SearchServiceError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : 'Search failed.';
        workerPort.postMessage({ type: 'error', id: task.id, error: { code, statusCode, message } });
      } finally {
        activeTaskId = null;
      }
    }
  } finally {
    draining = false;
  }
}

try {
  const path = (workerData as { dbPath?: unknown }).dbPath;
  if (typeof path !== 'string' || !path) throw new Error('Search worker database path was not configured.');
  db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 1000');
  db.pragma('foreign_keys = ON');
  workerPort.postMessage({ type: 'ready' });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unable to open the catalogue database.';
  workerPort.postMessage({ type: 'startupError', message });
}

workerPort.on('message', (message: { type?: string; id?: number; request?: SearchRequest }) => {
  if (message.type === 'cancel' && Number.isSafeInteger(message.id)) {
    const id = message.id as number;
    if (activeTaskId === id) cancelled.add(id);
    else {
      const queuedIndex = queue.findIndex((task) => task.id === id);
      if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
    }
    return;
  }
  if (message.type === 'search' && Number.isSafeInteger(message.id) && message.request && db) {
    queue.push({ id: message.id as number, request: message.request });
    void drain();
  }
});

workerPort.on('close', () => db?.close());
