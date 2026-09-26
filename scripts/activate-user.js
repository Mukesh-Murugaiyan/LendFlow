#!/usr/bin/env node

/**
 * LendFlow User Activation Script
 * 
 * Usage:
 *   npm run active user "user@example.com"
 *   npm run active:user "user@example.com"
 *   npm run activate:user "user@example.com"
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;

if (!dbUrl) {
  console.error('\n❌ Error: DATABASE_URL is not found in .env file.');
  console.error('Please make sure DATABASE_URL is set in .env:');
  console.error('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.ijuygzmfyjhfvwvvuyuv.supabase.co:5432/postgres\n');
  process.exit(1);
}

// Extract target email from command line arguments
// Supports:
//   npm run active user "test@email.com"
//   npm run active:user "test@email.com"
//   npm run active "test@email.com"
const rawArgs = process.argv.slice(2);
const filteredArgs = rawArgs.filter((arg) => {
  const lower = arg.toLowerCase().trim();
  return lower !== 'user' && !lower.startsWith('--');
});

const targetEmail = filteredArgs[0]?.trim();

async function main() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    console.log('========================================================');
    console.log('⚡ LENDFLOW USER ACTIVATION TOOL');
    console.log('========================================================');

    // If no email was provided, list all users and instructions
    if (!targetEmail) {
      console.log('\n⚠️  No email provided!');
      console.log('👉 Usage: npm run active user "user@example.com"');
      console.log('   OR:    npm run active:user "user@example.com"\n');

      console.log('Fetching existing users from database...\n');
      const usersRes = await client.query(`
        SELECT 
          u.id,
          u.email,
          u.email_confirmed_at,
          p.full_name,
          p.default_organization_id,
          om.role as org_role,
          o.name as org_name
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.organization_members om ON om.user_id = u.id
        LEFT JOIN public.organizations o ON o.id = om.organization_id
        ORDER BY u.created_at DESC;
      `);

      if (usersRes.rows.length === 0) {
        console.log('No users found in auth.users.');
      } else {
        console.log('Registered Users:');
        usersRes.rows.forEach((row, i) => {
          const confirmed = row.email_confirmed_at ? '✅ Confirmed' : '❌ Unconfirmed';
          const role = row.org_role ? `[Role: ${row.org_role}]` : '❌ No Org Role';
          const org = row.org_name ? `(Org: ${row.org_name})` : '';
          console.log(`  ${i + 1}. ${row.email} | ${confirmed} | ${role} ${org}`);
        });
      }

      console.log('\n--------------------------------------------------------');
      await client.end();
      process.exit(0);
    }

    console.log(`\n🔍 Searching for user: "${targetEmail}"...`);

    // 1. Find user in auth.users
    const userRes = await client.query(
      `SELECT id, email, raw_user_meta_data, email_confirmed_at 
       FROM auth.users 
       WHERE LOWER(email) = LOWER($1) 
       LIMIT 1;`,
      [targetEmail]
    );

    if (userRes.rows.length === 0) {
      console.error(`\n❌ User "${targetEmail}" was NOT found in Supabase Auth!`);
      console.error('\nPlease first create the user in:');
      console.error('1. Supabase Dashboard -> Authentication -> Users -> Add User');
      console.error('   OR');
      console.error('2. Sign up directly in the LendFlow mobile app.');
      console.error('\nThen run this command again:\n  npm run active user "' + targetEmail + '"\n');
      await client.end();
      process.exit(1);
    }

    const user = userRes.rows[0];
    const userId = user.id;
    const userFullName =
      user.raw_user_meta_data?.full_name ||
      targetEmail.split('@')[0] ||
      'Lender';

    console.log(`✓ Found user ID: ${userId}`);

    // 2. Auto-confirm email so they can log in freely
    await client.query(
      `UPDATE auth.users 
       SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
       WHERE id = $1;`,
      [userId]
    );
    console.log('✓ Email status: Confirmed & Active');

    // 3. Find primary organization to link user to
    // Prefer organization with existing records, or first created org
    let orgRes = await client.query(`
      SELECT o.id, o.name, COUNT(b.id) as borrower_count
      FROM public.organizations o
      LEFT JOIN public.borrowers b ON b.organization_id = o.id
      GROUP BY o.id, o.name
      ORDER BY borrower_count DESC, o.created_at ASC
      LIMIT 1;
    `);

    let targetOrgId;
    let targetOrgName;

    if (orgRes.rows.length > 0) {
      targetOrgId = orgRes.rows[0].id;
      targetOrgName = orgRes.rows[0].name;
    } else {
      // Create new organization if none exists
      const newOrgRes = await client.query(
        `INSERT INTO public.organizations (name, owner_id)
         VALUES ($1, $2)
         RETURNING id, name;`,
        [`${userFullName}'s Lending`, userId]
      );
      targetOrgId = newOrgRes.rows[0].id;
      targetOrgName = newOrgRes.rows[0].name;
      console.log(`✓ Created new organization: "${targetOrgName}"`);
    }

    console.log(`✓ Organization: "${targetOrgName}" (ID: ${targetOrgId})`);

    // 4. Add/Update organization membership with role 'ADMIN'
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'ADMIN')
       ON CONFLICT (organization_id, user_id) 
       DO UPDATE SET role = 'ADMIN';`,
      [targetOrgId, userId]
    );
    console.log('✓ Organization Member Role: ADMIN (Permitted to create Borrowers & Loans)');

    // 5. Create or Update public.profiles
    await client.query(
      `INSERT INTO public.profiles (id, full_name, email, default_organization_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) 
       DO UPDATE SET 
         default_organization_id = EXCLUDED.default_organization_id,
         email = COALESCE(public.profiles.email, EXCLUDED.email),
         updated_at = NOW();`,
      [userId, userFullName, targetEmail, targetOrgId]
    );
    console.log('✓ User Profile: Updated with default organization');

    // 6. Ensure the trigger exists for automatic signups in future
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
          v_org_id UUID;
          v_full_name TEXT;
      BEGIN
          v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Lender');

          -- Find existing org or create one
          SELECT id INTO v_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
          IF v_org_id IS NULL THEN
              INSERT INTO public.organizations (name, owner_id)
              VALUES (v_full_name || '''s Lending', NEW.id)
              RETURNING id INTO v_org_id;
          END IF;

          -- Add membership
          INSERT INTO public.organization_members (organization_id, user_id, role)
          VALUES (v_org_id, NEW.id, 'ADMIN')
          ON CONFLICT (organization_id, user_id) DO NOTHING;

          -- Create profile
          INSERT INTO public.profiles (id, full_name, email, phone, default_organization_id)
          VALUES (NEW.id, v_full_name, NEW.email, NEW.phone, v_org_id)
          ON CONFLICT (id) DO UPDATE SET default_organization_id = v_org_id;

          RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `);
    console.log('✓ Supabase Trigger: on_auth_user_created installed/verified');

    console.log('\n========================================================');
    console.log('🎉 USER ACTIVATED SUCCESSFULLY!');
    console.log('========================================================');
    console.log(`• Email:        ${targetEmail}`);
    console.log(`• User ID:      ${userId}`);
    console.log(`• Org Name:     ${targetOrgName}`);
    console.log(`• Org ID:       ${targetOrgId}`);
    console.log(`• Role:         ADMIN (Full access to create loans & borrowers)`);
    console.log(`• Status:       Ready to login and create borrowers & loans!`);
    console.log('========================================================\n');

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Activation failed:', err.message);
    console.error(err);
    await client.end();
    process.exit(1);
  }
}

main();
