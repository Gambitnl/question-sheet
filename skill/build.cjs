#!/usr/bin/env node
// THE BUILDER THAT SHIPS WITH THE TOOL (template 2.27).
//
// A reader asked for this, and asked the skill to REFUSE to publish without
// it. Every session used to write its own builder from the rules in SKILL.md.
// The rules were the same each time; the code was not. This file is the one
// implementation, so a mistake gets fixed once instead of per session.
//
//   node build.cjs --dir <workdir> --key <storageKey> --v <sheetVersion>
//                  [--stamp <expected>] [--new]
//
// The work directory holds:
//   sheet.json         the sheet you are building
//   live-answers.json  the answers block read back off the live page
// and receives:
//   <name>.html        the page to publish
//   copies/<v>.html    the local copy of what you published
//   copies/index.json  what each copy is, and how fresh its answers were
//
// It FAILS CLOSED four ways:
//   1. the template moved and you did not read the change
//   2. the answers were not carried back from the live page
//   3. a placeholder in the template was not filled
//   4. the answers file has no picks and you did not say --new

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKILL = __dirname;

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const FLAG = (name) => process.argv.includes('--' + name);

const DIR = path.resolve(arg('dir', process.cwd()));
const KEY = arg('key', null);
const SHEET_VERSION = arg('v', 'v1');
const EXPECT_STAMP = arg('stamp', null);
const IS_NEW = FLAG('new');

if (!KEY) throw new Error('FAIL: pass --key <storageKey>. Answers are lost without a stable key.');

