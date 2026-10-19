# Rekik Coffee — Web Ordering & Café Management Platform

A modern, production-grade digital ordering and management platform for **Rekik Coffee**, celebrating authentic Ethiopian coffee heritage with seamless customer ordering, cashier payment verification, kitchen management, and floor server coordination.

---

## Features

- **Branded Experience**: Authentic Ethiopian Roastery aesthetic featuring Rekik Coffee palette (espresso, gold, cream) with responsive desktop and mobile support.
- **Dynamic Floor Waiter Selection**: Dine-in orders dynamically retrieve active and available servers from the database.
- **Delivery Engine**: Haversine distance calculations and server-authoritative delivery fee pricing with map location picker.
- **Payment Verification Workflow**:
  - Customers submit payment proof (receipt screenshot and/or transaction reference for Telebirr / CBE Birr).
  - Screenshots stored in private Supabase Storage buckets.
  - Authorized Cashiers and Reception staff review, approve, or reject payment proofs in real-time.
  - Approved payments automatically advance orders to the assigned waiter and notify the customer.
  - Rejected payments allow customer receipt correction without creating a duplicate order.
- **Staff & Admin Management Console**: Role-based access control (Admin, Cashier, Waiter) for order tracking, payment verification, product catalog, promotions, and store settings.

---

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) / [TanStack Router](https://tanstack.com/router)
- **UI Library**: React 19, Tailwind CSS, Lucide Icons, Radix UI
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL, Supabase Auth, Storage)
- **Build Tool**: Vite & Nitro (Vercel serverless deployment target)

---

## Getting Started

### 1. Prerequisites

- **Node.js**: v20 or higher
- **npm**: v10 or higher

### 2. Installation

Clone or open the project and install dependencies:

```bash
npm install
```

### 3. Environment Variables Configuration

Copy the sample environment file to create your local `.env`:

```bash
cp .env.example .env
```

Populate the required credentials in `.env`:

```env
# Browser-safe Supabase configuration (Public)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Server-side API configuration (Server runtime only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Optional server-only secret (Never expose to client or prefix with VITE_)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Security Note:** Never commit `.env` or files containing service-role keys. Ensure `.env` is listed in your `.gitignore`.

### 4. Database Setup & Migrations

The database uses PostgreSQL managed via Supabase. To apply schema and Row-Level Security (RLS) policies:

1. Open your Supabase Dashboard SQL Editor.
2. Execute the migration scripts in sequence from `supabase/migrations/`:
   - `20260918155900_add_customer_role_enum.sql`
   - `20260918160000_customer_authentication.sql`
   - `20260918173000_create_order_number_sequence.sql`
   - `20260918180000_fix_auth_user_created_trigger.sql`
   - `20260918191500_order_status_and_logs_rls.sql`
   - `20260918193000_confirm_admin_and_staff.sql`
   - `20260918194500_clone_staff_and_customer_b.sql`
   - `20260918200000_contact_messages_rls.sql`
   - `20260919120000_distance_based_delivery.sql`
3. Apply Row-Level Security policies from `supabase/policies.sql`.
4. Ensure the private Storage bucket `payment-proofs` exists in Supabase Storage with restricted access policies.

### 5. Running Locally

Start the local development server:

```bash
npm run dev
```

The application will start with hot module reloading at `http://localhost:8080/` (or the port configured in your environment).

---

## Scripts & Validation

- `npm run dev` — Starts the development server.
- `npm run build` — Compiles production bundle and Nitro serverless output.
- `npm test` — Executes distance calculation, pricing, and server verification tests.
- `npm run lint` — Runs ESLint code style and syntax checks.
- `npx tsc --noEmit` — Type-checks all TypeScript files across the codebase.

---

## License

Private & Proprietary — Rekik Coffee. All rights reserved.
