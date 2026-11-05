#!/usr/bin/env node
// THE DECISION-TO-TASK PIPELINE (template 2.53).
//
// A reader chose this in round two, and said what they want: "not a decision
// doc, but the decisions converted to work tasks, and those work tasks, when
// picked up from Agora and the plan map, lead to progress tracking on the plan
// map." They pressed "start this now" on it on 2026-09-12.
//
// A sheet's task list IS its decisions turned into work: every open row names
// the decision it came from. This bridge makes each open row real:
//
//   1. a FEATURE on the plan map, under one topic for the sheet
//   2. an AGORA TASK whose ref points at that feature
//   3. the task id written back onto the row, as `task: { id, ref, at }`
//
// From then on the Agora daemon does the tracking. When an agent claims the
// task, the plan-map feature turns active; when it is done, the feature turns
// done (reconcileBoardToPlanmap, about 60 seconds after the change).
//
//   node tasks-bridge.cjs --dir <sheet dir> --topic <plan-map topic id>
//        [--title "<topic title>"] [--campaign tooling] [--dry]
//   node tasks-bridge.cjs --dir <sheet dir> --sync
//
// --sync reads every linked task back from the daemon and writes its state onto
// the row (`task.state`), and moves the row's own state to match. build.cjs
// runs it before every build, so the page shows the board, not a memory of it.
//
// Needs an Agora identity for task creation: set AGORA_AGENT_ID and register
// once with tools/agora/client.mjs. --sync needs none; reading tasks is open.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const FLAG = (n) => process.argv.includes('--' + n);

const DIR = path.resolve(arg('dir', process.cwd()));
// THE HOST REPOSITORY (2026-10-10, the public move). The plan-map and Agora
// steps write into a repository, and its path belongs to the host, not to this
// file. It is read in this order: --repo, the QSHEET_REPO environment
// variable, "repo" in local.json next to this script. There is NO built-in
// default: a wrong default writes to the wrong repository without saying so.
// --sync never needs it, so a reader with no board can still build a sheet.
const LOCAL = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'local.json'), 'utf8')); }
  catch (e) { return {}; }
})();
const REPO_SET = arg('repo', process.env.QSHEET_REPO || LOCAL.repo || null);
const REPO = REPO_SET ? path.resolve(REPO_SET) : null;
function repo() {
  if (!REPO) {
    throw new Error('FAIL: no host repository is set, and the plan-map and Agora steps write into one. '
      + 'Set it one of three ways: --repo <path>, the QSHEET_REPO environment variable, '
      + 'or "repo" in ' + path.join(__dirname, 'local.json') + ' (copy local.example.json).');
  }
  return REPO;
}
const DAEMON = arg('daemon', 'http://localhost:4319');
const SHEET = path.join(DIR, 'sheet.json');
const sheet = JSON.parse(fs.readFileSync(SHEET, 'utf8'));
const rows = sheet.checklist || [];

// Agora task state -> task-list row state.
const ROW_STATE = { open: 'todo', claimed: 'doing', in_progress: 'doing', blocked: 'blocked', done: 'done' };

async function sync() {
  let changed = 0, reached = 0;
  for (const r of rows) {
    if (!r.task || !r.task.id) continue;
    let res;
    try {
      res = await fetch(DAEMON + '/tasks/' + encodeURIComponent(r.task.id));
    } catch (e) {
      console.log('WARNING: the Agora daemon is not reachable at ' + DAEMON + '. Task states left as they were.');
      return;
    }
    if (!res.ok) { console.log('WARNING: task ' + r.task.id + ' not found on the board (' + res.status + ').'); continue; }
    reached++;
    const t = (await res.json()).task;
    const who = t.claimedAgent ? (t.claimedAgent.handle || t.claimedAgent.id) : null;
    const next = { state: t.state, by: who, updatedAt: t.updatedAt };
    // DONE NOW (2.56). The first sync that reads done records the time, and
    // says so loudly: the session that builds the sheet must tell the reader.
    if (t.state === 'done' && !r.task.doneAt) {
      r.task.doneAt = new Date(t.updatedAt || Date.now()).toISOString();
      console.log('DONE NOW: ' + r.task.id + ' "' + r.label + '". Send the reader a push notification.');
      changed++;
    }
    if (JSON.stringify(next) !== JSON.stringify({ state: r.task.state, by: r.task.by, updatedAt: r.task.updatedAt })) {
      Object.assign(r.task, next);
      changed++;
    }
    const rowState = ROW_STATE[t.state];
    if (rowState && r.state !== rowState) { r.state = rowState; changed++; }
  }
  if (changed) fs.writeFileSync(SHEET, JSON.stringify(sheet, null, 2), 'utf8');
  console.log('tasks synced: ' + reached + ' read from the board, ' + changed + ' change(s) written');
}

function run(cmd, a, b) {
  const env = Array.isArray(a) ? null : a;
  const args = Array.isArray(a) ? a : b;
  return execFileSync(process.execPath, [cmd].concat(args), {
    cwd: repo(), encoding: 'utf8', env: Object.assign({}, process.env, env || {})
  });
}

// A file under public/ is briefly locked while the dev server serves it, and
// the rename that planmap-add uses then fails with EPERM. Retry with backoff,
// the same way sync-surfaces.mjs does (memory: windows-atomic-write-blocked).
function runRetry(cmd, env, args) {
  for (let i = 1; ; i++) {
    try { return run(cmd, env, args); }
    catch (e) {
      const text = String(e.stderr || '') + String(e.stdout || '') + String(e.message || '');
      if (!/EPERM|EBUSY|UNKNOWN/.test(text) || i >= 12) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * i);
    }
  }
}

