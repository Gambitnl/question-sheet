---
name: question-sheet
description: |
  Ask the user a set of scoping questions as a published Artifact form that
  sends the answers back to Claude automatically. Use when you must ask more
  than about three questions before you start work, when the user says "ask me
  questions", "list your questions", or "put your questions in an artifact",
  or when the questions carry pickable options plus free text. Covers the
  question schema, the self-publish channel that returns the answers, and how
  to read them. Not for a single question — use AskUserQuestion for that.
author: Claude Code
version: 1.0.0
date: 2026-08-27
---

# Question Sheet

Ask many questions at once. Get the answers back without a copy-and-paste step.

## Where this tool lives

This folder is the whole tool, and it is its own repository:
`question-sheet`. The folder you read this from may be a link into that
repository, so a change you make here changes the repository.

| File | What it is |
|---|---|
| `template.html` | The page. Edit this, never a built page. |
| `build.cjs` | The one builder. Every round goes through it. |
| `template-check.cjs` | Prints the version, the stamp, and every field. |
| `overlap.cjs` | Finds the same question asked twice. |
| `tasks-bridge.cjs` | Optional. Turns task rows into board tasks. |

Four files are host-local and are not in git. Each has a tracked
`.example` twin, and a missing one fails with the copy command in the
message: `categories.json` (the tag list), `gallery.json` (the artifact ids
still published), `overlap-notified.json` (which overlaps were reported), and
`local.json` (the repository path the task bridge writes into).

The repository also holds `README.md` and `MANUAL.md`, written for a human
who installs the tool. Keep them true when you change behavior here.

## When to use this

Use it when all of these are true:

- You must ask four or more questions before you start work.
- The questions have options worth explaining, or need free text.
- The user must be able to answer at their own pace.

Use `AskUserQuestion` instead for one to three quick questions.

## How the answer channel works

The page writes to itself.

1. The user picks options and types notes.
2. The user presses **Send answers to Claude**.
3. The page posts a comment sent to Claude (`comments.sendToClaude`). The
   comment wakes every session that watches the artifact. It goes out FIRST,
   because the save in step 4 reloads the page.
4. The page builds a complete new copy of itself with the answers embedded as
   JSON, then calls `artifact.publish()`.
5. The comment arrives in your session. Read the artifact and pull the answers
   out of the `answers` JSON block. The comment names the send time. If the
   block's `sentAt` is older, the save is still in flight: read again.
6. Reply in the comment thread, resolve it, and write one short line in the
   chat.

**A republish alone no longer wakes a session** (changed about 2026-09-20). Step 3
is the only thing that wakes you. Template 2.63 and older have no step 3, so a
sheet on those templates wakes no one: rebuild it on 2.64 or newer.

The page needs `capabilities: {"artifact": {}, "comments": {}}`. Without
`artifact`, the send fails and the page falls back to a text block the user can
paste. Without `comments`, the save works but tells no one, and the banner says
so. The full `comments` grant keeps the page inside the organization. The first
Send asks the user once to let the page comment for them.

The answers record the result: `told` is "yes" or the failure code, and
`claudeThread` is the thread every later Send replies into. The build carries
both; never clear them.

## Steps

1. **Research first.** Ground every question in the real code or the real
   files. Name real counts, real file paths, real option costs. A question the
   user cannot answer without guessing is a wasted question.

2. **Write the sheet JSON.** See the schema below. Keep it to nine questions or
   fewer. Give every option a `note` that says what choosing it costs.

3. **Build the page with `build.cjs`. Do not hand-copy the template.**

   ```
   node ~/.claude/skills/question-sheet/build.cjs      --dir <your scratchpad> --key <storage key> --v v1 --new
   ```

   The builder fills the three placeholders (`__PAGE_TITLE__`,
   `__SHEET_JSON__`, `__STORAGE_KEY__`), carries the answers forward, clears
   any pick on a question marked `_clearPick`, and writes a local copy. It
   fails closed on template drift, on lost answers, and on an unfilled
   placeholder.

   **Publishing a sheet you built any other way is not allowed.** A reader
   ruled on this on 2026-09-05: ship the builder with the tool, and refuse to
   publish without it. Every session used to write the same builder again from
   these rules, and each copy carried its own mistakes.

   Pass `--stamp <expected>` to gate on a known template hash. Pass `--new`
   only on a first publish, when there are no answers yet.

4. **Publish it.**

   ```
   Artifact(
     file_path: "<scratchpad>/<name>.html",
     favicon: "<one emoji>",
     description: "<one sentence>",
     capabilities: {"artifact": {}, "comments": {}}
   )
   ```

   The publish result must say that this session watches the artifact. A
   comment sent to Claude reaches only a session that watches. An unwatched
   sheet reads "watching now: no one", and Send tells no one.

5. **Hand over the link, and send a notification.** Tell the user to answer and
   press Send. List the question titles in your reply, so they know what is
   coming. Then fire a push notification for that round — one per round, every
   round, new or updated. A published round that nobody is told about sits
   until the user happens to open the dashboard. (Asked for by a reader on
   2026-08-31, who picked the per-round ping over a daily digest.)

6. **Wait.** Do every part of the task that does not depend on the answers.
   Never poll the artifact. The comment sent to Claude arrives on its own.