// 1. THE DRIFT GATE. Another session may have moved the template between your
//    last build and this one. Read what changed before you build over it.
const tplPath = path.join(SKILL, 'template.html');
const tpl = fs.readFileSync(tplPath, 'utf8');
const stamp = crypto.createHash('sha256').update(tpl.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
const vm = tpl.match(/question-sheet-template-version:\s*([0-9.]+)/);
if (!vm) throw new Error('FAIL: the template declares no version.');
const tplVersion = 'v' + vm[1];
if (EXPECT_STAMP && EXPECT_STAMP !== stamp) {
  throw new Error('FAIL: template drift. Expected ' + EXPECT_STAMP + ', found ' + stamp +
    ' (' + tplVersion + '). Read the change, then pass the new stamp.');
}
console.log('template ' + tplVersion + ' stamp ' + stamp + (EXPECT_STAMP ? ' (matches)' : ' (unchecked)'));

// 2. CARRY THE ANSWERS, OR REFUSE. Publishing replaces the whole page, so a
//    build that forgets the answers erases them.
const livePath = path.join(DIR, 'live-answers.json');
let carried = null;
let readAt = null;
if (fs.existsSync(livePath)) {
  carried = fs.readFileSync(livePath, 'utf8').trim();
  const parsed = JSON.parse(carried);
  readAt = fs.statSync(livePath).mtime.toISOString();
  const ids = Object.keys(parsed.picks || {});
  // A round can carry NO picks and still be a real answer: a not-clear flag,
  // a comment on an option, a page note, a hand-back, a reply, or a focus send
  // (2026-09-14: Remy sent one question as "needs a picture" plus a comment,
  // with no pick). Those must be carried too; only a carry with NOTHING in it
  // is refused.
  const nonEmpty = (v) => v && (Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : String(v).trim().length);
  const other = ['own', 'notes', 'comments', 'unclear', 'newReasons', 'defer', 'pageNotes', 'start', 'reply', 'focus', 'request']
    .filter((k) => nonEmpty(parsed[k]));
  console.log('carried picks: ' + (ids.length ? ids.join(', ') : 'NONE') + (other.length ? '  (also carried: ' + other.join(', ') + ')' : ''));
  if (!ids.length && !other.length && !IS_NEW) {
    throw new Error('FAIL: live-answers.json holds no picks and no other answer content. Refusing to publish an empty carry.');
  }
} else if (!IS_NEW) {
  throw new Error('FAIL: live-answers.json is missing. Read the published page first, or pass --new.');
} else {
  console.log('carried picks: none (first publish)');
}

// 2b. READ THE BOARD (2.53). Rows linked to Agora tasks take their state from
//     the board, not from memory. Advisory: a daemon that is down leaves the
//     rows as they were, and says so.
{
  const sync = require('child_process').spawnSync(process.execPath,
    [path.join(SKILL, 'tasks-bridge.cjs'), '--dir', DIR, '--sync'], { encoding: 'utf8' });
  const said = ((sync.stdout || '') + (sync.stderr || '')).trim();
  const lines = said ? said.split(String.fromCharCode(10)) : [];
  // DONE NOW lines always show (2.56); the rest is trimmed to the summary.
  lines.filter((l) => /^DONE NOW/.test(l)).forEach((l) => console.log(l));
  if (lines.length) console.log(lines.filter((l) => !/^DONE NOW/.test(l)).slice(-2).join(String.fromCharCode(10)));
}

// 3. STAMP THE SHEET.
const sheet = JSON.parse(fs.readFileSync(path.join(DIR, 'sheet.json'), 'utf8'));

// 3a. A question asked again must not show a stale pick. Clear it, and move
//     what the reader said into the receipt, so clearing never hides an answer.
//
//     `_clearPick` IS ONE SHOT, AND IT MUST BE ERASED FROM THE FILE. It used
//     to be deleted from this in-memory copy only, so it stayed in sheet.json
//     and fired again on every later build. By the second build the reader's
//     pick and flag were already gone from the carried answers, so `engaged`
//     read false and the question was marked MISSED — the page then told the
//     reader they had picked nothing, about a question they had answered.
//     Found on 2026-09-08 in a screenshot, two days after it started.
const consumed = [];
if (carried) {
  const a = JSON.parse(carried);
  for (const q of sheet.questions || []) {
    if (!q._clearPick) continue;
    delete q._clearPick;
    consumed.push(q.id);
    const pick = a.picks && a.picks[q.id];
    const own = a.own && a.own[q.id];
    const flag = a.unclear && a.unclear[q.id];
    const bits = [];
    if (pick) bits.push(Array.isArray(pick) ? pick.join(', ') : pick);
    if (own) bits.push('"' + own + '"');
    if (flag && flag.on) bits.push('flagged as not clear (' + (flag.reasons || []).join(', ') + ')');
    // MISSED means NOT REACHED, and nothing else. A reader who flagged the
    // question as unclear, or handed it back, engaged with it — calling that
    // "you picked nothing" is wrong, and the pulsing tag then says the one
    // thing that is not true. Found 2026-09-06, when a reader flagged q21 as
    // jargon and the build would have marked it missed.
    var engaged = !!pick || !!own || !!(flag && flag.on) || !!(a.defer && a.defer[q.id]);
    q.addressed = q.addressed || {};
    if (!engaged) q.addressed.missed = true;
    if (!bits.length) continue;
    q.addressed.was = bits.join(' — ');
    if (a.picks) delete a.picks[q.id];
    if (a.own) delete a.own[q.id];
    if (a.unclear) delete a.unclear[q.id];
    if (a.multi) delete a.multi[q.id];
    console.log('cleared a stale pick on ' + q.id + ': ' + q.addressed.was);
  }
  carried = JSON.stringify(a, null, 2);
}

// Erase the spent flags from the file itself, so the next build cannot repeat
// this. Only that one key is touched: the file is re-read and re-written, so
// nothing else this script has added to `sheet` leaks back into the source.
if (consumed.length) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'sheet.json'), 'utf8'));
  let hit = 0;
  for (const q of raw.questions || []) {
    if (q._clearPick) { delete q._clearPick; hit++; }
  }
  // The cleared carry goes back to live-answers.json too. Without it, a second
  // build before the next read re-carries the pick that was just cleared, and
  // the flag that cleared it is already gone. Found 2026-09-12 on q21.
  fs.writeFileSync(livePath, carried, 'utf8');
  if (hit) {
    fs.writeFileSync(path.join(DIR, 'sheet.json'), JSON.stringify(raw, null, 2), 'utf8');
    console.log('spent _clearPick on ' + consumed.join(', ') + ' — erased from sheet.json');
  }
}

