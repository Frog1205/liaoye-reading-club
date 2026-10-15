import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function localDate(timezone = 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function weekStart(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function createStore(directory, { seed = true, timezone = 'America/Los_Angeles' } = {}) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'liaoye.sqlite'));
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
      data TEXT NOT NULL, source TEXT NOT NULL, source_label TEXT NOT NULL,
      demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, session_hash TEXT UNIQUE NOT NULL, nickname TEXT UNIQUE NOT NULL,
      answers TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      content_id TEXT NOT NULL REFERENCES content(id), member_id TEXT NOT NULL REFERENCES members(id),
      created_at TEXT NOT NULL, PRIMARY KEY(content_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS agent_keys (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL,
      prefix TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, action TEXT NOT NULL, subject TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  db.exec(readFileSync(new URL('../cloud/migrations/0003-member-accounts.sql',import.meta.url),'utf8'));
  const parse = row => row && ({ id: row.id, kind: row.kind, status: row.status, data: JSON.parse(row.data), source: row.source, sourceLabel: row.source_label, demo: Boolean(row.demo), createdAt: row.created_at, updatedAt: row.updated_at });
  const store = {
    db,
    audit(action, subject) { db.prepare('INSERT INTO audit(action,subject,created_at) VALUES(?,?,?)').run(action, subject, new Date().toISOString()); },
    get(id) { return parse(db.prepare('SELECT * FROM content WHERE id=?').get(id)); },
    list(status = 'published') { return db.prepare('SELECT * FROM content WHERE status=? ORDER BY updated_at DESC, rowid DESC').all(status).map(parse); },
    insert({ kind, data, source = 'member', sourceLabel = '', demo = false, status = 'pending' }) {
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?)').run(id, kind, status, JSON.stringify(data), source, sourceLabel, Number(demo), now, now);
      return store.get(id);
    },
    update(id, data, status) {
      db.prepare('UPDATE content SET data=?,status=?,demo=0,updated_at=? WHERE id=?').run(JSON.stringify(data), status, new Date().toISOString(), id);
      return store.get(id);
    },
    setting(key, value) {
      if (value !== undefined) db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
      return row ? JSON.parse(row.value) : null;
    },
    close() { db.close(); }
  };
  if (seed && !store.setting('initialized')) {
    const date = localDate(timezone), month = date.slice(0, 7), week = weekStart(date);
    const books = [
      { title: '也许你该找个人聊聊', author: '洛莉·戈特利布', description: '关于倾听，也关于被听见。借一本书，聊聊那些还没有机会好好说出口的生活。', category: '自我与关系', cover: 'clay', cadence: 'monthly', period: month },
      { title: '蛤蟆先生去看心理医生', author: '罗伯特·戴博德', description: '从熟悉的故事出发，慢慢看见情绪背后的自己。', category: '心理与成长', cover: 'sage', cadence: 'monthly', period: month },
      { title: '当我谈跑步时我谈些什么', author: '村上春树', description: '从一件坚持很久的小事出发，聊聊阅读、日常，以及如何与自己相处。', category: '文学与生活', cover: 'sand', cadence: 'monthly', period: month },
      { title: '也许你该找个人聊聊', author: '洛莉·戈特利布', description: '本周共读起点：从开篇读起。留下一段让你停顿的文字，见面时说说为什么。', category: '本周慢读', cover: 'clay', cadence: 'weekly', period: week }
    ];
    for (const data of books) store.insert({ kind: 'book', data, source: 'editor', sourceLabel: '编辑部样稿', demo: true, status: 'published' });
    for (const data of [
      { title: '读完以后，想认真听一个人说话', bookTitle: '也许你该找个人聊聊', author: '编辑部样稿', body: '这是一篇用于展示排版的示例心得。\n\n如果把读书会当作一次倾听的练习，我们也许不必急着给出漂亮的结论。可以先说：读到这里，我想起了什么？\n\n想带到线下的问题：当朋友向你倾诉时，你习惯先听，还是先给建议？期待把这个问题交给真实的交流。' },
      { title: '不急着给每一种情绪取名字', bookTitle: '蛤蟆先生去看心理医生', author: '编辑部样稿', body: '这是一篇用于展示排版的示例心得。\n\n读书有时给不了我们立即可用的答案，却能留下一点重新观察生活的空间。\n\n这周的阅读练习：记录一个情绪变化的瞬间，只描述发生了什么，暂时不评价自己。见面时，我们可以各自分享一个愿意说出来的小片段。' }
    ]) store.insert({ kind: 'note', data, source: 'editor', sourceLabel: '编辑部样稿', demo: true, status: 'published' });
    for (const data of [
      { title: '带一本书，认识一个新朋友', description: '第一次相见，不设标准答案。带来一本你愿意推荐的书，说说它为什么对你重要。此处是活动示例，时间与地点尚未确定。', location: '南边 · 场地待共议', proposer: '编辑部样稿' },
      { title: 'AI 帮我们读懂了什么？', description: '从一次具体的辅助阅读体验出发，聊聊 AI 带来的帮助，以及我们依然想亲自完成的阅读。此处是活动示例。', location: '线下 · 地点待定', proposer: '编辑部样稿' }
    ]) store.insert({ kind: 'activity', data, source: 'editor', sourceLabel: '编辑部样稿', demo: true, status: 'published' });
    store.setting('initialized', true);
  }
  return store;
}