7. **Read the answers.** When the comment arrives, call
   `Artifact(action: "read", url: <the url>)`. Find the
   `<script type="application/json" id="answers">` block. It holds:

   ```json
   {
     "picks": { "q1": "the chosen label", "q6": ["label a", "label b"] },
     "notes": { "q1": "free text" },
     "sentAt": "2026-08-27T12:40:00.000Z"
   }
   ```

   `picks` holds a string for a single-choice question, and an array for a
   `multi` question. An unanswered question is absent. Treat an absent answer
   as "use your own default", and say which default you chose.

   `own` holds the text a user typed into the **My own answer** option. That
   option appears on every question unless the question sets `"own": false`.
   When the user picks it, `picks` holds the literal string `"My own answer"`
   and the real answer sits in `own`. Read `own` first — it beats the options
   you wrote. Do not confuse it with `notes`: notes add color to a pick, and
   `own` replaces the pick.

   Two more maps arrive beside them:

   ```json
   {
     "multi": { "q3": true },
     "unclear": { "q2": { "on": true, "reasons": ["jargon", "live"] } }
   }
   ```

   `multi` names the questions where the user turned on several answers. Its
   `picks` entry is then an array even though the question was single-choice.

   `unclear` is the important one. **Act on it before anything else.** The user
   flagged that question and said why. The reason ids are:

   | id | What it means | What you do |
   |---|---|---|
   | `jargon` | Words only someone in the code would know | Rewrite in plain words. Name a thing by what it does. |
   | `what` | Does not follow the SUBJECT | Explain the thing itself, plainly, before the choices. |
   | `example` | Needs a picture | Draw a mockup or capture a real screenshot into `sample`. |
   | `live` | Wants to look at it | Give a URL they can click on their own machine. |
   | `why` | Follows it, but not the STAKES | Say what breaks if this goes the wrong way — or drop the question. |
   | `conflict` | Fights an earlier answer | Name the earlier answer and resolve it. |
   | `options` | None of the options fit | Ask what they want instead, or widen the list. |
   | `big` | Too big to answer in one go | ONE decision with too many parts. Break it into steps next round. |
   | `unknown` | Needs a number they do not have | Go and measure it, then ask again. |
   | `two` | Really two questions | TWO separate decisions glued together. Pull them apart and ask each. |

   **`what` and `why` are not the same complaint, and they want opposite
   replies.** They were one option until 2.6, and a reader said so directly: it
   could mean "I do not care about this" or "I genuinely do not understand what
   the problem entails". Explaining the subject to someone who understood it
   perfectly and simply does not think it matters is patronising; justifying the
   stakes to someone who never followed the subject is useless. Read the tick,
   and answer the complaint you were actually given.

   A flagged question keeps its `status` as `"clarification"` next round.

   **A clarification always uses the `clarify` block (template 2.50).** Do not
   invent a new layout for each rewrite. A reader said the shape changed every
   time, which forced a full rescan to find the answer. Fill the same rows:

   ```json
   "clarify": {
     "flagged": "what the reader said was wrong, in their words",
     "changed": "what this round did about it",
     "what":    "the thing itself, in plain words, before any choice",
     "stakes":  "what goes wrong if the choice is wrong",
     "example": "one concrete case (optional)"
   }
   ```

   The page draws them in that fixed order, with fixed labels. Keep `answer`
   for extra detail only, and keep it short.

   ### A reason the list does not hold

   The not-clear box ends with a free-text line: **"None of these? Name the
   reason yourself."** The text comes back in `newReasons`, keyed by question
   id:

   ```json
   { "newReasons": { "q4": "this asks two things at once" } }
   ```

   **A new reason is not a one-off answer. It is a template change.** Run this
   protocol the round it arrives:

   1. Read it against the seven. If one already covers it, say which, quote
      both, and ask whether the existing wording failed or the reason is
      genuinely new. Do not just file it away.
   2. If it is new, add it to `UNCLEAR_REASONS` in `template.html`, add a row
      to the table above, bump the declared version, and re-run
      `template-check.cjs`.
   3. Log a `skill` entry naming the reason you added.
   4. Answer the flagged question itself, using the new reason.

   **Why it exists:** a free-text complaint dies with the sheet, so the same
   gap reappears on the next one. A reader asked for this directly on
   2026-08-31.

## Sheet schema

```json
{
  "title": "Page name",
  "eyebrow": "Small label above the title",
  "templateVersion": { "id": "v2.2", "at": "ISO time the template changed", "hash": "content hash" },
  "sheetVersion": { "id": "v4", "at": "ISO time you rebuilt this sheet" },
  "lede": "One or two sentences telling the user what to do.",
  "facts": ["a real count", "a real file path"],
  "questions": [
    {
      "id": "q1",
      "title": "The question, ending in a question mark",
      "why": "Why the answer changes the work. Optional.",
      "multi": false,
      "options": [
        { "label": "Short option name", "note": "What it costs or implies.",
          "pro": "One concrete upside.", "con": "One concrete cost.",
          "recommended": true, "whyRecommended": "Why this one, in a sentence.",
          "extensive": true, "quick": true }
      ],
      "noteLabel": "Notes",
      "placeholder": "Hint text for the free-text box",
      "own": true,
      "ownNote": "Text under the My-own-answer option. Optional.",
      "ownPlaceholder": "Hint text inside the own-answer box",
      "recommended": true,
      "whyRecommended": "One sentence. Why this option, not the others.",

      "status": "new",
      "answerTag": "Answer — mostly no",
      "answer": "<p>HTML. What you found since the last round.</p>",
      "sampleCaption": "Sample — what this shows",
      "sample": "<div>HTML. A mockup, or an <img> with a data URI.</div>"
    }
  ],

  "questionsLabel": "Open questions",
  "questionsHint": "Answer these, then press Send.",

  "settledLabel": "Decisions",
  "settled": [
    { "what": "Thumbnail size —", "verdict": "360 px wide.",
      "whyPlain": "Pixel numbers meant nothing to you, so I made one real preview at three sizes and you chose the middle one by eye.",
      "whyTech": "Captured PaneThumb at width 240/360/480 px via the headless rig; the user picked 360 from the side-by-side. 360 is the new THUMB_W constant.",
      "from": "Round 5 · you picked from the samples" }
  ],

  "changelogLabel": "What changed",
  "changelog": [
    { "name": "Round 3", "at": "2026-03-12T14:26:00Z", "changes": [
      { "kind": "page",  "text": "Added the task list." },
      { "kind": "skill", "text": "Folded the task list into the reusable tool." },
      { "kind": "fix",   "text": "The not-clear box did not save. It does now." }
    ]}
  ],

  "checklistLabel": "Task list",
  "checklist": [
    { "label": "Settle the brief", "state": "done", "group": "Scoping" },
    { "label": "Build the thing", "state": "doing", "group": "Now" },
    { "label": "Ship it", "state": "todo", "group": "Next" },
    { "label": "Waiting on the API key", "state": "blocked", "group": "Next",
      "who": "needs Remy" }
  ],

  "meta": {
    "label": "About this questionnaire itself",
    "why": "Not about the subject. About this page.",
    "fieldLabel": "What would you change here?",
    "placeholder": "Layout, wording, what is missing"
  }
}
```

