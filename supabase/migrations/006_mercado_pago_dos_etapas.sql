-- ─────────────────────────────────────────────────────────────
--  Mercado Pago: dos etapas en lugar de un solo estado
--  Etapas renombradas por el usuario en Kommo:
--    107313264 "Mercado pago - Pendiente pago"  (entra aquí el lead)
--    107313776 "Mercado pago"                   (llega aqui al pagar)
--  El lead entra a la etapa pendiente y confirmar-pago lo mueve
--  a "Mercado pago" cuando Mercado Pago valida el pago.
-- ─────────────────────────────────────────────────────────────

insert into public.kommo_config (clave, valor) values
  ('status_mercadopago', '107313776'),
  ('status_mercadopago_pendiente', '107313264')
on conflict (clave) do update set valor = excluded.valor;