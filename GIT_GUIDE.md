# Git Quick Guide (Beginner)

ഈ project-ൽ Git ഇനി enable ചെയ്തിട്ടുണ്ട്.

## Daily workflow
1. Work ചെയ്യുക (code changes).
2. `git status` നോക്കി changed files കാണുക.
3. `git add <file>` അല്ലെങ്കിൽ `git add .`
4. `git commit -m "clear message"`

## Useful commands
1. Current status: `git status`
2. Last commits: `git log --oneline -n 10`
3. File changes: `git diff`
4. Undo unstaged file: `git restore <file>`
5. Undo to last commit (all local changes): `git reset --hard HEAD`

## Safe undo method (recommended)
1. പുതിയ commit ഇടുക.
2. പഴയ commit-ലേക്ക് revert വേണമെങ്കിൽ:
   `git revert <commit_id>`

## How we will work
1. ഞാൻ ഓരോ meaningful change-നും commit ഇടും.
2. നീ പറയേണ്ടത് മാത്രം:
   - "save this" -> commit
   - "undo last" -> revert last commit
   - "show history" -> log explain ചെയ്യും
