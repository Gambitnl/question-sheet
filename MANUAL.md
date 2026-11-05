# Question Sheet — Manual

Every component, every flag, every failure message. Read [README.md](README.md)
first for what the tool is and how to install it.

- [1. Setup](#1-setup)
- [2. The components](#2-the-components)
- [3. The sheet file](#3-the-sheet-file)
- [4. Build a round](#4-build-a-round)
- [5. The answer channel](#5-the-answer-channel)
- [6. The requests a reader can send](#6-the-requests-a-reader-can-send)
- [7. The overlap check](#7-the-overlap-check)
- [8. The task bridge](#8-the-task-bridge)
- [9. Local files, and why they are not in git](#9-local-files-and-why-they-are-not-in-git)
- [10. Failure messages](#10-failure-messages)
- [11. Change the template](#11-change-the-template)

---

## 1. Setup

### 1.1 Requirements

| Need | Why |
|---|---|
| Node 18 or newer | The builder and the checks run on Node. `fetch` is used without a polyfill. |
| Claude Code, or another agent that reads a skill folder | The skill file teaches the agent the round protocol. |
| The Claude Artifact runtime | The page saves itself and comments through it. |

### 1.2 Link the skill

The agent loads a skill from `~/.claude/skills/<name>/SKILL.md`. Link this
repository's `skill/` folder there, so the repository stays the only copy.

Windows, with a junction. A junction needs no administrator rights; a symbolic
link does:

```bash
cmd /c mklink /J "%USERPROFILE%\.claude\skills\question-sheet" "C:\path\to\question-sheet\skill"
```

macOS and Linux:

```bash
ln -s "$(pwd)/skill" ~/.claude/skills/question-sheet
```

Check it:

```bash
node ~/.claude/skills/question-sheet/template-check.cjs
```

The first line prints the real path of the template. A link that works prints
the path inside this repository.

### 1.3 Copy the three local files

```bash
cp skill/categories.example.json skill/categories.json
cp skill/gallery.example.json    skill/gallery.json
cp skill/local.example.json      skill/local.json   # only for the task bridge
```

Then edit `skill/categories.json`. The tags name your project's subjects.
Section 9 says what each file holds and why git ignores it.

---

## 2. The components

### `skill/template.html`

The page itself. One file. No build step, no framework, no network call.

- It renders the sheet from a JSON block the builder writes into it.
- It keeps every pick in browser storage under one key, so a reload never
  loses an answer.
- It saves a complete new copy of itself when the reader presses Send.
- It declares its own version in the first line, as
  `<!-- question-sheet-template-version: 2.70`.

Never edit a built page. Edit the template, then rebuild.

### `skill/build.cjs`

The one builder. Every round goes through it, so a mistake is fixed once.

```bash
node skill/build.cjs --dir <work dir> --key <storage key> --v <sheet version> \
     [--name <file name>] [--stamp <expected stamp>] [--new] [--untagged]
```

| Flag | Meaning |
|---|---|
| `--dir` | The work directory. It holds `sheet.json` and `live-answers.json`, and receives the built page and `copies/`. Default: the current directory. |
| `--key` | The browser storage key for this sheet. It must never change across rounds, or the reader's saved answers vanish. Required. |
| `--v` | This round's sheet version, for example `v12`. |
| `--name` | The output file name, without `.html`. Default `question-sheet`. |
| `--stamp` | The template stamp you expect. The build fails when the template moved under you. |
| `--new` | This is the first publish. It allows an empty answer carry. |
| `--untagged` | Build with no tags. The overlap check cannot see the sheet. Use it for a throwaway only. |

It fails closed four ways. Each failure is a real mistake, not a warning:

1. The template moved and you did not read the change (`--stamp` mismatch).
2. The answers were not carried back from the live page.
3. A placeholder in the template was not filled.
4. The answers file holds nothing and you did not pass `--new`.

It also writes a local copy of what you published to `copies/<v>.html`, with
an index that records how fresh the answers in that copy were.

### `skill/template-check.cjs`

```bash
node skill/template-check.cjs
```

Prints the template path, its size, its declared version, its content stamp,
and every field the template understands — sheet fields, question fields, and
option fields. Run it before a round. A field the template does not list is a
field the page will ignore in silence.

### `skill/overlap.cjs`

Finds the same question asked twice in two conversations. See section 7.

### `skill/tasks-bridge.cjs`

Turns the sheet's task rows into tasks on a coordination board. Optional. See
section 8.

### `skill/SKILL.md`

The operating manual for the agent, and the longest file here. It holds the
round protocol, the schema, the page anatomy, and the rules earned from real
rounds — what to do when an answer is unclear, how to retire a stale question,
why answers are never erased, and what a status label must say.

Read it if you want to understand the tool's judgment. The agent reads it on
its own.

---

## 3. The sheet file

`sheet.json` is the whole questionnaire. `skill/example-sheet.json` is a small,
complete one you can copy.

The short form:

```json
{
  "title": "Import Tool Brief",
  "eyebrow": "Data import · open questions",
  "lede": "What this sheet is for, in one or two sentences.",
  "categories": ["data", "tooling"],
  "facts": ["4 source formats", "12,400 rows in the sample"],
  "questions": [
    {
      "id": "q1",
      "title": "What happens to a row the parser cannot read?",
      "why": "The sample holds 38 rows with a broken date.",
      "multi": false,
      "options": [
        { "label": "Stop the whole import", "note": "Safest. One bad row costs the run.",
          "recommended": true, "whyRecommended": "A half-imported table is worse than no import." },
        { "label": "Skip the row and log it", "note": "The import finishes. You must read the log." }
      ],
      "noteLabel": "Notes",
      "placeholder": "e.g. stop only above 1 percent"
    }
  ]
}
```

The fields a page can carry, in groups:

| Group | Fields |
|---|---|
| Head | `title`, `eyebrow`, `lede`, `ledeLabel`, `facts`, `templateVersion`, `sheetVersion`, `status` |
| Questions | `questions`, `questionsLabel`, `questionsHint` |
| Decisions | `settled`, `settledLabel` |
| History | `changelog`, `changelogLabel` |
| Work | `checklist`, `checklistLabel`, `newTasks` |
| Rules | `principles`, `principlesLabel`, `principlesWhy` |
| Plumbing | `categories`, `pageUrl`, `workdir`, `listener`, `versionCheck`, `watch`, `reply`, `meta` |

Run `template-check.cjs` for the live list, including every question field and
option field. `SKILL.md` explains what each one is for and when to use it.

Two rules worth stating here:

- **Both versions are objects, not strings.** Pass
  `{ "id": "v2.71", "at": "<ISO time>", "hash": "<stamp>" }`. Read all three
  from the template at build time. A hand-typed stamp is how a sheet claims a
  template it was not built from.
- **An answer is never erased.** A question you retire keeps its answer in the
  decisions list. The reader must always find what they said.

---

## 4. Build a round

```bash
# 1. Read the template, and record what it is.
node skill/template-check.cjs

# 2. Read the live page and save its answers block.
#    The agent does this through the Artifact tool, into:
#    <work dir>/live-answers.json

# 3. Build.
node skill/build.cjs --dir ./work --key my-sheet-v1 --v v3 --stamp b461e8882306

# 4. Publish <work dir>/question-sheet.html as an Artifact, with:
#    capabilities: { "artifact": {}, "comments": {} }
```

The first publish of a new sheet has no answers yet:

```bash
node skill/build.cjs --dir ./work --key my-sheet-v1 --v v1 --new
```

---

## 5. The answer channel

The page writes to itself. That is the whole trick.

1. The reader picks options and types notes. Everything is in browser storage
   from the first keystroke.
2. The reader presses **Send answers to Claude**.
3. The page posts a comment through `comments.sendToClaude()`. The comment
   wakes every Claude session that watches the artifact. **It goes out first**,
   because step 4 reloads the page.
4. The page builds a complete new copy of itself, with the answers embedded as
   JSON, and calls `artifact.publish()`.
5. The session wakes, reads the artifact, and pulls the answers out of the
   `answers` block. The comment names the send time. When the block's `sentAt`
   is older than that, the save is still in flight: read again.
6. The agent replies in the comment thread and writes one short line in chat.

**A republish alone does not wake a session.** That changed in the platform
around 2026-09-20. The comment in step 3 is the only wake-up. A page built from
template 2.63 or older has no step 3 and wakes nobody. Rebuild it.

What the page needs, and what breaks without it:

| Capability | Without it |
|---|---|
| `artifact` | The save fails. The page falls back to a text block the reader can paste. |
| `comments` | The save works and tells nobody. The page's own banner says so, in amber. |

The full `comments` grant makes the artifact organization-internal. It cannot be
shared on the public web. A reader with view-only access cannot send at all, and
the page tells them which case they are in. The page asks the reader once, on
the first Send, for permission to comment for them.

The answers record the outcome of their own delivery: `told` is `yes` or the
failure code, and `claudeThread` is the thread every later Send replies into.
Carry both forward on every build. Never clear them.

---

## 6. The requests a reader can send

The answers may carry `request: { kind, at, ... }`. The agent acts on it first,
then drops it, so a control never sticks on "waiting".

| `kind` | The reader pressed | The agent does |
|---|---|---|
| `version-check` | Ask Claude to check the version | Compare the sheet's stamp with the template on disk. Rebuild when a newer one exists. Write `versionCheck`. |
| `start-task` | Start this now, on a task row | Start that row's work. Cancel it when `cancel` is true. |
| `new-task` (`where: "local"`) | Start locally, on the new-task card | Make a background-task chip from the card's text, then append a `newTasks` row that says what was made. |
| `new-task` (`where: "cloud"`) | Start in the cloud | Start the task remotely and append the same row with its link. |
| `ping` | Is anyone listening? | Write `listener: { askedAt, at, by }` and rebuild. The reader learns whether a session is awake. |
| `rule` (`op: "keep"` / `"drop"`) | Keep or drop a standing rule | Change the stored memory FIRST, then the row, then rebuild. A row that claims a rule your memory does not hold is a lie on the page. |

---

## 7. The overlap check

The failure it repairs: the same question, asked twice, in two conversations
that do not know about each other.

```bash
node skill/overlap.cjs                 # every overlap, in words
node skill/overlap.cjs --json          # the same, as JSON
node skill/overlap.cjs --for "<title>" # the categories array for ONE sheet
node skill/overlap.cjs --templates     # which sheets are off the live template
```

How it works:

1. Every artifact a Claude session reads leaves a copy under
   `~/.claude/projects/**/artifact-*.html`. That is the corpus.
2. The check groups every sheet it finds by tag.
3. It reports a tag that is **live** on more than one sheet. Live means the
   sheet still has an open question. A settled sheet cannot ask you anything,
   so it cannot ask you twice.

It is honest about its limit. A sheet published and never read again is not on
disk, so it cannot be checked. The report prints how many sheets it saw, so a
suspiciously small number is visible instead of silent.

Set `QSHEET_SNAPSHOT_ROOT` to point the check at a different corpus. The tests
use it against a fixture.

**One shared tag list is what makes this work.** Two sheets can only be seen to
share a topic when they spell the topic the same way. So a tag comes from
`categories.json` and from nowhere else. To add a tag, add it to that file
first, with a real `covers` line, then use it.

---

## 8. The task bridge

Optional, and off until you configure it. It turns a sheet's open task rows into
real, tracked work:

1. a feature on a plan map,
2. a task on an [Agora](https://github.com/Gambitnl/Aralia/tree/master/tools/agora) coordination board,
3. the task id written back onto the row.

```bash
node skill/tasks-bridge.cjs --dir <sheet dir> --topic <plan-map topic id> \
     [--title "<topic title>"] [--campaign tooling] [--dry]
node skill/tasks-bridge.cjs --dir <sheet dir> --sync
node skill/tasks-bridge.cjs --dir <sheet dir> --watch
```

`--sync` reads every linked task back from the daemon and writes its state onto
the row. `build.cjs` runs it before every build, so the page shows the board and
not a memory of the board.

**The repository path has no default.** The bridge writes into a repository, and
that path belongs to your machine. Set it one of three ways, in this order of
precedence:

1. `--repo <path>`
2. the `QSHEET_REPO` environment variable
3. `"repo"` in `skill/local.json`

With none of the three set, any step that writes fails with a message naming all
three. `--sync` never needs the path, so a reader with no board can still build
a sheet: the sync step prints a warning and leaves every row as it was.

This is the one component tied to another project's systems. If you do not run
an Agora daemon, ignore it. Nothing else depends on it.

---

## 9. Local files, and why they are not in git

Four files in `skill/` name one machine, one project, or one person's artifacts.
Git ignores them. Each has a tracked `.example` twin.

| File | What it holds | Example |
|---|---|---|
| `categories.json` | Your project's tag list. The shared vocabulary the overlap check needs. | `categories.example.json` |
| `gallery.json` | The artifact ids still published. The overlap check skips a saved sheet that is no longer in the gallery, so a deleted artifact stops counting as an open sheet. | `gallery.example.json` |
| `overlap-notified.json` | A log of which overlaps were already reported, and the verdict. Pure state; it needs no example. | — |
| `local.json` | The repository path for the task bridge. | `local.example.json` |

A missing `categories.json` fails loudly, with the copy command in the message.
A missing `gallery.json` prints a warning and keeps going. A missing
`overlap-notified.json` is normal on a first run.

---

## 10. Failure messages

| Message | Cause | Fix |
|---|---|---|
| `FAIL: template drift. Expected X, found Y` | Another session changed the template since your last build. | Read what changed in the template's own header, then pass the new stamp. |
| `FAIL: live-answers.json is missing` | You are about to publish over a live page without carrying its answers. | Read the published page and save its answers block. Or pass `--new` for a first publish. |
| `FAIL: live-answers.json holds no picks and no other answer content` | The carry is empty. | Read the page again. A round can carry a note, a comment, or a flag with no picks, and that counts. A carry with nothing in it does not. |
| `FAIL: pass --key <storageKey>` | No storage key. | Pass the same key every round. The reader's answers live under it. |
| `FAIL: this sheet carries no tags` | `sheet.json` has no `categories`. | Add 1 to 3 ids from `categories.json`. Or pass `--untagged` for a throwaway. |
| `FAIL: <path>/categories.json is missing` | A fresh clone. | `cp skill/categories.example.json skill/categories.json`, then edit it. |
| `FAIL: these tags are not in categories.json` | A sheet invented a tag. | Add the tag to the shared list first, or use the existing tag that nearly fits. |
| `FAIL: no host repository is set` | The task bridge has nowhere to write. | Set `--repo`, `QSHEET_REPO`, or `"repo"` in `local.json`. Or do not use the bridge. |
| `WARNING: the Agora daemon is not reachable` | The board is down, or you do not run one. | Nothing. Task states are left as they were, and the build goes on. |
| `WARNING: no gallery.json` | A deleted artifact still counts as an open sheet. | Rewrite `gallery.json` from an Artifact listing. |
| `WARNING: the lede reads like a note about one round` | The lede says what changed instead of what the sheet is. | Move it to the change log. The lede is the subject. |

---

## 11. Change the template

1. Read the template's header. It carries its own numbered history, newest
   first. Every change says what reader asked for it and why.
2. Add your entry at the top of that history, and raise the version number on
   the first line.
3. Edit by unique-anchor replacement, with a script that throws when an anchor
   is not unique. The file is 5,800 lines, and a loose anchor hits twice.
4. Run `node skill/template-check.cjs`. Confirm the new version and stamp.
5. Build a throwaway sheet and look at the page in a browser, in light mode and
   in dark mode. A visual change is not verified until it is seen.

Two template rules that are easy to break:

- Every dark override must sit inside `@media (prefers-color-scheme: dark)`. A
  `:root:not([data-theme="light"])` rule outside that media query leaks dark
  colors into light mode.
- A field the template does not read is ignored in silence. Add the field to
  the renderer and to the field list that `template-check.cjs` prints.
