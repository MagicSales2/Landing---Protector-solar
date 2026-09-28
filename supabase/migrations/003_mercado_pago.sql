-- ─────────────────────────────────────────────────────────────
--  Mercado Pago: estados de pago
--  Un pedido con pago online queda primero en "pendiente_pago".
--  Solo cuando Mercado Pago confirma el pago pasa a "pagado" y
--  recién ahí se envía la venta a Kommo.
-- ─────────────────────────────────────────────────────────────

alter table public.pedidos drop constraint if exists pedidos_status_check;

alter table public.pedidos
  add constraint pedidos_status_check
  check (status in ('new', 'pendiente_pago', 'pagado', 'confirmed', 'shipped', 'delivered', 'cancelled'));

-- Id de la preferencia (checkout) de Mercado Pago creada para el pedido.
alter table public.pedidos add column if not exists mp_preferencia_id text;