### The four parts of a page

### The two version badges

`templateVersion` and `sheetVersion` render as two small badges above the
title, and again below the button bar at the foot of the page. A reader who
reaches the end can name the version without scrolling back up.

- `templateVersion` is the template's own declared version. It answers
  "which template is this page built from?"
- `sheetVersion` is your own round marker for this one questionnaire. It
  answers "which round am I looking at?"

They are different questions. The template is the reusable tool; the sheet is
this subject on that tool. When an answer looks stale, those two say which of
the two is behind.

**Pass the object form. Never a bare id.**

```json
"templateVersion": { "id": "v2.2", "at": "2026-08-28T15:16:15Z", "hash": "34b23bc14cf4" },
"sheetVersion":    { "id": "v4",   "at": "2026-08-28T15:16:45Z" }
```

The badge then reads `template  v2.2 · 28 Aug 17:16, just now`.

- `id` is the readable version. `at` is an ISO timestamp; the badge shows the
  date and how long ago. `hash` is optional and shows only in the tooltip.
- `note` is optional and renders beside the date. Two or three words at most.
- A plain string still works and renders the id alone, for an older sheet.

Read all three from the template at build time. A hand-typed stamp is how a
sheet ends up claiming a template it was not built from.

### A version is not a hash

The template declares its version in a header comment, and a person bumps it:

```
<!-- question-sheet-template-version: 2.2 -->
```

- **major** — sheets must be re-authored: a new required field, or a renamed one.
- **minor** — additive: a new optional field, or a rendering improvement.

`template-check.cjs` prints the declared version beside the content hash. The
two do different jobs and neither replaces the other:

| | Answers | Set by |
|---|---|---|
| Declared version | What kind of change happened | A person, deliberately |
| Content hash | Did this file change at all | Derived, automatically |

The drift check uses the hash, because "did anything change" must not depend on
somebody remembering to bump a number. The badge shows the version, because a
hash cannot tell a reader whether a change mattered.

This was learned twice. The first build showed a bare hash and the reader said
it told them nothing. The second added a date and kept the hash as the
identifier, which was still wrong for the same reason. Only a declared version
carries intent.

Set both every round. Bump `sheetVersion` on every republish, and bump the
template's declared version whenever you change the template.

The version also belongs in the changelog as a `skill` entry. The badge is for
the reader at a glance; the changelog is the history.

A sheet has four containers, and every one carries a name. A page of unlabeled
boxes makes the reader work out what each is for.

| Setting | Default | What the box holds |
|---|---|---|
| `changelogLabel` | What changed | How the page itself has changed |
| `checklistLabel` | Task list | The work: done, in flight, waiting |
| `settledLabel` | Decisions | What the user settled, kept visible |
| `questionsLabel` | Open questions | The part that wants an answer |

Rename any of them to suit the subject. Keep them **names**, not sentences: a
label like "Built to these" describes an action and reads as a fragment, which
is the mistake these defaults replaced.

`questionsHint` adds one short line beside the questions heading, for an
instruction like "Answer these, then press Send."

### Decisions, and why each one stuck

Every decision line opens. Closed, it shows what was decided. Open, it shows
the brief reason it was locked in.

- `what` and `verdict` make the line that always shows.
- The reason comes in **two voices, and every new row carries both** (template
  2.3, asked for by a reader on 2026-08-29):
  - `whyPlain` — for a person outside the work. No jargon, no file names, no
    project shorthand. Say what the thing IS and what breaks if the choice
    goes the other way.
  - `whyTech` — for an agent. Exact paths, function names, and numbers — but
    still spell out coined terms: another agent has not read this session
    either.
  - Legacy `why` still renders, as the plain voice, so old sheets keep
    working. **Two or three sentences per voice. Never more.**
- `from` names where it was settled, so the exchange can be found again.

A row without any reason stays a plain line, so this is safe to add gradually.

**Write the reason, not the decision again.** The line already says what was
decided. The open part answers a different question: *why did this stop being
arguable?* Six weeks later that is the part nobody can reconstruct.

What belongs in a `why`:

- **The evidence that settled it.** "A sweep counted about 470 of them, roughly
  95 minutes to photograph."