function create() {
  const TOPIC = arg('topic', null);
  if (!TOPIC) throw new Error('FAIL: pass --topic <plan-map topic id> for this sheet.');
  if (!process.env.AGORA_AGENT_ID) throw new Error('FAIL: set AGORA_AGENT_ID to the identity that creates the tasks.');
  const DRY = FLAG('dry');
  const todo = rows.filter((r) => r.state !== 'done' && !(r.task && r.task.id));
  console.log(todo.length + ' open row(s) without a task: ' + todo.map((r) => r.label).join(' | '));
  if (!todo.length || DRY) return;

  const client = path.join(repo(), 'tools/agora/client.mjs');
  const add = path.join(repo(), 'tools/agora/planmap-add.mjs');
  const map = path.join(repo(), 'public/planmap/topics.json');
  // The plan-map guard is handed the lock id directly. It can miss the
  // identity file when run as a child process; AGORA_HELD_LOCK is its own
  // documented way in (WF fix abbdc943).
  const lockOut = run(client, ['lock', 'public/planmap/topics.json', '--reason', 'question-sheet tasks bridge', '--ttl', '10']);
  const lockId = (lockOut.match(/Lock acquired: ([0-9a-f-]+)/) || [])[1];
  if (!lockId) throw new Error('FAIL: could not take the plan-map lock: ' + lockOut);
  const held = { AGORA_HELD_LOCK: lockId };
  // planmap-add replaces the file with write-temp-then-rename. In public/planmap
  // something opens every freshly written temp file, so that rename fails with
  // EPERM on every try, while a plain in-place write works. So planmap-add runs
  // on a WORKING COPY outside public/, with its own validation, and the result
  // is written back in place under the lock.
  const work = path.join(repo(), '.agent/scratch/planmap-bridge.topics.json');
  fs.mkdirSync(path.dirname(work), { recursive: true });
  fs.copyFileSync(map, work);
  const onWork = (a) => a.concat(['--file', work]);
  try {
    const topics = JSON.parse(fs.readFileSync(work, 'utf8')).topics || [];
    if (!topics.some((t) => t.id === TOPIC)) {
      runRetry(add, held, onWork(['--new-topic', TOPIC, '--title', arg('title', sheet.title), '--campaign', arg('campaign', 'tooling'),
        '--status', 'active', '--status-note', 'Work from the question sheet "' + sheet.title + '". Each feature is one task-list row.']));
      console.log('plan map: new topic ' + TOPIC);
    }
    const refs = [];
    for (const r of todo) {
      const out = runRetry(add, held, onWork(['--topic', TOPIC, '--feature', r.label, '--status', 'specced']));
      const m = out.match(/planmap:[a-z0-9-]+\/[a-z0-9-]+/);
      if (!m) throw new Error('FAIL: planmap-add printed no ref for "' + r.label + '": ' + out);
      refs.push([r, m[0]]);
    }
    // Write the map back in place, BEFORE any task points at it.
    const next = fs.readFileSync(work);
    for (let i = 1; ; i++) {
      try { fs.writeFileSync(map, next); break; }
      catch (e) { if (i >= 12) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * i); }
    }
    console.log('plan map written: ' + refs.length + ' feature(s)');
    for (const [r, ref] of refs) {
      const NL = String.fromCharCode(10);
      const body = [r.detail || '', (r.scope || []).map((x) => '- ' + x).join(NL), r.from ? 'From: ' + r.from : '',
        'Sheet: ' + (sheet.pageUrl || sheet.title)].filter(Boolean).join(NL + NL);
      const id = run(client, ['task', 'new', r.label, '--body', body, '--ref', ref, '--category', 'tooling',
        '--campaign', 'none', '--id-only']).trim().split(/\s+/).pop();
      r.task = { id: id, ref: ref, at: new Date().toISOString(), state: 'open' };
      fs.writeFileSync(SHEET, JSON.stringify(sheet, null, 2), 'utf8');
      console.log('task ' + id + '  ' + ref + '  "' + r.label + '"');
    }
  } finally {
    try { run(client, ['unlock', 'public/planmap/topics.json']); } catch (e) { console.log('WARNING: could not release the plan-map lock.'); }
  }
}

// WATCH (2.56). A reader asked how the task list gets updated when Agora
// finishes a task. The page cannot look; only a session can rebuild it. So a
// session runs this under a monitor: it reads the board every 60 seconds and
// prints ONE line when a linked task changes state. The session then builds
// and republishes the sheet. Reads only; it never writes sheet.json.
async function watch() {
  const seen = {};
  for (const r of rows) if (r.task && r.task.id) seen[r.task.id] = r.task.state;
  console.log("WATCHING " + Object.keys(seen).length + " task(s): " + Object.entries(seen).map((e) => e.join("=")).join(", "));
  for (;;) {
    for (const id of Object.keys(seen)) {
      try {
        const res = await fetch(DAEMON + "/tasks/" + encodeURIComponent(id));
        if (!res.ok) continue;
        const st = (await res.json()).task.state;
        if (st !== seen[id]) {
          console.log("TASK CHANGED: " + id + " " + seen[id] + " -> " + st + ". Rebuild and republish the sheet.");
          seen[id] = st;
        }
      } catch (e) { /* daemon down: try again next pass */ }
    }
    await new Promise((ok) => setTimeout(ok, 60000));
  }
}

if (FLAG("watch")) watch();
else if (FLAG('sync')) sync();
else create();
