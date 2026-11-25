#!/bin/bash
cd "$(dirname "$0")" || exit 1
python3 server.py &
sleep 1
open "http://127.0.0.1:3000"
wait
