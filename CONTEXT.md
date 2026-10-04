# StormHacks Study Game

A solo study app: a student uploads their own course files, and the app turns them into games they choose the kind of. The first kind, Dive, is in the style of Krillion: timed prompts where less obvious correct answers score more.

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

**Run**:
One play-through of a Game, by the rules of its Game Mode.
_Avoid_: Game, round, session, play

**Prompt**:
One question in a Game. The first correct Answer ends it. Which kinds of Prompt a Game uses, and how they're timed, depend on its Game Mode.
_Avoid_: Question, card

**Open Prompt**:
A Prompt with many valid Answers, each with its own Rarity (e.g. "Name a graph algorithm").
_Avoid_: Open set, category prompt

**Single-answer Prompt**:
A Prompt with exactly one correct Answer: fill-in-the-blank, definition-to-term, put-in-order, or odd-one-out. In Dive, the Prompt itself carries one Tier, assigned when the Game is generated.
_Avoid_: Closed prompt, fact question

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

## Progress

**Personal Best**:
The Player's highest Run score on a Game.
_Avoid_: High score, leaderboard, ranking

**Mastery**:
The share of a Game's Answers the Player has ever found.
_Avoid_: Progress, completion
