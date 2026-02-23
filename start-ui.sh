#!/bin/bash
# Kill any leftover process on port 7777 before starting
fuser -k 7777/tcp 2>/dev/null || true
sleep 2
cd /home/vibe/hourglass/ui
exec /home/vibe/hourglass/node_modules/.bin/next start --port 7777
