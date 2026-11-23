#!/usr/bin/env bash
# Post-deploy smoke test: health endpoints through nginx + security headers.
# Read-only (GET/HEAD only), safe against production.
#
#   infrastructure/deployment/smoke-test.sh https://islambadran.com
#   infrastructure/deployment/smoke-test.sh http://127.0.0.1:8080
set -euo pipefail

BASE="${1:?usage: smoke-test.sh <base-url>}"
BASE="${BASE%/}"
fail=0

check_status() { # path expected
  local code
  # body discarded via tail (portable: no -o /dev/null, which breaks native Windows curl)
  code=$(curl -sS -w '\n%{http_code}' --max-time 10 "$BASE$1" | tail -n 1) || code=000
  if [[ "$code" == "$2" ]]; then echo "ok   $1 -> $code"; else echo "FAIL $1 -> $code (expected $2)"; fail=1; fi
}

check_header() { # path header-regex
  if curl -sS -I --max-time 10 "$BASE$1" | tr -d '\r' | grep -qiE "$2"; then
    echo "ok   $1 has /$2/"
  else
    echo "FAIL $1 missing /$2/"; fail=1
  fi
}

check_status /api/health 200
check_status /api/health/ready 200
check_status / 200
check_status /admin/ 200
check_status /this-page-does-not-exist 404
check_status /.env 404

if ! curl -sS --max-time 10 "$BASE/api/health" | grep -q '"status":"ok"'; then
  echo "FAIL /api/health body"; fail=1
fi

for p in / /admin/ /api/health; do
  check_header "$p" '^x-content-type-options: nosniff'
  check_header "$p" '^x-frame-options: DENY'
  check_header "$p" '^referrer-policy: strict-origin-when-cross-origin'
  check_header "$p" '^cross-origin-opener-policy: same-origin'
  check_header "$p" '^permissions-policy: '
done
check_header / "^content-security-policy: default-src 'self'; script-src 'self' 'sha256-"
check_header / "frame-ancestors 'none'"
check_header /admin/ "^content-security-policy: default-src 'none'; script-src 'self'; style-src 'self';"
check_header /admin/ '^cache-control: no-store'
check_header / '^cache-control: no-cache'
check_header /fonts/anton.woff2 '^cache-control: public, max-age=31536000, immutable'
if curl -sS -I --max-time 10 "$BASE/" | tr -d '\r' | grep -qiE '^server: nginx/[0-9]'; then
  echo "FAIL server version disclosed"; fail=1
fi
if [[ "$BASE" == https://* ]]; then
  check_header / '^strict-transport-security: max-age='
fi

if [[ $fail -ne 0 ]]; then echo "SMOKE TEST FAILED"; exit 1; fi
echo "SMOKE TEST PASSED"
