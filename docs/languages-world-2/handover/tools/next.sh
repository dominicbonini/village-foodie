#!/bin/sh
# pops the next "locale part" line from queue.txt and prints it with the language name
S=$(cd "$(dirname "$0")/.." && pwd); L=$(head -1 $S/queue.txt); tail -n +2 $S/queue.txt > $S/queue.tmp && mv $S/queue.tmp $S/queue.txt
loc=${L% *}; name=$(node -e "const l=require('$S/langs.json').find(x=>x[0]==='$loc');console.log(l?l[1]:'')"); echo "$L | $name"
