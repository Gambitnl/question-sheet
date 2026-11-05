#!/usr/bin/env node
// THE OVERLAP CHECK (template 2.28).
//
// A reader settled the category system on 2026-09-06, over the work-task
// pipeline. The failure it repairs was named in round two: the same question,
// asked twice, in two conversations that did not know about each other.
//
// This finds that case. It reads every question sheet on this machine, groups
// them by tag, and reports a tag that is LIVE on more than one sheet. Live
// means the sheet still has an open question; a settled sheet cannot ask you
// anything, so it cannot ask you twice.
//
//   node overlap.cjs                      report every overlap, in words
//   node overlap.cjs --json               the same, as JSON
//   node overlap.cjs --for <title>        the categories array for ONE sheet,
//                                         with overlap and alsoOn filled in
//
// WHERE THE SHEETS COME FROM. Every artifact Claude reads leaves a copy under
// ~/.claude/projects/**/artifact-*.html. That is the same corpus the artifacts
// dashboard uses. It is honest about its limit: a sheet published and never
// read again is not on disk, so it cannot be checked. The report says how many
// sheets it saw, so a suspiciously small number is visible rather than silent.

const fs = require('fs');
const path = require('path');
const os = require('os');

// The snapshot folder. QSHEET_SNAPSHOT_ROOT overrides it, which is how the
// detector gets tested against a fixture without writing into the real one.
const ROOT = process.env.QSHEET_SNAPSHOT_ROOT
  || path.join(os.homedir(), '.claude', 'projects');
const SKILL = __dirname;

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

// The one shared list. A tag outside it is a mistake, and the report says so.
const KNOWN = {};
try {
  const cats = JSON.parse(fs.readFileSync(path.join(SKILL, 'categories.json'), 'utf8'));
  for (const c of cats.categories || []) KNOWN[c.id] = c.label;
} catch (e) {
  throw new Error('FAIL: ' + path.join(SKILL, 'categories.json') + ' is missing or unreadable. '
    + 'Copy categories.example.json to categories.json and edit it: the tags name YOUR subjects. ' + e.message);
}

/** Every artifact snapshot on this machine, newest per artifact id. */
function snapshots() {
  const best = new Map();
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      const m = e.name.match(/^artifact-([0-9a-f]{8})-(\d+)-[0-9a-z]+\.html$/i);
      if (!m) continue;
      const id = m[1], stamp = Number(m[2]);
      // WHO OWNS IT. A snapshot sits under <projects>/<project>/<session>/
      // tool-results/. The session folder holding the MOST snapshots of an
      // artifact is taken as its owner: the session that publishes a sheet
      // reads it back every round, and a visitor reads it once or twice.
      const session = path.basename(path.dirname(path.dirname(full)));
      const prev = best.get(id);
      const counts = prev ? prev.counts : {};
      counts[session] = (counts[session] || 0) + 1;
      if (!prev || stamp > prev.stamp) best.set(id, { id, stamp, file: full, counts });
      else prev.counts = counts;
    }
  };
  walk(ROOT, 0);
  return [...best.values()];
}

