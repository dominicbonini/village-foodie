#!/bin/sh
S=$(cd "$(dirname "$0")/.." && pwd); grep -v "^done " $S/run.log | while read id p; do grep -q "^done $id" $S/run.log || echo "$id $p"; done
