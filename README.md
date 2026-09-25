# LendFlow 💰

A production-ready mobile application for managing private lending, borrower portfolios, and automated interest collection businesses.

Built with **React Native (Expo SDK 57)** and **Supabase (PostgreSQL, Row Level Security, RPC Functions, and pg_cron)**.

---

## 🏛️ Architecture Overview

The system strictly adheres to the serverless mobile-first architecture:

```
┌────────────────────────────────────────────────────────┐
│                   React Native App                     │
│    (TypeScript, Expo Router, TanStack Query, Zustand)  │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct Supabase Client
                           ▼
┌────────────────────────────────────────────────────────┐
│                      Supabase                          │
│  ├── Supabase Auth (Email / Password Sessions)         │
│  ├── PostgreSQL with Row Level Security (RLS)          │
│  ├── Centralized PostgreSQL RPC Functions              │
│  └── pg_cron Daily Autonomous Scheduler                │
└────────────────────────────────────────────────────────┘
```

> **NO custom Node.js, Express, NestJS, Firebase, or intermediate custom API servers.**  
> The database is the authoritative source of truth. Financial calculations, state transitions, and automated generation are executed directly within PostgreSQL.

---

## 🚀 Key Features

1. **Automated Interest Due Generation**:
   - Automated via PostgreSQL `generate_due_interest_records()` and `pg_cron`.
   - Runs daily independently of whether the mobile app is open or closed.
   - Idempotent and transaction safe: uses `UNIQUE(loan_id, due_date)` with `ON CONFLICT DO NOTHING`.
   - Handles accumulated/missed overdue intervals automatically.

2. **Lending Lifecycle**:
   - **Create Loan Wizard**: 5-step form with live real-time financial calculation preview.
   - **Configurable Frequencies**: 15 days, 30 days, 45 days, 50 days, or custom interval days.
   - **Financial Rules**: Uses PostgreSQL `NUMERIC(14,2)` precision. No floating point inaccuracies.
   - **Principal Settlement**: Marking principal as `FULLY_PAID` closes the loan and halts future interest generation.
   - **Loan Reopening**: Accidental closures can be safely reopened, resuming generation from the next scheduled due date without duplicating past dues.

3. **Collections & Payments**:
   - **Mark as Paid**: Sets status to `PAID`, records timestamp and collected amount.
   - **Payment Reversal**: Safely reverts payment back to `UNPAID` without deleting historical due records.

4. **Multi-Tenant & Security**:
   - Multi-tenant architecture (`organizations`, `organization_members`).
   - Strict Row Level Security (RLS) on all tables.
   - Comprehensive tamper-evident `audit_logs` tracking every creation, payment, reversal, closure, and reopening.
   - Privacy-focused: Aadhaar/Govt ID numbers are masked (`XXXX-XXXX-4321`) with only last 4 digits stored.

5. **Offline-First Resilience**:
   - TanStack Query with 24-hour garbage collection caching.
   - Interactive demo mode with the exact Arun Kumar acceptance scenario.

---

## 📁 Database Schema & Migrations

All database definitions are located in `supabase/migrations/`:

| File | Description |
|------|-------------|
| [`001_initial_schema.sql`](file:///Users/sush/Projects/LendFlow/supabase/migrations/001_initial_schema.sql) | Core tables: `organizations`, `organization_members`, `profiles`, `borrowers`, `loans`, `interest_dues`, `audit_logs` |
| [`002_rls.sql`](file:///Users/sush/Projects/LendFlow/supabase/migrations/002_rls.sql) | Row Level Security policies scoping every table to the user's organization |
| [`003_functions.sql`](file:///Users/sush/Projects/LendFlow/supabase/migrations/003_functions.sql) | PostgreSQL RPCs: `calculate_interest_amount`, `generate_due_interest_records`, `mark_interest_paid`, `reverse_interest_payment`, `close_loan`, `reopen_loan`, `get_dashboard_summary` |
| [`004_indexes.sql`](file:///Users/sush/Projects/LendFlow/supabase/migrations/004_indexes.sql) | Performance indexes for high-frequency queries, text search, and the scheduler |
| [`005_scheduler.sql`](file:///Users/sush/Projects/LendFlow/supabase/migrations/005_scheduler.sql) | Autonomous `pg_cron` daily schedule for `generate_due_interest_records(CURRENT_DATE)` |
| [`seed.sql`](file:///Users/sush/Projects/LendFlow/supabase/seed.sql) | Acceptance test seed data (Arun Kumar, Priya Sharma, Rajesh Patel) |

---

## 🧪 Acceptance Scenario Verification

### Acceptance Test Case:
- **Borrower**: Arun Kumar
- **Principal Amount**: ₹10,000
- **Interest Rate**: 5%
- **Frequency**: Every 30 days
- **Loan Start Date**: 25 September 2026
- **First Interest Due Date**: 25 October 2026
- **Expected Monthly Interest**: ₹10,000 × 5 / 100 = ₹500.00

### Running the Test Suite:

1. **JavaScript Acceptance Runner**:
   ```bash
   node scripts/test-acceptance.js
   ```
   *Output:*
   ```
   ========================================================
   LENDFLOW CORE ACCEPTANCE TEST SUITE
   ========================================================
   ✓ TEST 1 PASSED: Arun Kumar ₹10,000 @ 5% = ₹500.00 exact
   ✓ TEST 2 PASSED: 30-day interval from 2026-09-25 = 2026-10-25
   ✓ TEST 3 PASSED: Duplicate prevention (UNIQUE loan_id, due_date) verified
   ✓ TEST 4 PASSED: Mark interest as PAID verified
   ✓ TEST 5 PASSED: Reverse payment restored record to UNPAID without deletion
   ========================================================
   ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!
   ========================================================
   ```

2. **PostgreSQL Database Functional Test**:
   Execute inside Supabase SQL Editor:
   ```sql
   -- Run supabase/tests/database_test.sql
   ```

---

## ⚙️ Setup & Local Development

### Prerequisites:
- Node.js 18+
- Expo CLI (`npx expo`)

### 1. Install Dependencies:
```bash
npm install
```

### 2. Environment Variables:
Copy `.env.example` or create `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
*(If no `.env` is provided, the application runs automatically in offline-capable Demo Mode with acceptance sample data preloaded).*

### 3. Run the App:
```bash
npx expo start
```
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Press `w` for Web

### 4. Typecheck:
```bash
npx tsc --noEmit
```

---

## 📱 Mobile Screens

- **Dashboard**: High-level KPI cards, Today's Dues, Overdue Tracker, Recent Loans, and manual scheduler simulation button.
- **Loans**: Filterable loan cards (Active, Closed, Fully Paid, Due Today) with search by name, phone, city, or ID.
- **Due**: Granular list of scheduled dues with one-tap **Mark as Paid** and **Reverse Payment**.
- **Borrowers**: Directory with quick phone calling, residential details, and loan counts.
- **Create Loan Wizard**: 5-section form with live preview of period interest and next due dates.
- **Loan Details**: Comprehensive financial statement (Principal, Rate, Total Paid, Total Unpaid, Total Generated), Full Settlement, Reopening, and complete Due History.
- **Reports**: Capital yield, collection totals, and borrower-wise breakdown over customizable date ranges.
- **Audit Trail**: Real-time log of state modifications, user IDs, and old/new snapshots.
