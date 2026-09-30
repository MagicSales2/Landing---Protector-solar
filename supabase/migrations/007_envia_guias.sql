-- ─────────────────────────────────────────────────────────────
--  Guías de envío con Envia.com
--  Se crea la guía para Contra Entrega (al llegar el pedido) y
--  para Mercado Pago (cuando se aprueba el pago), se elige la
--  transportadora más económica y se guarda el enlace de
--  seguimiento en el campo de Kommo "link guia envio".
--  Configuración de origen/empaque en la tabla config_envia.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.config_envia (
  clave text primary key,
  valor text not null
);

insert into public.config_envia (clave, valor) values
  ('activo', 'true'),
  ('origen_nombre', 'Magia'),
  ('origen_direccion', 'Calle 44 # 92-39'),
  ('origen_barrio', 'Torre San Juan Danubio Apto 2102'),
  ('origen_ciudad', 'Medellin'),
  ('origen_estado', 'AN'),
  ('origen_pais', 'CO'),
  ('origen_telefono', '3019525378'),
  ('origen_email', ''),
  ('peso_por_unidad', '0.3'),
  ('largo_cm', '12'),
  ('ancho_cm', '5'),
  ('alto_cm', '2'),
  ('transportadoras', '["coordinadora","serviEntrega","tcc","interRapidisimo"]')
on conflict (clave) do update set valor = excluded.valor;

-- Datos de la guía dentro del pedido.
alter table public.pedidos add column if not exists guia_numero text;
alter table public.pedidos add column if not exists guia_link text;
alter table public.pedidos add column if not exists guia_label text;
alter table public.pedidos add column if not exists guia_carrier text;
alter table public.pedidos add column if not exists guia_costo numeric;
alter table public.pedidos add column if not exists guia_estado text;
alter table public.pedidos add column if not exists guia_creado_en timestamptz;
alter table public.pedidos add column if not exists guia_error text;

-- Campo de Kommo que guarda el link de seguimiento de la guía.
insert into public.kommo_config (clave, valor) values
  ('cf_link_guia', '1432777')
on conflict (clave) do update set valor = excluded.valor;