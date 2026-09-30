-- ─────────────────────────────────────────────────────────────
--  Google Sheets como espejo editable de la base de datos.
--  - config_sheets: activo / url del web app de Apps Script / token.
--  - La hoja recibe cada pedido (copia exacta) y, si se edita el
--    estado a mano, la hoja avisa a webhook-sheets y esto mueve la
--    etapa en Kommo y actualiza la base.
--  Estado (hoja) -> etapa en Kommo:
--    impreso        -> no se mueve nada en Kommo (solo DB = confirmed)
--    enviado        -> etapa "Enviado" (status_despachado / DB shipped)
--    entregado      -> "Logrado" (142 / DB delivered)
--    espera de pago -> "Espera de pago" (status_espera_pago / DB pendiente_pago)
--    cancelado      -> "Ventas Perdidos" (143 / DB cancelled) + cancela guía
-- ─────────────────────────────────────────────────────────────

create table if not exists public.config_sheets (
  clave text primary key,
  valor text not null
);

insert into public.config_sheets (clave, valor) values
  ('activo', 'false'),
  ('webhook_url', ''),
  ('token', 'be1f6036b9724acb9497a5110f4b1d6f')
on conflict (clave) do update set valor = excluded.valor;

-- Etapas de Kommo relacionadas con estados que la hoja puede disparar.
insert into public.kommo_config (clave, valor) values
  ('status_espera_pago', '107313784'),
  ('status_entregado', '142'),
  ('status_cancelado', '143')
on conflict (clave) do update set valor = excluded.valor;