- **A change of mind, kept honestly.** "You first asked for a row per inner
  view, then cut it back once you saw the real number." Never quietly rewrite
  the record to look like the answer was obvious.
- **A decision proved right the hard way.** "Without it, one capture ran 41
  minutes before I killed it."

What does not:

- Restating the verdict in longer words.
- Praise for the choice.
- Anything you did not actually observe.

Write it the round the decision lands, while you still remember what tipped it.
Reconstructing reasons later produces a tidy story rather than a true one.

### Say your status; do not make it be guessed

Add a `status` object to the sheet. The artifacts dashboard reads it and shows
it instead of working the answer out from timestamps.

```json
"status": {
  "state": "waiting-on-you",
  "headline": "Six questions on the rig, and nothing moves until they land.",
  "by": "Rigging Track",
  "next": "Answer these and I build the bind pose."
}
```

- `state` — one of **`waiting-on-you`**, **`blocked`**, **`working`**,
  **`done`**, **`parked`**. Nothing else is read. An unknown word is IGNORED, so
  a typo cannot mark work as finished.
- `headline` — one sentence, shown on the dashboard row. Say what is true now.
- `by` — which track or agent set it.
- `next` — what happens after the current step. Optional.

**Set it every round.** A stale status is worse than none, because it overrides
the timestamps that would otherwise be right.

**Why this exists.** Without it the dashboard compares when the page was last
published against when Remy last pressed Send, and infers whose turn it is. That
works, but it cannot tell **finished** from **still going** — a watched
conversation looks busy either way. Only the agent knows.

**`blocked` is not the same as `waiting-on-you`.** Use `waiting-on-you` for the
ordinary next round. Use `blocked` when work has actually stopped and cannot
resume until Remy answers.

### The changelog

`changelog` records how THE PAGE changed each round. It renders folded shut,
newest first, with the newest entry and its time on the fold line.

**It is only about the questionnaire and the tool behind it.** Nothing about the
subject you are scoping belongs here. A decision the user made, a file you
moved, a count you measured — those go in `settled` and `checklist`, which
already exist for exactly that. Mixing the two makes the log useless for its one
job: telling the reader how the page they are looking at has changed.

That distinction is easy to blur, and it was blurred on the first attempt.

- Put the newest entry **first**. Never reorder or rewrite an old entry.
- `at` is an ISO timestamp. The page shows it in the reader's own clock and
  adds how long ago it was.
- `changes` takes plain strings, or `{kind, text}` for a colored tag.
- `kind` is one of:
  - `page` — this sheet's own behavior. A new control, a layout change.
  - `skill` — the reusable tool gained the same thing.
  - `fix` — something about the page was wrong and you corrected it.

**Use a real time, never an invented one.** A published artifact keeps a version
history, and each version id is a plain count of seconds. Read the true moment
from it rather than guessing a plausible date.

**Log your own mistakes with `fix`.** A changelog that only records progress is
marketing. The `fix` entries are what earn the log its trust, and what stops the
same wrong turn happening twice.

Add an entry every round, even a small one. Two lines beat none.

### The task list

`checklist` draws a running task list with a progress bar. It is the part the
user watches, so keep it honest and keep it current every round.

- `state` is one of `done`, `doing`, `blocked`, `todo`.
- `group` starts a new heading. Reuse the same string for consecutive items.
- `who` is optional, for work another person or session owns.
- **Describe the work, not just its name** (template 2.8, asked for by a
  reader): a row may carry `detail` (one sentence saying what the work IS),
  `scope` (a bullet list of the concrete steps), and `from` (which answers
  produced it, e.g. "From q1 + q3"). A row with any of these opens like a
  decision row. Derive these from the questionnaire's answers — the task
  list is where the answers turn into work.

Update it every round. Move an item to `done` only after you verified it, and
say in the reply how you verified. A task list that claims work nobody did is
worse than no task list.

### The receipt: say what you did, and when

A re-asked question still shows the reader's old pick. Without a receipt they
cannot tell whether anything changed. Give every question you acted on an
`addressed` object:

```json
"addressed": {
  "at": "2026-09-01T00:05:00Z",
  "what": "One sentence: what you did about their last answer.",
  "was": "The pick this question carried before."
}
```

It draws a green band under the question: **Addressed**, the time in the
reader's own clock, and how long **after** they last pressed Send it happened.

- **`at` must be a real time, and it must be later than their send.** A stamp
  older than `sentAt` turns the band amber and reads "Addressed earlier",
  because it proves nothing about this round.
- **`what` says what you did**, not what you will do.
- **`missed` is written by the build, not by hand.** Set it when the carried
  answers held **no pick and no typed text** for that question. It draws a
  pulsing amber **asked again** tag beside the title and one line in the band.
  A returning unanswered question otherwise looks exactly like a new one, so
  the second chance is invisible. A reader asked for this on 2026-08-31: *"this
  should be construed as 'missed' by me. just put a pulsing tag ... that the
  question is being asked again because nothing was picked."*
- **`was` is written by the build, not by hand.** When you re-ask a question,
  clear its carried pick and put the old value in `was`. Clearing a stale pick
  is right; hiding what the reader said is not. See "Trim every round".

**Why:** a reader on 2026-08-31 said it directly — *"you still left my
'selection' intact, which makes it really hard for me to tell if you actually
changed anything... maybe a timestamp with it that's updated next to the
'addressed' text?"*

### One question at a time, and notes on the page

**`focus`.** Every question carries its own send button. When the reader uses
it, the answers arrive with `focus: { q, at }`. Act on that question ALONE and
answer it in place. Do not re-read the sheet, and do not touch other questions.

