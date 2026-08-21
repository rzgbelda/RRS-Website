-- RRS-9: tiered affiliate commissions ($1-4500=10%, $4501-9000=15%,
-- $9001+=20% of that month's referred revenue), paid by hand via the
-- CEO's own bank (no bank account info stored here -- see the ticket
-- discussion). This table is the accrual/payout ledger: one row per
-- affiliate per calendar month, computed live until marked paid, at
-- which point the numbers are locked in so a later order edit or refund
-- can't retroactively change what was already paid out.
create table if not exists affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  sub_distributor_id uuid not null references sub_distributors(id) on delete cascade,
  period_month date not null,              -- first day of the month this payout covers
  referred_revenue numeric(10,2) not null,
  commission_rate numeric(5,4) not null,   -- effective rate applied, snapshotted for audit even if tiers change later
  commission_amount numeric(10,2) not null,
  due_date date not null,                  -- 10th of the month following period_month
  status text not null default 'pending',  -- 'pending' | 'paid'
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (sub_distributor_id, period_month)
);

create index if not exists affiliate_payouts_status_idx on affiliate_payouts(status);
