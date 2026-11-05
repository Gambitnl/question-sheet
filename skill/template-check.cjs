#!/usr/bin/env node
/**
 * Template drift check for the question-sheet skill.
 *
 * The skill template is replaced from outside any session. When that happens
 * silently, a sheet gets rebuilt on the new template without adopting what the
 * new template added, and features the old sheet had are lost. That happened on
 * 2026-08-28: a rebuild dropped the changelog, the reasons on decisions, and
 * the names on all four boxes.
 *
 * The published page is the only thing that survives a skill replacement, so
 * the page carries the stamp. This script reads the stamp back and compares.
 *
 * Usage:
 *   node template-check.cjs                       print the current stamp
 *   node template-check.cjs <stamp>               compare against the page's stamp
 *   node template-check.cjs <stamp> <old.html>    also diff the fields
 *
 * Exit code 1 on drift, so a build script can fail closed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMPLATE = path.join(__dirname, 'template.html');

/** Every SHEET.* and option field the template actually reads. */
function fieldsOf(html) {
  const sheet = new Set();
  const option = new Set();
  const question = new Set();
  for (const m of html.matchAll(/\bSHEET\.([a-zA-Z][a-zA-Z0-9]*)/g)) sheet.add(m[1]);
  for (const m of html.matchAll(/\bo\.([a-zA-Z][a-zA-Z0-9]*)/g)) option.add(m[1]);
  for (const m of html.matchAll(/\bq\.([a-zA-Z][a-zA-Z0-9]*)/g)) question.add(m[1]);
  return {
    sheet: [...sheet].sort(),
    option: [...option].sort(),
    question: [...question].sort(),
  };
}

/** The human version the template declares for itself. The hash says whether
 *  two files are identical; this says what kind of change happened. */
function declaredVersion(html) {
  const m = /question-sheet-template-version:\s*([0-9]+\.[0-9]+)/.exec(html);
  return m ? m[1] : null;
}

function stampOf(html) {
  return crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
}

const html = fs.readFileSync(TEMPLATE, 'utf8');
const stamp = stampOf(html);
const now = fieldsOf(html);
const expected = process.argv[2];
const oldPath = process.argv[3];

console.log('template : ' + TEMPLATE);
console.log('bytes    : ' + html.length);
const version = declaredVersion(html);
console.log('version  : ' + (version ? 'v' + version : '(undeclared)'));
console.log('stamp    : ' + stamp);

if (!expected) {
  console.log('');
  console.log('sheet fields   : ' + now.sheet.join(', '));
  console.log('question fields: ' + now.question.join(', '));
  console.log('option fields  : ' + now.option.join(', '));
  console.log('');
  console.log('Record this stamp in the sheet you build from it.');
  process.exit(0);
}

if (expected === stamp) {
  console.log('');
  console.log('OK — the template has not changed since that sheet was built.');
  process.exit(0);
}

console.log('expected : ' + expected);
console.log('');
console.log('*** TEMPLATE DRIFT ***');
console.log('The template changed since that sheet was built. Do NOT rebuild until');
console.log('you have read what changed and decided what to adopt.');

if (oldPath && fs.existsSync(oldPath)) {
  const before = fieldsOf(fs.readFileSync(oldPath, 'utf8'));
  const added = (a, b) => a.filter((x) => !b.includes(x));
  const gone = (a, b) => b.filter((x) => !a.includes(x));
  for (const scope of ['sheet', 'question', 'option']) {
    const plus = added(now[scope], before[scope]);
    const minus = gone(now[scope], before[scope]);
    if (plus.length) console.log('  + ' + scope + ' gained: ' + plus.join(', '));
    if (minus.length) console.log('  - ' + scope + ' lost  : ' + minus.join(', '));
  }
} else {
  console.log('');
  console.log('Pass the old template as a third argument to see which fields moved.');
}

console.log('');
console.log('Then: adopt the new fields, log a `skill` entry in the page changelog,');
console.log('and stamp the new value into the rebuilt sheet.');
process.exit(1);
