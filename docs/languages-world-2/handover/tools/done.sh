#!/bin/sh
# done.sh <agentId> "<native note>" — mark finished, print next queue item ("-" as 3rd arg = don't pop)
S=$(cd "$(dirname "$0")/.." && pwd)
P=$(grep "^$1 " $S/run.log | head -1 | cut -d' ' -f2-); echo "done $1" >> $S/run.log
[ -n "$2" ] && echo "- $P: $2" >> $S/NATIVE.md
[ "$3" = "-" ] || $S/tools/next.sh