**The write is always whole-page.** `artifact.publish()` replaces the document;
there is no partial write. So when a reader asks whether the whole sheet must be
rewritten: the PAGE rewrites itself every time, and there is nothing to be done
about that. YOU do not have to re-read it. `focus` removes the reading cost,
never the write.

**`pageNotes`.** The dock arms an element picker. A note the reader attaches to
any part of the page arrives as `{ path, about, note, at }`:

```json
{ "pageNotes": [ { "path": "section.q > div.opts", "about": "Keep the paste fallback",
                   "note": "this wording is backwards", "at": "2026-09-01T…" } ] }
```

`about` is what they saw; `path` is where it sat. Read them with the answers and
act on each one. It is not the claude.ai comment system — a published page
cannot reach that — so never imply the note went anywhere but into these answers.

### The dock

A small group of controls travels with the send bar: how many questions are
answered, a jump to the next unanswered one, **a numbered square per question**
that jumps straight to it and fills green once answered, the note picker, and a
jump to the top. It has **two shapes**, and the arrow picks between them.

- **Open** — it lifts off the bar and floats just above it as a small window,
  with the controls as a vertical list. **Drag it by its top row** to move it
  anywhere; double-click that row to send it home. The spot is remembered per
  browser and clamped to the window, so it can never strand itself off screen.
- **Shut** — it drops back onto the bar as one quiet line: the count and the
  arrow.

The bar is sticky, so both shapes stay in view at any scroll position. The
choice is remembered per browser. The template does all of it; you configure
nothing.

**Two shapes were tried and rejected, both caught by a screenshot:**

- Translucent, to keep it quiet. The page text read straight through its own
  buttons. Quiet comes from low contrast and small type, never transparency.
- Floating just above the send bar. That stacked two panels in one corner. It
  belongs ON the bar, which was already sticky and already had a Send button.

### Silence is not an answer

Every question carries three hand-back buttons, and the choice returns in a
`defer` map keyed by question id:

| value | What the reader said | What you do |
|---|---|---|
| `youdecide` | Decide it for me | Decide it, and say which default you chose. Do not re-ask. |
| `later` | Ask me again next round | Keep the question open. Put it on the next sheet. |
| `spawn` | Give this its own thread | Open a NEW conversation for that topic, brief it, and tell it to use this skill. Then drop the question from this sheet and record the hand-off in `settled`. |

**With those buttons live, an empty question means one thing only: the reader
never reached it.** Treat it that way, and do not decide it for them.

**The page cannot spawn anything.** It records the request. You open the
conversation and report back. Never write a button or a link that claims
otherwise.

### The five requests the page can send

The answers may carry `request: { kind, at, ... }`. Act on it first, and drop it
once it is answered, so a control never sticks on "waiting".

| kind | What the reader pressed | What you do |
|---|---|---|
| `version-check` | Ask Claude to check the version | Compare the sheet's template stamp with the template on disk. Rebuild the page when a newer one exists. Write `versionCheck: { at, said, upgraded }`. |
| `start-task` | Start this now, on a task row | Start that row's work, or take the request back when `cancel` is true. The build drops it once its `at` is in the sheet field `handled`. |
| `new-task`, `where: "local"` | Start locally, on the new-task card (2.60) | Call the background-task tool (`spawn_task`) with the card's `text` as the prompt and its `title`. It makes a chip the reader presses once to start a session. Then append `newTasks: { askedAt, where, title, said, at }`. |
| `new-task`, `where: "cloud"` | Start in the cloud | Start the task on a remote machine, and append the same row with its `link`. |
| `ping` | Is anyone listening? (2.62) | Set `listener: { askedAt: <request.at>, at: <now>, by: <this session> }` and rebuild. The build drops the request once `listener.at` is newer. |

A `newTasks` row draws at the foot of the page, so the reader sees what came of
the request. Say plainly in `said` what was made, and never claim a chip or a
session that does not exist.

### The lede says what the sheet is (2.70)

`lede` sits under the title, labeled **WHAT THIS SHEET IS**. Write one or two
sentences that say what the whole sheet is FOR, and keep them true for every
round: the subject, who it is for, and what a reader does here.

Never write what this round changed. That belongs in two places that already
exist: the change log, and the status band. A reader on 2026-09-29 pointed at
a lede that opened "Your note asked for a filter and a button..." and asked
"what is this section for?!" The build now warns on that shape.

### How you decide — the distilled rules (2.68)

`principles` is a short list of general rules, drawn from the decisions. A reader
asked for it on 2026-09-28: "a summary of my decisions (not on a granular
level), of how i think in general. stuff that could be converted to memory."

```json
"principles": [
  { "text": "The rule, in the reader's own terms.",
    "from": "q9 · q22 · the drift gate",
    "memory": "saved" }
]
```

- `text` — one general rule. Never a single ruling, and never a file name.
- `from` — the decisions it was distilled from.
- `memory` — `"saved"` when you already keep it as a standing rule outside the
  page, `"new"` when this round distilled it, or `"dropped"` when the reader
  told you to stop keeping it.

**The reader can change a row (2.69).** Each row carries one button, and the
box carries a filter over the three states. The button sends
`request: { kind: "rule", op: "keep" | "drop", i, text }`. Act in this order:

1. Change your OWN memory first. `keep` writes the rule into a memory file
   under the project memory folder, and adds its index line. `drop` deletes
   it from that file, and from the index.
2. Then set `principles[i].memory` to `"saved"` or `"dropped"`.
3. Then rebuild. The build drops the request once the row matches the ask.

