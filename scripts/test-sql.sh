#!/usr/bin/env bash
# Runs supabase/tests against a throw-away PostgreSQL database.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash scripts/test-sql.sh
#
# The script creates (and drops) its own database, so it is safe to point at any local server. It never
# touches a real Supabase project: the bootstrap file only stubs the auth schema for the test database.
set -euo pipefail

BASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="quiz_schema_test_$$"
ADMIN="$BASE_URL"
TARGET="${BASE_URL%/*}/$DB"

psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "create database $DB" >/dev/null
trap 'psql "$ADMIN" -qc "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

psql "$TARGET" -v ON_ERROR_STOP=1 -q -f supabase/tests/bootstrap.sql
echo "== applying supabase/quiz_schema.sql (twice: it must be idempotent)"
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f supabase/quiz_schema.sql
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f supabase/quiz_schema.sql
echo "== running behavioural tests"
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f supabase/tests/quiz_schema.test.sql 2>&1 | tee /tmp/sql-test.out
grep -q "ALL SQL TESTS PASSED" /tmp/sql-test.out
