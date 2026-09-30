-- ─────────────────────────────────────────────────────────────
--  Wompi es ahora la pasarela de pago online.
--  La tabla tenía un CHECK que solo aceptaba 'Mercado Pago'.
-- ─────────────────────────────────────────────────────────────

alter table public.pedidos drop constraint if exists pedidos_payment_method_check;

alter table public.pedidos
  add constraint pedidos_payment_method_check
  check (payment_method in ('Contra Entrega', 'Wompi', 'Mercado Pago'));