A row that says "standing rule" while your memory holds nothing is a lie on
the page. The badge is a claim about your memory, never about the sheet.

Three rules for you:

1. Distill after every round in which a decision was settled.
2. Save every `"new"` row to your own memory in the SAME turn, then it reads
   `"saved"` on the next build. A row marked new that you never saved is a lie
   on the page.
3. Re-word a row when the reader corrects it, and update the memory with it.

### The two boxes at the top

The task list and the decisions render side by side, above everything, in folds
that start SHUT. Each fold carries a switch (2.71): knob left and gray means it opens **collapsed**, knob right and amber means it opens **expanded**, and one word beside it names the state.
The side it points at is green, at full brightness, and 2px larger; the other
side is red and dimmed. That side is how the box opens next time, on that
browser only, and pressing it flips the box now as well. Opening the box by its
heading flips the toggle too, so the two can never disagree.

You do not configure this; the template does it. Keep the two lists short enough
to be worth opening.

### Status labels

`status` puts a colored label beside the question title. Use exactly one of:

- `"new"` — green. The question did not exist last round.
- `"updated"` — amber. You reworded it after a partial answer.
- `"clarification"` — purple. The user said it was unclear and you rewrote it.

Set `status` fresh every round. Drop it from questions that did not change.

### The own-answer box and per-option comments

The **My own answer** option is a single action, not two. Picking it puts the
caret in the box. Typing in the box picks it. When other options were already
picked, typing switches the question to several-answers and keeps them, rather
than throwing them away. A chosen box carries a green edge; picking anything
else clears it.

Every option, including the own one, carries a **comment button**. It opens a
small box for a question about that one choice. Comments come back in a
`comments` map keyed by question id, then by option label:

```json
{ "comments": { "q1": { "Fix it now": "how long is this really?" } } }
```

Read them. A comment on an option is a question you have not answered yet, and
it usually means the option text was not clear enough.

### The local copy, and how fresh it is

`build.cjs` writes a copy of every published page to `copies/<sheetVersion>.html`
in your work directory, and appends a row to `copies/index.json`.

A reader chose this on 2026-09-05, over keeping no copy and over saving one only
when asked. Each row says:

- which sheet version it is, and when it was built;
- which template version and stamp it came from;
- when the answers inside it were last read off the LIVE page;
- a plain freshness line.

**Freshness is about the answers, not the file.** The copy is `fresh` when the
answers were read off the live page within 30 minutes of the build. It is
`STALE` otherwise, and the builder says so on the console. A stale copy means
you are about to publish over answers you have not seen. Read the live page
again first.

The copies are proof, not a backup channel. The page still lives at one URL,
and the older versions stay in the artifact version list.

### Hand a sheet to a new conversation

The desktop app answers the `claude://` scheme. `claude://claude.ai/new?q=<text>`
opens a NEW chat with the composer already filled. Nothing is sent until the
reader presses Enter. Confirmed in the installed build (1.46388.3.0) on
2026-09-05, together with these limits:

- `q` is cut at **14,336** characters.
- Every value must be URL-encoded.
- A `q` that starts with `/` is rejected, so it cannot be a slash command.
- `claude://code/new` takes `q` or `prompt`, plus `folder` and `file`.

**The page must never fire the link.** The artifact frame forwards a click to
the host only when the protocol is `http:` or `https:`. Every other scheme dies
inside the sandbox with no error, so a `claude://` button always looks broken,
whether or not the link is good. The template therefore shows the link as text
and offers to copy it. The reader opens it from the Run box, a shortcut, or a
terminal. Test one the same way, never from a page button.

The dock's **hand to a new chat** button builds the text: the page URL, an
instruction to read the page and say what was understood, the sheet and
template versions, and the list of questions still open.

### One tool, and the page is optional

A reader ruled on 2026-09-05 that there is ONE question sheet, and the
published page is one way to show it. A second implementation had been built
elsewhere that cannot publish a page at all.

So the sheet JSON is the tool. The page is a renderer.

- Where a page can be published, publish it. It is the better surface: it
  keeps state, carries receipts, and answers come back on their own.
- Where it cannot, render the same `sheet.json` as text and take the answers
  in the reply. The schema does not change. The question numbers do not
  change. A later session can build the page from the same file.
- Never fork the schema for the text renderer. A field the text form cannot
  show is skipped, not renamed.

### Tag every sheet, from the one shared list

**Every sheet must carry `categories`.** It is a list of ids taken from
`categories.json` in this skill folder, and from nowhere else.

`build.cjs` refuses to build a sheet with no tags (2026-09-13). Pass `--untagged`
only for a throwaway sheet. `node overlap.cjs --untagged` lists every open sheet
with no tags and the session folder that owns it.

**Refresh `gallery.json` before a build.** The overlap check reads saved copies,
and a copy stays on disk after its artifact is deleted. Run `Artifact action
list`, and write the 8-character id prefixes and the time into `gallery.json`.
`overlap.cjs` skips a saved sheet that is not in the gallery, and warns when the
file is missing or more than 7 days old.

```json
"categories": ["tooling", "planning"]
```

A reader settled this on 2026-09-06, over the decision-to-work-task pipeline.
The failure it repairs was named in round two: the same question, asked twice,
in two conversations that did not know about each other.

**One shared list is the whole mechanism.** Two sheets can only be seen to share
a topic if they spell that topic the same way. A sheet that invents its own tag
is invisible to the check, so:

- Pick from `categories.json`. Never write a tag that is not in it.
- If an existing tag nearly fits, use the existing tag.
- To add one, put it in `categories.json` FIRST, with a real `covers` line.
- `build.cjs` refuses an unknown tag. That refusal is the point.

