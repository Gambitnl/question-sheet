# The X post

Three drafts. Pick one. Each is under the 280-character limit for the free
tier; the thread is written for one post per tweet.

**Attach a picture.** The tool is visual, and a screenshot does more than any
sentence here. Best options, in order:

1. A short screen capture: a reader picks two options, types a note, presses
   Send, and the banner turns green with "told Claude: yes".
2. One screenshot of a real sheet, cropped to the title, one question with its
   options, and the button bar.
3. Two screenshots side by side: the page before Send, and the receipt after.

---

## Draft 1 — the problem first (recommended)

> My coding agent used to ask me 6 questions one at a time, and I'd babysit the
> chat for an hour.
>
> Now it publishes a page. I answer at my own pace, hit one button, and the
> answers go back on their own. No copy-paste.
>
> Open source, MIT:
> github.com/<you>/question-sheet

Characters: 268.

## Draft 2 — the mechanism

> Built a thing: your AI agent's questions, as one page you can actually
> answer.
>
> Real options. The trade-off behind each one. The reason you're being asked.
>
> Press Send → the page saves your answers into itself and wakes the agent.
>
> github.com/<you>/question-sheet

Characters: 262.

## Draft 3 — short and blunt

> Stop answering your coding agent one question at a time.
>
> One page. Every open question. Real options with real trade-offs. One button
> sends it all back.
>
> MIT licensed → github.com/<you>/question-sheet

Characters: 211.

---

## The thread, if you want to go longer

**1/6**

> My coding agent used to ask me 6 questions one at a time, and I'd babysit the
> chat for an hour.
>
> So I built it a questionnaire. Open source today. 🧵

**2/6**

> The agent writes the questions into one published page.
>
> Every question carries its options, the cost of each option, and WHY I'm
> being asked at all.
>
> I answer the ones I care about and skip the rest.

**3/6**

> The part I like: I press one button, and the page saves my answers into
> itself, then wakes the session that built it.
>
> No copy. No paste. No "here are my answers, in order, 1 through 6".

**4/6**

> It keeps the record.
>
> Open it next week and it still shows every question, what I answered, and
> what the agent did about it. Settled decisions move into their own list with
> the reasoning, in plain language and in technical detail.

**5/6**

> One more thing it does: it catches the same question asked twice.
>
> Each sheet is tagged from one shared list. If two open sheets touch the same
> topic, it tells me before I answer the same thing in two conversations.

**6/6**

> Node + Claude Code. One HTML template, one builder, and a skill file that
> teaches the agent the protocol.
>
> MIT. Take it apart.
>
> github.com/<you>/question-sheet

---

## Notes before you post

- Replace `<you>` with the real GitHub handle in every draft.
- The repository must be public first, or the link reads as broken.
- Claim nothing the tool does not do. It is Claude-specific: the self-save and
  the wake-up are built on the Claude Artifact runtime. Someone will ask. The
  honest answer is in the README under "Requirements and limits".
- The full `comments` grant keeps a published sheet inside your organization.
  Do not promise a public demo link to a live sheet. Post pictures instead.
- Good first reply to have ready: "What does the agent see?" The answer is a
  JSON block of picks, notes, per-option comments, page notes, and an
  unclear-flag per question.
