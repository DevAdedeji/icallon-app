#!/usr/bin/env bash
set -euo pipefail

if command -v postgres >/dev/null 2>&1; then
  postgres_bin="$(dirname "$(command -v postgres)")"
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/postgres ]]; then
  postgres_bin="/opt/homebrew/opt/postgresql@17/bin"
else
  echo "PostgreSQL 17+ is required to run the database integration test." >&2
  exit 1
fi

test_root="$(mktemp -d /private/tmp/icallon-sql.XXXXXX)"
test_port="${ICALLON_TEST_DB_PORT:-55432}"

cleanup() {
  "${postgres_bin}/pg_ctl" -D "${test_root}" stop >/dev/null 2>&1 || true
  case "${test_root}" in
    /private/tmp/icallon-sql.*) rm -rf -- "${test_root}" ;;
  esac
}
trap cleanup EXIT

"${postgres_bin}/initdb" -D "${test_root}" --no-locale --encoding=UTF8 >/dev/null
"${postgres_bin}/pg_ctl" -D "${test_root}" -l "${test_root}/postgres.log" \
  -o "-p ${test_port} -k ${test_root}" start >/dev/null
"${postgres_bin}/createdb" -h "${test_root}" -p "${test_port}" icallon_sql_test
"${postgres_bin}/psql" -h "${test_root}" -p "${test_port}" -d icallon_sql_test \
  -v ON_ERROR_STOP=1 \
  -f database/tests/schema.sql \
  -f supabase_game_policies.sql \
  -f supabase_mobile_setup.sql \
  -f database/tests/game-flow.sql

# Validate that applying the mobile setup again is safe after game data exists.
"${postgres_bin}/psql" -h "${test_root}" -p "${test_port}" -d icallon_sql_test \
  -v ON_ERROR_STOP=1 -f supabase_mobile_setup.sql >/dev/null

echo "Database migration and integration checks passed."