**The check runs on every publish.** `build.cjs` calls `overlap.cjs`, which
reads every question sheet on the machine, and marks any tag that is also live
on another OPEN sheet. A settled sheet is counted but never flagged: with no
open question it cannot ask you anything, so it cannot ask you twice.

A marked tag renders purple and says *also on another sheet*, with the other
sheet named in its hover text.

Run it by hand any time:

```
node ~/.claude/skills/question-sheet/overlap.cjs
```

**What it cannot see.** It reads the artifact copies under
`~/.claude/projects/**`, which exist only for artifacts Claude has read. A sheet
published and never read again is not on disk. The report says how many sheets
it saw, so a suspiciously small number is visible rather than silent.
`QSHEET_SNAPSHOT_ROOT` overrides the folder, which is how the detector is
tested against a fixture.

**When a tag is flagged, say so in the round.** Name the other sheet and what it
is asking, so the two conversations can split the work instead of duplicating
it.

**Then tell both conversations.** A script cannot send a message; the session
that runs the build does it with the session tools:

1. Run `node overlap.cjs --notify`. It prints one entry per set of sheets not
   told yet: the shared topics, each sheet with its `owner` (the folder name of
   the conversation that reads it most), and a ready message.
2. For each owner, call `search_session_transcripts` with the owner id. The hit
   is the conversation to tell. Skip your own conversation.
3. Call `send_message` with the printed message to each conversation found.
4. Run `node overlap.cjs --mark-notified <key>`. The pair is then never told
   twice. The record lives in `overlap-notified.json` in this folder.

Report in the round which conversations were told. If an owner cannot be found,
say so; do not guess a conversation.

### Turn the task list into real work (template 2.53)

**Optional.** This section and the board steps in it need an Agora daemon and a
plan map, which are part of one project, not of this tool. Without them, skip
it: the build prints one warning and every other part works. See MANUAL.md,
section 8.

A sheet's task list IS its decisions turned into work. Put every open row on
the Agora board, linked to the plan map:

```
AGORA_AGENT_ID=<your key> node tasks-bridge.cjs --dir <sheet dir> --topic <plan-map topic id> --title "<topic title>"
```

- Register the identity once first: `node tools/agora/client.mjs register ...`
  with the same `AGORA_AGENT_ID`.
- Each open row without a task gets a plan-map feature under the topic and an
  Agora task whose ref is `planmap:<topic>/<slug>`. The row gets
  `task: { id, ref }`.
- `build.cjs` runs `tasks-bridge.cjs --sync` on every build, so each row shows
  the board state and holder, and a row moves to done when its task does.
- The plan map follows the board through the daemon (claimed = active,
  done = done). Claim the task you work on, so the map is honest.
- `planmap-add.mjs` cannot replace `public/planmap/topics.json` by rename on
  this machine (EPERM every time). The bridge edits a working copy and writes it
  back in place. Do not call planmap-add on the real file from a script.
- Give every linked row a `doneWhen` list (template 2.56):
  `[{ "text": "<a condition a reader can check>", "met": true|false }]`.
  A row with no finish line cannot answer "how will I know when this is done?".
  Update `met` each round. When every condition is met, close the task on the
  board (`client.mjs task state <id> done --result "..."`).
- When a build prints `DONE NOW: <id>`, send the reader a push notification
  that names the task. The sync prints it once, on the first build that reads
  the task as done, and records `task.doneAt`.
- The page cannot see the board. Only a build moves a row. So a session that
  owns a sheet with linked tasks arms a monitor on
  `node tasks-bridge.cjs --dir <sheet dir> --watch`. It reads the board every
  60 seconds and prints `TASK CHANGED: <id> <old> -> <new>`. On that line,
  read the live page, build the next version, publish it, and notify the reader.
  Say plainly on the sheet that the watch lasts only as long as the session.

## Check the template before every round

This template is replaced from outside any session. A rebuild on a newer
template that you did not read drops whatever the new template added, and the
page silently loses features it used to have.

Run the check first, every round:

```
node <skill-dir>/template-check.cjs <stamp-from-the-live-page>

# prints the declared version and the content hash together:
#   version  : v2.2
#   stamp    : 34b23bc14cf4
```

It exits 1 on drift and names the fields that moved. Wire it into your build
script so a build **fails closed** rather than warning.

The **published page carries the stamp**, because the page is the only thing
that survives the skill folder being replaced. Record it as a `skill` entry in
the changelog every round:

```json
{ "kind": "skill", "text": "Built with template 4276ce0a5da2." }
```

On drift: read what the new template reads, adopt the new fields, log a
`skill` entry saying what was adopted, and stamp the new value. Never rebuild
past a drift warning.

A button on the page cannot do this. The page is a static snapshot on
claude.ai with no filesystem access, and a strict CSP blocks every external
host, so it can never see the template on the author machine. The check belongs
to the build step; the page only carries the stamp and the log.

### Close the loop — republish after you act

**Reading the answers is half the job. The other half is telling the page what happened.**

The moment you finish acting on a round's answers, republish the sheet:

1. Move every answered question into `settled`, with its outcome and where the
   record now lives — a document section, a file, a task id.
2. Update `checklist` to what actually shipped, checked against the repository,
   not against your plan.
3. Add a `changelog` entry saying what changed on the page.
4. Bump `sheetVersion`.
5. Replace the answered questions with whatever the work newly raised. A round
   with nothing left open is finished; say so in the lede rather than leaving
   stale questions on screen.

### A finished sheet collapses into the repository