// 3a2. A SHEET CARRIES TAGS, OR IT IS NOT BUILT (2026-09-13). A sheet with no
//      tags is invisible to the overlap check, and "each conversation tags its
//      own sheet" never happened on its own: 8 open sheets had none. A reader
//      approved this gate. Pick 1 to 3 ids from categories.json and write them
//      into sheet.json as "categories". --untagged skips the gate, and says so.
if (!(sheet.categories || []).length) {
  if (process.argv.includes("--untagged")) {
    console.log("WARNING: built with no tags (--untagged). The overlap check cannot see this sheet.");
  } else {
    const catPath = path.join(SKILL, "categories.json");
    if (!fs.existsSync(catPath)) {
      throw new Error("FAIL: " + catPath + " is missing. Copy categories.example.json to categories.json and edit it: the tags name YOUR subjects.");
    }
    const ids = (JSON.parse(fs.readFileSync(catPath, "utf8")).categories || []).map((c) => c.id);
    throw new Error("FAIL: this sheet carries no tags, so no other sheet can see it shares a topic. "
      + "Add \"categories\": [<1 to 3 ids>] to sheet.json, from categories.json: " + ids.join(", ")
      + ". Pass --untagged only for a throwaway sheet.");
  }
}

// 3b. THE OVERLAP CHECK (2.28). If this sheet carries tags, ask overlap.cjs
//     which of them are live on ANOTHER open sheet, and mark those. The mark
//     is what makes the same question asked twice visible before it is asked.
//     The check is advisory: it cannot see a sheet that is not on disk, so a
//     failure here warns and carries on rather than blocking the round.
if ((sheet.categories || []).length) {
  const ov = require('child_process').spawnSync(
    process.execPath, [path.join(SKILL, 'overlap.cjs'),
      '--for', sheet.title,
      '--tags', sheet.categories.map((c) => (c && typeof c === 'object' ? c.id : c)).join(',')],
    { encoding: 'utf8' });
  if (ov.status === 0) {
    try {
      const enriched = JSON.parse(ov.stdout);
      if (Array.isArray(enriched) && enriched.length) {
        sheet.categories = enriched;
        const hits = enriched.filter((c) => c.overlap);
        console.log('tags: ' + enriched.map((c) => c.id).join(', '));
        if (hits.length) {
          for (const h of hits) {
            console.log('  OVERLAP on "' + h.id + '" — also open on: ' + (h.alsoOn || []).join(', '));
          }
          console.log('  Tell both conversations before either asks the same question twice.');
          console.log('  Run: node overlap.cjs --notify — it prints each untold pair, both owner sessions and the message.');
        } else {
          console.log('  no overlap with another open sheet');
        }
      }
    } catch (e) {
      console.log('WARNING: the overlap check returned something unreadable. Tags left as written.');
    }
  } else {
    console.log('WARNING: the overlap check failed. Tags left as written.');
    console.log((ov.stderr || '').trim().split(String.fromCharCode(10))[0]);
  }
}

