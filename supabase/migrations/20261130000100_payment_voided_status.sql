-- Anular cobro (docs/features/ux-v2/design.md, punto 3): a desk payment charged by mistake, taken back the same day.
-- In its own migration: a new enum value cannot be used in the transaction that adds it (20261130000110 uses it).
alter type public.payment_status add value if not exists 'voided';
