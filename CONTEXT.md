# StormHacks Study Game

A solo study app: a student uploads their own course files, and the app turns them into games they choose the kind of. The first kind, Dive, is in the style of Krillion: timed prompts where less obvious correct answers score more. There are six: Dive, Apogee, Leap, Pairs, Blitz and Arena.

## Language

**Player**:
The single student who uploads files and plays the Games made from them. There is no shared play between Players.
_Avoid_: User (in game logic), contestant

**Module**:
A Player's private container for one subject: it holds many Source Documents and many Games.
_Avoid_: Course, folder, class, project

**Source Document**:
One file a Player uploaded into a Module (PDF, PPTX, DOCX), which Prompts are generated from.
_Avoid_: Upload, file, material

**Game**:
The set of Prompts generated once, in one Game Mode, from a chosen subset of a Module's Source Documents. A Game is never regenerated; to change it, the Player makes a new Game.
_Avoid_: Deck, quiz, set

**Game Mode**:
The kind of game a Game is played as, chosen when the Game is created and never changed. A Game Mode decides which kinds of Prompt the Game is generated with, the rules of its Runs, how they score, and how it looks. Game Modes may share Prompt kinds and parts of their rules.
_Avoid_: Game type, game style, mode (on its own, where it could mean something else)

**Dive**:
The first Game Mode, in the style of Krillion. A Run is 7 Prompts drawn at random, 25 seconds each; each wrong guess costs 3 seconds; running out of time scores 0 for that Prompt and the Run continues. Less obvious correct Answers score more (see Tier).
_Avoid_: Krillion mode, classic mode

**Apogee**:
A Game Mode with exactly Dive's Prompts, rules and scoring, set in space: the score is shown as altitude and the Tiers are named Troposphere, Orbit, Lunar and Deep Space.
_Avoid_: Space Dive, rocket mode

**Leap**:
A Game Mode of Multiple-choice Prompts. A Run is 10 Prompts, 15 seconds each, one answer each. A correct answer scores 100 plus a speed bonus of up to 50, times a streak multiplier (×1.5 from the third correct in a row, ×2 from the fifth). A wrong answer or a timeout costs a Heart.
_Avoid_: Quiz mode, jumper

**Pairs**:
A Game Mode where the Player matches terms to their definitions on Boards, against the clock. It uses Definition-to-term Prompts: the definition is the Prompt, the term its Answer.
_Avoid_: Matching, memory, flashcards

**Blitz**:
A Game Mode of True/false Prompts against one 60-second clock: +10 per correct answer, doubled by a Combo; a wrong answer resets the Combo and costs 3 seconds.
_Avoid_: Speed round, lightning mode

**Arena**:
A first-person Game Mode of Multiple-choice Prompts: the stem floats on a board and the 4 options are targets to shoot. A Run is 10 Prompts, 20 seconds each. Hitting the right target scores like Leap (100 plus a speed bonus of up to 50, times the streak multiplier), less 25 for each wrong target hit first (never below 25). A wrong target shatters and costs 3 seconds, and the Prompt stays open; a timeout scores 0.
_Avoid_: FPS mode, shooter, quiz

**Run**:
One play-through of a Game, by the rules of its Game Mode.
_Avoid_: Game, round, session, play

**Prompt**:
One question in a Game. The first correct Answer ends it. Which kinds of Prompt a Game uses, how they're timed and how many tries they take, depend on its Game Mode.
_Avoid_: Question, card

**Open Prompt**:
A Prompt with many valid Answers, each with its own Rarity (e.g. "Name a graph algorithm").
_Avoid_: Open set, category prompt

**Single-answer Prompt**:
A Prompt with exactly one correct Answer: fill-in-the-blank, definition-to-term, put-in-order, or odd-one-out. In Dive, the Prompt itself carries one Tier, assigned when the Game is generated.
_Avoid_: Closed prompt, fact question

**Multiple-choice Prompt**:
A Prompt with a stem and exactly 4 options, one of which is correct; that option is its Answer and the other three are plausible distractors from the same notes. Used by Leap and Arena.
_Avoid_: MCQ (in user-facing text), quiz question

**True/false Prompt**:
A statement from the notes that is either true or false (a false one changes one detail of a real fact). Its Answer is True or False. Used by Blitz.
_Avoid_: Fact check, binary question

**Hint**:
A short clue toward the Answer of a Single-answer Prompt, written when the Game is generated and never containing the Answer. In Dive, revealing it drops the points by one Tier; a hinted common Prompt is worth 5.
_Avoid_: Clue, help

**Answer**:
A response the game accepts as correct for a Prompt. It must be backed by Evidence in a Source Document.
_Avoid_: Solution, option

**Alias**:
Another accepted spelling or name for an Answer (e.g. "breadth-first search" for BFS).
_Avoid_: Synonym, variant

**Evidence**:
The page in a Source Document that supports an Answer.
_Avoid_: Citation, source

**Off-syllabus guess**:
A guess that may be true in general but has no Evidence in the Source Documents, so it is not accepted.
_Avoid_: Wrong answer (it is not necessarily wrong)

## Scoring (Dive)

**Rarity**:
An Answer's rank of obscurity among the other Answers to the same Open Prompt, set once when the Game is generated and never changed by play. Exactly one Answer per Open Prompt is rarest.
_Avoid_: Prior rarity, crowd rarity, difficulty

**Tier**:
A named points band (common 10, solid 25, deep 60, rare 100). Answers to Open Prompts get a Tier from their Rarity; a Single-answer Prompt gets one Tier for the whole Prompt.
_Avoid_: Level, rank

**Staleness**:
The halving of an Open Prompt Answer's points for each earlier Run in which the Player scored with that same Answer on that same Prompt, never below 1 point.
_Avoid_: Decay, repeat penalty

## Play (Leap, Pairs, Blitz, Arena)

**Heart**:
One of a Leap Run's 3 lives. A wrong answer or a timeout costs one; at none left the Run ends early (the Player "fell").
_Avoid_: Life, HP

**Lifeline**:
Leap's 50/50: once per Run, it removes two wrong options from the current Prompt and halves that Prompt's points.
_Avoid_: Power-up, hint (a Hint is Dive's)

**Board**:
One round of Pairs: 6 terms and their 6 definitions, shown shuffled, with its own 60-second clock. A Pairs Run is 2 Boards. A mismatch costs 10 points and 2 seconds; clearing a Board early scores 5 per second left.
_Avoid_: Level, grid, round

**Hit**:
In Arena, shooting a target: it counts as answering with that option. A wrong Hit shatters the target; only the right Hit ends the Prompt. Shots that hit no target don't count.
_Avoid_: Shot (a shot can miss), guess

**Combo**:
Blitz's count of correct answers in a row. Once it reaches 5, each further correct answer scores double; a wrong answer resets it.
_Avoid_: Streak (that's Leap's multiplier, and the daily habit), chain

**Pass**:
A finished Run that meets its Game Mode's pass bar: Dive and Apogee score at least 150; Leap gets at least 7 of 10 right without falling; Pairs clears both Boards; Blitz scores at least 150; Arena gets at least 7 of 10 right. Courses use it to unlock the next Topic.
_Avoid_: Win, clear, complete

## Progress

**Personal Best**:
The Player's highest Run score on a Game.
_Avoid_: High score, leaderboard, ranking

**Mastery**:
The share of a Game's Answers the Player has ever found.
_Avoid_: Progress, completion