// 3c. A NARROW REQUEST IS ONE SHOT (2.39). The page can ask for one thing,
//     such as a version check. Once the sheet carries an answer newer than the
//     request, the request is spent. Drop it from the carried answers, or the
//     page says "waiting on Claude" forever — the same lesson as `_clearPick`.
if (carried) {
  const a = JSON.parse(carried);
  const r = a.request;
  // 2.51: any request whose `at` is listed in sheet.handled is spent.
  if (r && (sheet.handled || []).indexOf(r.at) !== -1) {
    delete a.request;
    carried = JSON.stringify(a, null, 2);
    console.log(r.kind + ' request of ' + r.at + ' is in sheet.handled — dropped from the carry');
  } else if (r && r.kind === 'start-task') {
    console.log('OPEN REQUEST: ' + (r.cancel ? 'take back' : 'start') + ' task "' + (r.label || r.task) + '" asked at ' + r.at + '. Act, then add ' + r.at + ' to sheet.handled.');
  }
  // 2.42: a new-task request is spent once a newTasks row carries its askedAt.
  if (r && r.kind === 'new-task') {
    const done = (sheet.newTasks || []).some((t) => t.askedAt === r.at);
    if (done) {
      delete a.request;
      carried = JSON.stringify(a, null, 2);
      console.log('new-task request of ' + r.at + ' answered — dropped from the carry');
    } else {
      console.log('OPEN REQUEST: new task (' + r.where + ') asked at ' + r.at + ': "' + (r.title || '') + '". Start it, then add a sheet.newTasks row with askedAt ' + r.at + '.');
    }
  }
  // ADD OR DROP A STANDING RULE (2.69). The reader pressed a button in the
  // "How you decide" box. Claude must change its OWN memory first, then set
  // the row's memory field, then rebuild. The request drops itself once the
  // row says what the reader asked for.
  if (r && r.kind === 'rule') {
    const want = r.op === 'drop' ? 'dropped' : 'saved';
    const row = (sheet.principles || [])[r.i];
    if (row && row.memory === want) {
      delete a.request;
      carried = JSON.stringify(a, null, 2);
      console.log('rule request of ' + r.at + ' done — row ' + r.i + ' reads ' + want);
    } else {
      console.log('OPEN REQUEST: rule ' + r.op + ' on row ' + r.i + ' ("' + String(r.text).slice(0, 60) + '").');
      console.log('  Do it NOW, in this order: 1) ' + (r.op === 'drop'
        ? 'delete that rule from your memory files'
        : 'write that rule into a memory file under the project memory folder')
        + '; 2) set sheet.principles[' + r.i + '].memory = "' + want + '"; 3) rebuild.');
      console.log('  A row that says "' + want + '" while your memory says otherwise is a lie on the page.');
    }
  }
  // THE LEDE IS THE SUBJECT, NOT THE ROUND (2.70). A reader asked "what is
  // this section for?!" of a lede that opened "Your note asked for...". The
  // change log and the status band already carry what changed.
  {
    const lede = String(sheet.lede || '');
    const ROUND_OPENERS = /^\s*(your (note|reply|answer)|this round|i built|i added|i fixed|new this round)/i;
    if (ROUND_OPENERS.test(lede) || /\bthis round\b/i.test(lede)) {
      console.log('WARNING: the lede reads like a note about one round: "' + lede.slice(0, 70) + '"');
      console.log('  It sits under WHAT THIS SHEET IS. Say what the sheet is FOR, in one or two sentences.');
      console.log('  What changed belongs in the change log and the status band.');
    }
  }
  // IS ANYONE LISTENING (2.62). The reader pressed the ping button. Answering
  // it IS the proof: only a session that reads this page can rebuild it.
  if (r && r.kind === 'ping') {
    const lis = sheet.listener;
    if (lis && lis.at && Date.parse(lis.at) >= Date.parse(r.at)) {
      delete a.request;
      carried = JSON.stringify(a, null, 2);
      console.log('ping of ' + r.at + ' answered at ' + lis.at + ' — dropped from the carry');
    } else {
      console.log('OPEN REQUEST: ping asked at ' + r.at + '. Answer it NOW: set sheet.listener { askedAt: "' + r.at + '", at: <now>, by: "<this session>" } and rebuild.');
    }
  }
  if (r && r.kind === 'version-check') {
    const vc = sheet.versionCheck;
    if (vc && vc.at && Date.parse(vc.at) >= Date.parse(r.at)) {
      delete a.request;
      carried = JSON.stringify(a, null, 2);
      console.log('version-check request of ' + r.at + ' answered at ' + vc.at + ' — dropped from the carry');
    } else {
      console.log('OPEN REQUEST: version-check asked at ' + r.at + '. Answer it: set sheet.versionCheck { at, said, upgraded }.');
    }
  }
}

