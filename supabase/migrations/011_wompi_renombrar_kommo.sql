-- ─────────────────────────────────────────────────────────────
--  Wompi pasa a ser la unica pasarela de pago online.
--
--  Las claves internas de Kommo todavia se llamaban "mercadopago".
--  Se renombran conservando el MISMO id de Kommo, para que las
--  automatizaciones del CRM (que apuntan por id) sigan funcionando.
--
--    status_mercadopago          107313776 -> status_pago_online
--    status_mercadopago_pendiente 107313264 -> status_pago_online_pendiente
--    enum_mercadopago             1031485 -> enum_wompi
--
--  Ademas el CHECK de payment_method ya no necesita 'Mercado Pago':
--  no queda ningun pedido con ese valor.
-- ─────────────────────────────────────────────────────────────

update public.kommo_config set clave = 'status_pago_online'
 where clave = 'status_mercadopago';

update public.kommo_config set clave = 'status_pago_online_pendiente'
 where clave = 'status_mercadopago_pendiente';

update public.kommo_config set clave = 'enum_wompi'
 where clave = 'enum_mercadopago';

alter table public.pedidos drop constraint if exists pedidos_payment_method_check;

alter table public.pedidos
  add constraint pedidos_payment_method_check
  check (payment_method in ('Contra Entrega', 'Wompi'));

-- El link de Wompi ya vive en sus propias columnas; la de MP queda sin uso.
comment on column public.pedidos.mp_preferencia_id is
  'Obsoleto: era el id de la preferencia de Mercado Pago. Ya no se usa; el link de pago esta en wompi_payment_link_id.';
