-- 012 — Cierre de exposición de configuración y limpieza de Mercado Pago
--
-- HALLAZGO (auditoría 2026-09-30): las tres tablas de configuración tenían
-- RLS DESACTIVADO, así que cualquiera con la llave anónima del proyecto
-- (que va dentro del bundle público de la landing) podía leerlas por
-- PostgREST. En `config_sheets` está el `token` compartido con Google
-- Sheets: con ese valor cualquiera podía llamar a la función
-- `webhook-sheets` y cambiar el estado de cualquier pedido y mover su
-- etapa en Kommo. En `config_envia` quedaban expuestos los datos de origen
-- (dirección y teléfono de la empresa).
--
-- El frontend NO lee estas tablas (solo necesita `ofertas`, que es pública,
-- y `pedidos`, protegida por `es_admin()`), y todas las funciones del
-- servidor usan `service_role`, que ignora las políticas de RLS. Por eso
-- basta con activar RLS sin crear políticas: nadie entra por anon ni por
-- authenticated, y el servidor sigue funcionando igual.

alter table public.config_sheets enable row level security;
alter table public.config_envia  enable row level security;
alter table public.config_wompi  enable row level security;

-- Comprobación: RLS activo y cero políticas en las tres.
-- (select relrowsecurity, count(*) from ... -- debe dar true, 0)

-- Columna obsoleta: la creó la migración 003 para guardar el id de la
-- preferencia de Mercado Pago. Desde la migración 009 el checkout lo hace
-- Wompi (`wompi_payment_link_id`), así que esta columna ya no la escribe
-- ni la lee nadie.
alter table public.pedidos drop column if exists mp_preferencia_id;