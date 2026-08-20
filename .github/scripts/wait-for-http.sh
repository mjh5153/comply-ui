#!/usr/bin/env bash
#
# Waits for an HTTP endpoint to respond. Usage: wait-for-http.sh URL [SECONDS]
#
# Deliberately treats ANY HTTP status as "listening" and reports what it got,
# rather than folding a 500 and a connection refusal into the same silent
# failure - which is exactly what the first version of this check did.
set -uo pipefail

URL="$1"
DEADLINE="${2:-60}"

echo "waiting up to ${DEADLINE}s for ${URL}"

for i in $(seq 1 "$DEADLINE"); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$URL" 2>/dev/null || echo "000")
  if [ "$code" != "000" ]; then
    echo "responded after ${i}s with HTTP ${code}"
    [ "$code" -ge 200 ] && [ "$code" -lt 400 ] && exit 0
    echo "reachable but returned HTTP ${code}"
    exit 1
  fi
  sleep 1
done

echo "no response from ${URL} within ${DEADLINE}s"
echo "--- listening sockets ---"
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null || true)
echo "--- verbose attempt ---"
curl -v --max-time 5 "$URL" 2>&1 | tail -20 || true
exit 1
