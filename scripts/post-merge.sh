#!/bin/bash
# Post-merge setup: runs automatically after a task merges.
# Applies the latest Drizzle schema to the DEVELOPMENT database only.
# Production schema is applied by Replit's Publish flow (dev/prod schema diff
# at publish time) — never add production DDL here or at app startup.
set -e

npm install
npm run db:push -- --force
npx tsx script/ensure-consent-ledger.ts
