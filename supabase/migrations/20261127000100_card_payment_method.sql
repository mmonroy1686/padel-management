-- POS (a card at the desk) as a payment method. Alone in its migration: Postgres does not let a transaction use an
-- enum value it just added, and the next migration uses it.
alter type public.payment_method add value if not exists 'card';
