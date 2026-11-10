#!/bin/zsh
cd /Users/thomas/Documents/GitHub/Primal-Fire/.claude/worktrees/silly-gould-d0f05a
npx @iwsdk/cli browser screenshot --input-json '{}' --output-file .scratch/$1.png >/dev/null 2>&1
sips -Z 900 -s format jpeg -s formatOptions 78 .scratch/$1.png --out .scratch/$1.jpg >/dev/null 2>&1
echo shot $1