/** The sheet JSON out of one snapshot, or null when it is not a question sheet. */
function readSheet(file) {
  let html;
  try { html = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const m = html.match(/<script type="application\/json" id="sheet">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// A DELETED ARTIFACT IS NOT AN OPEN SHEET (2026-09-13). The saved copies stay
// on disk after an artifact is deleted, so this check counted sheets that no
// longer exist. gallery.json holds the ids still in the gallery; the session
// rewrites it from Artifact action list before a build. A saved sheet whose id
// is absent is skipped. With no gallery file, or an old one, the report says
// so and names the date each sheet was last saved.
const GALLERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let gallery = null;
try {
  const g = JSON.parse(fs.readFileSync(path.join(SKILL, "gallery.json"), "utf8"));
  gallery = { at: g.at, ids: new Set(g.ids || []), old: !g.at || Date.now() - Date.parse(g.at) > GALLERY_MAX_AGE_MS };
} catch (e) { gallery = null; }
const gone = [];

const sheets = [];
for (const snap of snapshots()) {
  const sheet = readSheet(snap.file);
  if (!sheet) continue;
  if (gallery && !gallery.ids.has(snap.id)) { gone.push(sheet.title || snap.id); continue; }
  const open = (sheet.questions || []).length;
  const owner = Object.keys(snap.counts).sort((a, b) => snap.counts[b] - snap.counts[a])[0];
  sheets.push({
    id: snap.id,
    file: snap.file,
    owner: owner,
    title: sheet.title || '(untitled)',
    open: open,
    live: open > 0,
    savedAt: new Date(snap.stamp * 1000).toISOString().slice(0, 10),
    tags: (sheet.categories || []).map((c) => (c && typeof c === 'object' ? c.id : c)).filter(Boolean),
    // COMPARE THE QUESTIONS, NOT ONLY THE TAGS (Remy, 2026-09-21). A tag says
    // two sheets share a subject; only the questions say they ask the same
    // thing. Kept here so every mode can weigh a tag hit against real text.
    asks: (sheet.questions || []).map((q) => String(q.title || '')).filter(Boolean)
  });
}

// Group the LIVE sheets by tag. A settled sheet is counted but never flagged:
// it has no open question, so it cannot ask you the same thing twice.
const byTag = {};
for (const s of sheets) {
  if (!s.live) continue;
  for (const t of s.tags) (byTag[t] = byTag[t] || []).push(s);
}

// WHICH QUESTIONS LOOK LIKE THE SAME QUESTION (Remy picked this on
// 2026-09-21, over splitting the broad tags). Two titles match when they share
// enough rare words. Short words carry no subject, so they are dropped, and a
// word that appears on most sheets ("the", "tool", "sheet") is not evidence.
// The test is deliberately generous: it OFFERS pairs to read, and the report
// says plainly that a fuzzy match can miss a differently worded twin.
const STOP = new Set(('a an and are as at be but by do does for from how i if in into is it its my no not of on or should so than that the their them then there these they this to too two up us use used we what when where which who why will with you your'
  + ' question questions sheet sheets tool tools claude now need needs make makes made keep keeps new old next one both each every any all more most less same other another does did done').split(' '));
function words(title) {
  return [...new Set(String(title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w)))];
}
// The shared words of two titles, as a fraction of the smaller word set.
function sharedWords(a, b) {
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return { score: 0, words: [] };
  const both = wa.filter((w) => wb.indexOf(w) !== -1);
  return { score: both.length / Math.min(wa.length, wb.length), words: both };
}
const ASK_MATCH = 0.5;      // half the rare words of the shorter title
/** Every pair of open questions, across two sheets, that reads alike. */
function askOverlaps(group) {
  const hits = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      for (const qa of group[i].asks || []) {
        for (const qb of group[j].asks || []) {
          const m = sharedWords(qa, qb);
          if (m.score >= ASK_MATCH) {
            hits.push({ sheets: [group[i].title, group[j].title], asks: [qa, qb], shared: m.words });
          }
        }
      }
    }
  }
  return hits;
}

const unknown = [...new Set(sheets.flatMap((s) => s.tags))].filter((t) => !KNOWN[t]);
const overlaps = Object.keys(byTag).filter((t) => byTag[t].length > 1).sort();

