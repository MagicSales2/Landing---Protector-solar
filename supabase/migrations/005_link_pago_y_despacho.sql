-- ─────────────────────────────────────────────────────────────
--  Bot de WhatsApp al cliente (via Kommo)
--  Dos configuraciones nuevas:
--    1) cf_link_pago: campo de Kommo donde se guarda el link único
--       de pago de Mercado Pago para cada venta (id 543662).
--    2) status_despachado: etapa a la que se mueve el lead cuando el
--       pedido pasa a "shipped" en el panel. Dispara el mensaje de
--       WhatsApp con la guía (disparador D3 de Kommo). Usa la etapa
--       "Enviado" (107313780) que ya existe en el pipeline Landing.
-- ─────────────────────────────────────────────────────────────

insert into public.kommo_config (clave, valor) values
  ('cf_link_pago', '543662'),
  ('status_despachado', '107313780')
on conflict (clave) do update set valor = excluded.valor;