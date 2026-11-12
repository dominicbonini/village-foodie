#!/bin/sh
# add.sh <agentId> <what…>
S=$(cd "$(dirname "$0")/.." && pwd); id=$1; shift; echo "$id $*" >> $S/run.log
