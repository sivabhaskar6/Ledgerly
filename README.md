# Ledgerly

Personal expense and finance tracker: Next.js (App Router) + TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth + RLS), Recharts, SheetJS, and Papa Parse.

## Status

| Stage | Scope | State |
|---|---|---|
| 1 | Schema + RLS, auth (sign up, log in, log out, reset), protected routes, responsive layout | Built |
| 2 | Expense add/view/edit/soft-delete, filters, search, sort, pagination, Recently deleted, categories | Built |
| 3 | CSV/Excel statement import with duplicate review, column mapping, idempotency | Built |
| 4 | Monthly trends, daily spending chart, MoM comparisons, category distribution, CSV/Excel reports export | Built |
| 5 | Accounts, opening balances, inter-account transfers, stock/IPO investments, capital movements, net worth | Built |
| 6 | Vercel deployment hardening & strict type/lint verification | Built |

## Setup

1. `npm install`
2. Create a project at [supabase.com](https://supabase.com). Authentication → Providers: keep Email enabled.
3. Authentication → URL Configuration: set **Site URL** to your app URL and add `<site-url>/auth/callback` to **Redirect URLs** (both `http://localhost:3000` and your deployment URL).
4. Apply migrations in order via the Supabase SQL editor or Supabase CLI (`supabase db push`):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_category_totals.sql`
   - `supabase/migrations/0003_income.sql`
   - `supabase/migrations/0004_accounts_investments_imports.sql`
5. Configure `.env.local` with your project URL and publishable/anon key. Never put the service-role key in `.env.local`.
6. `npm run dev` → http://localhost:3000

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Create optimized production build
- `npm run start` - Start production server
- `npm run lint` - Run Next.js and ESLint code checks
- `npm run typecheck` - Run TypeScript compiler checks (`tsc --noEmit`)
- `npm test` - Run Vitest unit test suite

## Design & Financial Correctness Notes

- **Paise Precision**: All monetary values are strictly stored as integer paise (`amount_paise bigint`, 1 INR = 100 paise) and parsed/formatted via string manipulation to avoid floating-point errors.
- **Capital Separation**:
  - Everyday expenses (`transactions`) are strictly separated from investments (`investments`) and capital transfers (`transfers`).
  - Transfers between accounts do not alter income or expenses.
  - Stock purchases and IPO applications are assets/escrow movements, not expenses.
  - IPO refunds are returns of blocked capital, not income.
  - Realized gains from exits and unrealized gains from active holdings are calculated independently without double-counting.
  - Holdings without configured market prices display as "Unconfigured" rather than displaying invented or simulated prices.
- **Statement Import**: Supports CSV and Excel (`.xlsx`), with flexible date/amount normalization, auto-detection of columns, bank reference number matching, and normalized fingerprint deduplication. Repeat imports are idempotent.
- **Row Level Security**: Every user table (`profiles`, `accounts`, `categories`, `transactions`, `income`, `transfers`, `investments`, `import_batches`) enforces strict PostgreSQL Row Level Security isolating all records by `user_id = auth.uid()`.
