#!/bin/zsh
cd /Users/thomas/Documents/GitHub/Primal-Fire/.claude/worktrees/silly-gould-d0f05a
echo "$1" > .scratch/code.txt
npx @iwsdk/cli browser run .scratch/ev.mjs 2>&1 | grep '"result"\|message'