// --for <title> --tags a,b: the categories array for one sheet.
//
// THE SHEET BEING BUILT IS THE AUTHORITY ON ITS OWN TAGS, so `--tags` must be
// passed in. The copy of that sheet on disk is one round old by definition —
// it is the round that was published last — so reading the tags back off it
// returns yesterday's answer, and returns nothing at all the first time a
// sheet is tagged. Found on 2026-09-06, the first time this ran for real.
const FOR = arg('for', null);
if (FOR) {
  const mine = sheets.filter((s) => s.title === FOR);
  const seen = new Set(mine.map((s) => s.id));
  const passed = (arg('tags', '') || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!passed.length) {
    console.error('FAIL: pass --tags <id,id> as well as --for. The sheet being built owns its tags.');
    process.exit(2);
  }
  const bad = passed.filter((t) => !KNOWN[t]);
  if (bad.length) {
    console.error('FAIL: these tags are not in categories.json: ' + bad.join(', '));
    console.error('Add them there with a covers line first. A tag nobody else uses cannot overlap.');
    process.exit(3);
  }
  const tags = passed;
  const out = tags.map((t) => {
    const others = (byTag[t] || []).filter((s) => !seen.has(s.id));
    const row = { id: t, label: KNOWN[t] || t };
    if (others.length) {
      row.overlap = true;
      row.alsoOn = others.map((s) => s.title);
    }
    return row;
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// --templates: the newest template version any sheet on this machine was built
// from, and how many sheets sit on each. A published page cannot reach the
// machine to ask, so the BUILD bakes this in and the page reports what was
// true when it was made.
if (process.argv.includes('--templates')) {
  const counts = {};
  for (const snap of snapshots()) {
    const sheet = readSheet(snap.file);
    if (!sheet) continue;
    const tv = sheet.templateVersion;
    const id = (tv && typeof tv === 'object') ? tv.id : tv;
    if (!id) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  const num = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const newer = (a, b) => {
    const A = num(a), B = num(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = A[i] || 0, y = B[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  };
  let newest = null;
  for (const id of Object.keys(counts)) if (!newest || newer(id, newest)) newest = id;
  console.log(JSON.stringify({ newest: newest, counts: counts, sheets: sheets.length }, null, 2));
  process.exit(0);
}

// --notify: THE HAND-OFF (the last part of the category system). For every
// overlap not yet told, print who to tell and what to say. A script cannot
// message a conversation; the Claude session that runs this does, with the
// session tools: search_session_transcripts(<owner>) finds the conversation,
// send_message delivers the text. Then --mark-notified <key> records it, so
// the same pair is never told twice.
const NOTIFIED = path.join(SKILL, 'overlap-notified.json');
function readNotified() {
  try { return JSON.parse(fs.readFileSync(NOTIFIED, 'utf8')); } catch (e) { return {}; }
}
if (process.argv.includes('--mark-notified')) {
  const key = arg('mark-notified', '');
  if (!key) { console.error('FAIL: pass the key printed by --notify.'); process.exit(2); }
  const n = readNotified();
  n[key] = new Date().toISOString();
  fs.writeFileSync(NOTIFIED, JSON.stringify(n, null, 2), 'utf8');
  console.log('marked ' + key);
  process.exit(0);
}
if (process.argv.includes('--notify')) {
  const told = readNotified();
  // One message per set of sheets, naming every topic they share, so a pair
  // that shares three tags is told once, not three times.
  const bySet = {};
  for (const t of overlaps) {
    const group = byTag[t].slice().sort((x, y) => x.id.localeCompare(y.id));
    const set = group.map((g) => g.id).join('+');
    (bySet[set] = bySet[set] || { group: group, tags: [] }).tags.push(t);
  }
  const plan = [];
  for (const set of Object.keys(bySet)) {
    const { group, tags } = bySet[set];
    const key = set;
    if (told[key]) continue;
    const topics = tags.map((t) => '"' + (KNOWN[t] || t) + '"').join(', ');
    const hits = askOverlaps(group);
    plan.push({
      key: key,
      tags: tags,
      questionMatches: hits,
      sheets: group.map((g) => ({ title: g.title, artifact: g.id, owner: g.owner, open: g.open, savedAt: g.savedAt })),
      message: (hits.length
          ? 'A QUESTION LOOKS SHARED. ' + hits.map((h) => '"' + h.asks[0] + '" (' + h.sheets[0] + ') and "' + h.asks[1] + '" (' + h.sheets[1] + ')').join('; ') + '. '
          : 'No open question looks shared, so this is a tag hit only. ')
        + (['Two', 'Three', 'Four', 'Five', 'Six'][group.length - 2] || String(group.length)) + ' open question sheets share ' + (tags.length > 1 ? 'the topics ' : 'the topic ') + topics + ': '
        + group.map((g) => '"' + g.title + '"').join(', ').replace(/, ([^,]*)$/, ' and $1')
        + '. Before you ask a question on yours, read ' + (group.length > 2 ? 'the other sheets' : 'the other sheet') + ', and do not ask anything they already ask or have settled.'
        + ' If you find no shared question, say so, so this set is not told again.'
        + ' If the work overlaps, agree with the other conversation which one owns it. (Sent by the question-sheet overlap check.)'
    });
  }
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// --untagged: every OPEN sheet with no tags, and the session that owns it.
// A sheet with no tags is invisible to the overlap check. The session that
// runs this asks each owner to tag its own sheet (a reader approved this on
// 2026-09-13); a script cannot message a conversation.
if (process.argv.includes("--untagged")) {
  const list = sheets.filter((s) => s.live && !s.tags.length)
    .map((s) => ({ title: s.title, artifact: s.id, owner: s.owner, open: s.open, savedAt: s.savedAt }));
  console.log(JSON.stringify(list, null, 2));
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    sheetsSeen: sheets.length,
    galleryAt: gallery ? gallery.at : null,
    skippedDeleted: gone,
    live: sheets.filter((s) => s.live).length,
    tagged: sheets.filter((s) => s.tags.length).length,
    unknownTags: unknown,
    overlaps: overlaps.map((t) => ({
      tag: t, label: KNOWN[t] || t, sheets: byTag[t].map((s) => s.title)
    }))
  }, null, 2));
  process.exit(0);
}

console.log(sheets.length + ' question sheets on this machine, ' +
  sheets.filter((s) => s.live).length + ' still open, ' +
  sheets.filter((s) => s.tags.length).length + ' tagged.');
console.log('A sheet published and never read again is not on disk, so it cannot be checked.');
if (!gallery) {
  console.log("WARNING: no gallery.json, so a deleted artifact still counts as open. Rewrite it from Artifact action list.");
} else {
  if (gone.length) console.log("Skipped " + gone.length + " saved sheet(s) no longer in the gallery: " + gone.join(", ") + ".");
  if (gallery.old) console.log("WARNING: gallery.json is from " + gallery.at + ". Rewrite it from Artifact action list.");
}
if (unknown.length) {
  console.log('');
  console.log('TAGS THAT ARE NOT IN categories.json: ' + unknown.join(', '));
  console.log('Add them to that file with a covers line, or correct the sheets that use them.');
}
console.log('');
if (!overlaps.length) {
  console.log('No overlap. No two open sheets share a tag.');
  process.exit(0);
}
console.log('OVERLAPS — one topic, more than one open sheet:');
for (const t of overlaps) {
  console.log('');
  console.log('  ' + (KNOWN[t] || t) + '  (' + t + ')');
  for (const s of byTag[t]) {
    console.log('    - ' + s.title + '  [' + s.open + ' open]');
  }
}
console.log('');
console.log('Tell both conversations before either asks the same question twice.');
{
  let any = 0;
  for (const t of overlaps) {
    const hits = askOverlaps(byTag[t]);
    if (!hits.length) continue;
    if (!any++) {
      console.log('');
      console.log('QUESTIONS THAT LOOK LIKE THE SAME QUESTION:');
    }
    for (const h of hits) {
      console.log('  "' + h.asks[0] + '"  (' + h.sheets[0] + ')');
      console.log('  "' + h.asks[1] + '"  (' + h.sheets[1] + ')');
      console.log('    shared words: ' + h.shared.join(', '));
    }
  }
  if (overlaps.length && !any) {
    console.log('');
    console.log('No open question on the sheets listed above looks like another. The tags overlap; the questions do not.');
  }
  if (any) {
    console.log('  A match is a guess from the words, so read both before you ask. Two questions worded differently can still be the same question.');
  }
}