A sheet with nothing left open must not stay a full sheet. Do three things:

1. **Collapse the page.** Drop the answered questions. Keep the decisions, the
   task list, and the changelog. Say in the lede that it is settled.
2. **Write the decisions into the repository.** The artifact lives on
   claude.ai; the code does not. Put the decisions in a real document beside
   the work, and make the page point at it.
3. **Add it to the plan map.** A settled sheet is a build decision, and build
   decisions belong on the plan map the same turn. See the project's plan-map
   authoring rules.

**Why:** the reasoning is the part nobody can reconstruct six weeks later, and
an artifact is the wrong place to keep it. A reader chose this on 2026-08-31.

**A stale sheet is worse than no sheet.** It shows decided questions as open, so
the reader cannot tell what is still theirs to answer. This was learned the hard
way: a round's answers were acted on in full and the page sat unchanged for
hours, still asking eight questions that were all settled.

**The page cannot do this for you.** It is a static snapshot on claude.ai with no
filesystem access, and a strict CSP blocks every external host, so it can never
see your work or its result. The wiring only runs one way: the viewer's **Send**
republishes the page, and that republish wakes your session. Closing the loop is
your side of that exchange.

**Never rebuild past a refused publish.** If the viewer sent answers, the live
version was saved from inside the page and the publish is refused until you merge
onto it. Read the live version in full, carry its `answers` block into your
rebuilt file verbatim, and publish again. The ids in that block may match no
current question after a re-round; keep it anyway. It is the record of what the
viewer actually said, and a rebuild must never destroy it.

## Rounds

A question sheet is a conversation, not a form. Expect two or three rounds.

After the first send, edit the sheet and publish again to the same URL. Keep
the `answers` block from the live version — read it, and write it back into
your file — or the user loses every answer they gave.

Two optional fields carry a round forward:

- `answer` — an HTML block under the question. Use it to report what you found
  since the last round. `answerTag` names it, such as "Answer — mostly no".
- `sample` — an HTML block for a mockup or a picture. `sampleCaption` names it.

Both accept raw HTML. Write it yourself. Never paste HTML a viewer typed.

**Show, do not describe.** A user cannot judge "240 px" from the number. Give
them one real screenshot at all three widths and let them look. Capture it with
headless Chrome and embed it as a data URI:

```
chrome.exe --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,860 --virtual-time-budget=12000 \
  --screenshot=out.png "<url>"
```

`example-sheet.json` in this folder holds a complete worked example. Read it
to see the shape. Never copy its questions — they belong to another task.

Rules for the fields:

- `id` must be unique. Use `q1`, `q2`, and so on.
- `multi: true` renders checkboxes. `multi: false` renders radio buttons.
- `options` may be empty for a free-text-only question.
- **Every option must carry a `pro` and a `con`.** One concrete upside, one
  concrete cost. An option with no stated cost makes the reader rebuild the
  trade-off themselves.
- **Tag the ends of the range.** `extensive: true` marks the most complete
  option; `quick: true` marks the fast mitigation. They are labels, not
  endorsements, and either may also be the recommendation. Use at most one of
  each per question, and only when the range genuinely has ends.
- **Every question must mark exactly one option `recommended: true`** and give
  it a `whyRecommended`. Say what you would do and why. A sheet with no
  recommendation hands the ranking back to the reader.
- **A taste question shows samples instead of arguing.** When the choice is
  look and feel, a recommendation is you guessing at somebody's taste and
  dressing it as advice. Put a real side-by-side in `sample` — three widths,
  two layouts, four color ramps — and let the reader point. Capture the
  samples from the real thing where one exists; draw a mockup where it does
  not. A taste question with no picture is the one case where the
  recommendation rule above does more harm than good. (Asked for by a reader
  on 2026-08-31: "taste questions should bring forth side-by-side samples to
  pick".)
- `facts` are chips under the title. Put verified numbers there, not claims.

## What the template already handles

Do not rebuild any of this:

- Light theme and dark theme, through CSS tokens.
- A browser draft, so a reload never loses typing.
- A green banner naming the time the answers went out. It appears above the
  questions AND below the button bar, because that is where the reader was
  looking when they pressed Send.
- **Show as text** and **Clear** buttons.
- Every publish error code, with a paste fallback for each.
- A changelog of page changes each round, timestamped and folded shut.
- A colored NEW / UPDATED / CLARIFICATION label per question.
- A **Let me pick more than one** toggle under every single-answer question.
- A **This question was not clear** checkbox with six reasons, under every
  question. A flagged question turns amber.
- A `settled` list whose rows open to show why each decision stuck.
- A `status` object the artifacts dashboard reads.
- A `meta` feedback box at the bottom.

## Trim every round

Remove a question once it is fully answered. Move its outcome into `settled`,
so the record stays visible without asking again.

Reword a partly answered question so it states only what is still open, and set
its `status`. Never re-ask what the user already decided.

Watch for a stale pick: if you change a question's options, an old answer whose
label no longer appears is not an answer. Treat that question as unanswered and
say so.

## Traps

- **Never serialize the live DOM to publish.** The template rebuilds the
  document from its own source. Keep that shape.
- **Keep the questions as data.** The self-publish reads the `sheet` block and
  re-emits it. Markup you hand-write outside the template is lost on send.
- **Do not change the storage key after the user starts typing.** Their draft
  lives under the old key. Migrate it, or they lose the work.
- **A closing script tag inside a string breaks the page.** The template writes
  every one as `"<" + "/script>"`. Keep that.
- **The answers are private to the artifact.** Nothing reaches you until the
  user presses Send.
