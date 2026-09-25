#!/usr/bin/env node

/**
 * LendFlow Automated Migration Runner
 * Executes migrations against the configured Supabase PostgreSQL database.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse .env if present
const envPath = path.resolve(__dirname, '../.env');
const env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        env[key] = val;
      }
    }
  });
}

const PROJECT_REF = 'ijuygzmfyjhfvwvvuyuv';
const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;

async function run() {
  console.log('========================================================');
  console.log('LENDFLOW SUPABASE MIGRATION RUNNER');
  console.log('Project Reference:', PROJECT_REF);
  console.log('========================================================\n');

  // Method 1: Direct PostgreSQL connection via DATABASE_URL if available
  if (dbUrl) {
    console.log('Connecting directly via DATABASE_URL...');
    const { Client } = require('pg');
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log('✓ Successfully connected to Supabase PostgreSQL database.');

      const sqlFile = path.resolve(__dirname, '../supabase/full_schema_setup.sql');
      const sql = fs.readFileSync(sqlFile, 'utf8');

      console.log('Running migration (supabase/full_schema_setup.sql)...');
      await client.query(sql);

      console.log('✓ All tables, RLS policies, functions, and scheduler configured successfully!');
      await client.end();
      process.exit(0);
    } catch (err) {
      console.error('Migration failed:', err.message);
      await client.end();
      process.exit(1);
    }
  }

  // Method 2: Attempt via Supabase CLI
  try {
    console.log('Checking Supabase CLI...');
    execSync('npx supabase --version', { stdio: 'ignore' });
    console.log('Attempting migration via Supabase CLI (npx supabase db push)...');
    execSync(`npx supabase db push`, { stdio: 'inherit' });
    console.log('\n✓ Migrations pushed successfully via Supabase CLI!');
    process.exit(0);
  } catch (cliErr) {
    // If CLI is not linked or needs password
    console.log('\n--------------------------------------------------------');
    console.log('NOTE: To run migrations automatically from the terminal:');
    console.log('1. Add your database password to .env:');
    console.log('   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.ijuygzmfyjhfvwvvuyuv.supabase.co:5432/postgres');
    console.log('   Then rerun: npm run db:migrate');
    console.log('\nOR run via 1-click in Supabase Web SQL Editor:');
    console.log(`   👉 https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
    console.log('   Copy and paste: supabase/full_schema_setup.sql');
    console.log('--------------------------------------------------------\n');
  }
}

run();