// 3d. A NEW DECISION IS STAMPED WITH THIS VERSION (2.54). A settled row with
//     no `version` key was added since the last build, so this build is the
//     round that implements it. `version: null` means "made before stamping
//     began" and is left alone. The stamp is written back to sheet.json, so a
//     rebuild of a later version cannot overwrite it.
{
  const fresh = (sheet.settled || []).filter((r) => !('version' in r));
  if (fresh.length) {
    fresh.forEach((r) => { r.version = SHEET_VERSION; });
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'sheet.json'), 'utf8'));
    (raw.settled || []).forEach((r) => { if (!('version' in r)) r.version = SHEET_VERSION; });
    fs.writeFileSync(path.join(DIR, 'sheet.json'), JSON.stringify(raw, null, 2), 'utf8');
    console.log('decisions stamped ' + SHEET_VERSION + ': ' + fresh.map((r) => r.what).join(' | '));
  }
}

sheet.templateVersion = { id: tplVersion, at: fs.statSync(tplPath).mtime.toISOString(), hash: stamp };

sheet.sheetVersion = { id: SHEET_VERSION, at: new Date().toISOString() };

// 4. SUBSTITUTE, and prove every placeholder was there.
let out = tpl;
const subs = [
  ['__PAGE_TITLE__', sheet.title],
  ['__STORAGE_KEY__', KEY],
  ['__SHEET_JSON__', JSON.stringify(sheet, null, 2)]
];
for (const [k, v] of subs) {
  if (out.indexOf(k) === -1) throw new Error('FAIL: placeholder ' + k + ' is not in the template.');
  out = out.split(k).join(v);
}

// 5. WRITE THE ANSWERS BACK, found by its tag and never by its content.
if (carried) {
  const re = /(<script type="application\/json" id="answers">)([\s\S]*?)(<\/script>)/;
  if (!re.test(out)) throw new Error('FAIL: the template has no answers block.');
  out = out.replace(re, (m, a, _b, c) => a + '\n' + carried + '\n' + c);
}

const name = (arg('name', 'question-sheet')) + '.html';
// 4b. THE GALLERY READS THE TITLE FROM THE FIRST 8 KB ONLY (2.59). Past that,
//     it names the sheet by its file name. Stop rather than publish a sheet
//     the reader cannot find by its subject.
{
  const at = Buffer.byteLength(out.slice(0, Math.max(0, out.indexOf("</title>"))), "utf8");
  if (out.indexOf("<title>") === -1 || at > 8000) {
    throw new Error("FAIL: the <title> ends at byte " + at + ". The gallery reads only the first 8 KB, so it would show the file name. Move <title> to the top of the template.");
  }
}

const outPath = path.join(DIR, name);
fs.writeFileSync(outPath, out, 'utf8');
console.log('wrote ' + outPath + '  (' + out.length + ' bytes, sheet ' + SHEET_VERSION + ')');

// 6. THE LOCAL COPY (q16). A reader asked for a copy on disk at publish time,
//    marked with how fresh it is. Fresh means the answers in it were read back
//    off the LIVE page, not remembered from an earlier round. The mark is the
//    gap between that read and this build.
const copyDir = path.join(DIR, 'copies');
fs.mkdirSync(copyDir, { recursive: true });
const copyPath = path.join(copyDir, SHEET_VERSION + '.html');
fs.writeFileSync(copyPath, out, 'utf8');

const builtAt = new Date();
const ageMin = readAt ? Math.round((builtAt - Date.parse(readAt)) / 60000) : null;
const entry = {
  sheetVersion: SHEET_VERSION,
  file: path.relative(DIR, copyPath).replace(/\\/g, '/'),
  builtAt: builtAt.toISOString(),
  templateVersion: tplVersion,
  templateStamp: stamp,
  answersReadAt: readAt,
  answersAgeMinutes: ageMin,
  freshness: readAt === null ? 'no answers (first publish)'
    : ageMin <= 30 ? 'fresh — answers read off the live page ' + ageMin + ' min before this build'
    : 'STALE — the answers are ' + ageMin + ' min old. Read the live page again.'
};
const idxPath = path.join(copyDir, 'index.json');
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
idx.push(entry);
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');
console.log('local copy: ' + entry.file + '  [' + entry.freshness + ']');
if (entry.freshness.indexOf('STALE') === 0) {
  console.log('WARNING: read the live page again before you publish this.');
}
