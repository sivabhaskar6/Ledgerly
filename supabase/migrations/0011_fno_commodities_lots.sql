-- Migration 0011: F&O Commodities & Lots Support
-- Adds segment, lots, and lot_size columns to public.fno_trades
-- Safe & non-destructive: only adds optional columns with sensible defaults.

alter table public.fno_trades
  add column if not exists segment text default 'equity' check (segment in ('equity', 'commodity')),
  add column if not exists lots integer check (lots is null or lots > 0),
  add column if not exists lot_size integer check (lot_size is null or lot_size > 0);

create index if not exists fno_trades_segment_idx on public.fno_trades (user_id, segment);
