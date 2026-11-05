# Question Sheet

**Your coding agent asks its questions on one page. You answer at your own pace. The answers come back on their own.**

A question sheet is a published Claude Artifact. It holds every open question of
a task, with real options and the reason each question exists. You pick, you
type, you press one button. The page saves your answers into itself and wakes
the Claude session that built it. No copy. No paste. No lost reply.

This repository is the tool: one HTML template, one builder, and the skill file
that teaches an agent to run a round correctly.

![status](https://img.shields.io/badge/template-v2.70-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-18%2B-brightgreen)

---

## Why it exists

An agent that must ask six questions has three bad options:

1. It asks them one at a time, and you babysit a chat for an hour.
2. It asks them in one wall of text, and you answer four of six.
3. It guesses, and you find out two days later.

A question sheet is the fourth option. Every question carries its options, the
trade-off behind each option, and the reason you are asked at all. You answer
the ones you care about, skip the rest, and close the tab. Your answers stay on
the page, so the next round starts from what you already said.

## What a round looks like

1. The agent writes `sheet.json`: the questions, the options, the facts.
2. The agent runs `build.cjs`. It gets one self-contained HTML page.
3. The agent publishes the page as an Artifact and sends you the link.
4. You answer. You press **Send answers to Claude**.
5. The page posts a comment to the agent, then saves a new copy of itself with
   your answers inside it.
6. The agent wakes, reads the answers, does the work, and rebuilds the page
   with a receipt of what it did.

The page is the record. Open it a week later and it still shows every question,
every answer you gave, and what came of each one.

## Install

You need Node 18 or newer, and Claude Code (or any agent that can read a skill
folder and publish an Artifact).

```bash
git clone https://github.com/<your-name>/question-sheet.git
cd question-sheet
cp skill/categories.example.json skill/categories.json
cp skill/gallery.example.json skill/gallery.json
```

Then link the skill into your agent. Pick one:

**Windows (link, so the repository stays the only copy):**

```bash
cmd /c mklink /J "%USERPROFILE%\.claude\skills\question-sheet" "C:\path\to\question-sheet\skill"
```

**macOS and Linux:**

```bash
ln -s "$(pwd)/skill" ~/.claude/skills/question-sheet
```

**Or copy it, if you do not want a link:**

```bash
cp -r skill ~/.claude/skills/question-sheet
```

Confirm the link works:

```bash
node ~/.claude/skills/question-sheet/template-check.cjs
```

It prints the template version, its content stamp, and every field the template
understands.

Now edit `skill/categories.json`. The tags name your project's subjects. The
tool uses them to tell you when two sheets ask about the same topic.

Full setup, every component, and every failure message: **[MANUAL.md](MANUAL.md)**.

## Ask for a sheet

Tell your agent:

> Put your questions in a question sheet.

Or let it decide. The skill triggers on its own when an agent must ask more than
about three questions before it starts work.

## What is in the box

| Component | What it is |
|---|---|
| `skill/template.html` | The page. One file, no build step, no network. It renders the sheet, keeps your answers in browser storage, and saves itself. |
| `skill/build.cjs` | The one builder. It stamps the sheet, carries the old answers forward, and refuses to publish four kinds of mistake. |
| `skill/template-check.cjs` | Prints the template version, its stamp, and the supported fields. Run it before a round. |
| `skill/overlap.cjs` | Finds two open sheets that ask about the same topic, so you are not asked the same thing twice. |
| `skill/tasks-bridge.cjs` | Optional. Turns the sheet's task rows into real tasks on a coordination board. |
| `skill/SKILL.md` | The operating manual for the agent. 1,000 lines of rules earned from real rounds. |

## Requirements and limits

- **Artifact capabilities.** The page needs `artifact` (to save itself) and
  `comments` (to wake the session). Without `artifact` the Send button falls
  back to a text block you can paste. Without `comments` the save works but
  wakes nobody, and the page says so on its own banner.
- **A full `comments` grant keeps the artifact inside your organization.** It
  cannot be shared with the public web. That is the price of the wake-up.
- **One editor saves.** A read-only viewer cannot send. The page tells them.
- **Claude-specific.** The answer channel is built on the Claude Artifact
  runtime. The template renders anywhere; the self-save does not.
- **Node is used at build time only.** The published page runs alone.

## The parts that are not portable

Two components reach into one project's own systems. Both are optional and both
are off until you configure them:

- `tasks-bridge.cjs` writes to an [Agora](#) coordination daemon and a plan map.
  It needs a repository path. It has no default, so it fails with a clear
  message instead of writing to the wrong place.
- `SKILL.md` carries a few sections about that same board. Read them as an
  example of how to wire a sheet into a tracker, not as a requirement.

Everything else — the page, the builder, the version gates, the overlap check —
works with nothing but Node and Claude.

## License

MIT. See [LICENSE](LICENSE).
