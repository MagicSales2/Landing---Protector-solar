-- ============================================================================
--  INTEGRACIÓN PEDIDOS -> SUPABASE + KOMMO
--  Ejecutar UNA sola vez en: Supabase > SQL Editor > New query > Run
--  Es idempotente: puedes ejecutarlo de nuevo sin romper nada.
--  Los IDs de Kommo ya fueron descubiertos leyendo tu cuenta, no hay que
--  buscarlos a mano.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CATÁLOGO DE OFERTAS
--    Fuente única de verdad de precios. El servidor compara contra esta tabla,
--    así que nadie puede pedir un producto con un precio inventado.
-- ---------------------------------------------------------------------------
create table if not exists public.ofertas (
  id               text primary key,
  nombre           text not null,
  cantidad         integer not null check (cantidad between 1 and 10),
  precio           integer not null check (precio > 0),
  mercadopago_url  text not null default '',
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

-- La tabla ya existía sin la columna del enlace de pago; se agrega aquí.
alter table public.ofertas add column if not exists mercadopago_url text not null default '';

insert into public.ofertas (id, nombre, cantidad, precio, mercadopago_url) values
  ('offer-1', '1 UNIDAD', 1, 84900,  'https://link.mercadopago.com.co/anthelios1un'),
  ('offer-2', 'LLEVA 2 UNIDADES (Mejor Oferta)', 2, 149900, 'https://link.mercadopago.com.co/anthelios2un'),
  ('offer-3', 'LLEVA 3 UNIDADES', 3, 209900, 'https://link.mercadopago.com.co/anthelios3un')
on conflict (id) do update
  set nombre = excluded.nombre,
      cantidad = excluded.cantidad,
      precio = excluded.precio,
      mercadopago_url = excluded.mercadopago_url;

-- ---------------------------------------------------------------------------
-- 2) PEDIDOS
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos (
  id             text primary key,
  numero         bigint generated always as identity,
  client_name    text not null check (char_length(trim(client_name)) between 3 and 150),
  client_phone   text not null check (client_phone ~ '^3[0-9]{9}$'),
  client_email   text not null check (client_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$'),
  document_id    text not null check (char_length(trim(document_id)) between 5 and 30),
  department     text not null check (char_length(trim(department)) between 2 and 80),
  city           text not null check (char_length(trim(city)) between 2 and 80),
  address        text not null check (char_length(trim(address)) between 5 and 200),
  address2       text,
  notes          text,
  offer_id       text not null references public.ofertas(id),
  offer_name     text not null,
  quantity       integer not null check (quantity between 1 and 10),
  total_price    integer not null check (total_price > 0),
  payment_method text not null check (payment_method in ('Contra Entrega','Mercado Pago')),
  status         text not null default 'new'
                 check (status in ('new','confirmed','shipped','delivered','cancelled')),
  notas_internas text,
  origen         text not null default 'landing',
  utm_source     text, utm_medium  text, utm_campaign text,
  utm_content    text, utm_term    text, referrer     text, user_agent text,
  kommo_lead_id    integer,
  kommo_contact_id integer,
  kommo_estado     text not null default 'pendiente'
                   check (kommo_estado in ('pendiente','enviado','error')),
  kommo_error      text,
  kommo_enviado_en timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Si la tabla "pedidos" ya existía con menos columnas (versión anterior),
-- se completa aquí. "if not exists" hace que no se rompa nada al reejecutar.
alter table public.pedidos add column if not exists numero            bigint generated always as identity;
alter table public.pedidos add column if not exists notas_internas    text;
alter table public.pedidos add column if not exists origen            text not null default 'landing';
alter table public.pedidos add column if not exists utm_source        text;
alter table public.pedidos add column if not exists utm_medium        text;
alter table public.pedidos add column if not exists utm_campaign      text;
alter table public.pedidos add column if not exists utm_content       text;
alter table public.pedidos add column if not exists utm_term          text;
alter table public.pedidos add column if not exists referrer          text;
alter table public.pedidos add column if not exists user_agent        text;
alter table public.pedidos add column if not exists kommo_lead_id     integer;
alter table public.pedidos add column if not exists kommo_contact_id  integer;
alter table public.pedidos add column if not exists kommo_estado      text not null default 'pendiente';
alter table public.pedidos add column if not exists kommo_error       text;
alter table public.pedidos add column if not exists kommo_enviado_en  timestamptz;
alter table public.pedidos add column if not exists updated_at        timestamptz not null default now();
alter table public.pedidos add column if not exists address2          text;
alter table public.pedidos add column if not exists notes             text;
alter table public.pedidos add column if not exists document_id       text;
alter table public.pedidos add column if not exists client_email      text;
alter table public.pedidos add column if not exists payment_method   text not null default 'Contra Entrega';

-- La versión anterior de la tabla dejaba que CUALQUIER usuario con cuenta de
-- Supabase viera todos los pedidos de los clientes. Eso se elimina aquí.
drop policy if exists "Cualquiera puede crear pedidos"      on public.pedidos;
drop policy if exists "Solo admins pueden ver pedidos"        on public.pedidos;
drop policy if exists "Solo admins pueden actualizar pedidos" on public.pedidos;
drop policy if exists "Solo admins pueden eliminar pedidos"   on public.pedidos;

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_status_idx    on public.pedidos (status);
create index if not exists pedidos_phone_idx     on public.pedidos (client_phone);
create index if not exists pedidos_kommo_idx     on public.pedidos (kommo_estado);

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists pedidos_set_updated_at on public.pedidos;
create trigger pedidos_set_updated_at
  before update on public.pedidos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) ADMINISTRADORES (lista blanca: solo tú ves los pedidos)
-- ---------------------------------------------------------------------------
create table if not exists public.administradores (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists administradores_email_idx
  on public.administradores (lower(email));

-- ---------------------------------------------------------------------------
-- 4) CONFIGURACIÓN DE KOMMO
--    Si algún día cambias algo en Kommo, se corrige aquí con un UPDATE y la
--    función lo toma. No hay que tocar código ni republicar la página.
-- ---------------------------------------------------------------------------
create table if not exists public.kommo_config (
  clave       text primary key,
  valor       text not null default '',
  descripcion text
);

insert into public.kommo_config (clave, valor, descripcion) values
  -- Cuenta
  ('subdominio',          'magiapastelerta4', 'Tu cuenta: https://magiapastelerta4.kommo.com'),
  ('pipeline_id',         '13906888',         'Embudo "Landing Page"'),
  ('responsible_user_id', '9840575',          'Asesor responsable de las ventas entrantes'),
  -- Etapas del embudo Landing Page
  ('status_contraentrega_1', '107313256',   'Etapa "Contraentrega x 1"'),
  ('status_contraentrega_2', '107313320',   'Etapa "Contraentrega x 2"'),
  ('status_contraentrega_3', '112274524',   'Etapa "Contraentrega x 3"'),
  ('status_mercadopago',     '107313264',   'Etapa "Mercado pago"'),
  -- Campos del CONTACTO
  ('cf_contacto_telefono', '543264',        'Campo "Teléfono" del contacto'),
  ('cf_contacto_email',    '543266',        'Campo "Email" del contacto'),
  -- Campos de la VENTA
  ('cf_nombre',     '543550', 'Nombre de quien recibe'),
  ('cf_celular',    '543554', 'Cel de quien recibe'),
  ('cf_documento',  '1430731', 'Documento de identidad'),
  ('cf_direccion',  '543658', 'Dirección'),
  ('cf_direccion2', '629579', 'Dirección 2'),
  ('cf_indicaciones','1430729', 'Conjunto, casa, apto, indicaciones'),
  ('cf_ciudad',     '1430725', 'Ciudad'),
  ('cf_municipio',  '1430727', 'Municipio'),
  ('cf_entrega',    '1430733', 'Direccion de entrega (ciudad, departamento)'),
  ('cf_producto',   '1430743', 'Producto'),
  ('cf_cantidad',   '1430737', 'Cantidad'),
  ('cf_total',      '1430739', 'Total'),
  ('cf_metodo_pago','1406032', 'Medio De Pago'),
  -- Opciones de las listas desplegables
  ('enum_producto_1',      '1027895', 'Opción "Protector 1 unidad"'),
  ('enum_producto_2',      '1027897', 'Opción "Protector 2 unidades"'),
  ('enum_producto_3',      '1031465', 'Opción "Protector 3 unidades"'),
  -- Las opciones 1027923 y 1027927 existían duplicadas/dañadas en Kommo
  -- (1027927 guardaba "PayU"). La lista de "Medio De Pago" se reconstruyó:
  -- ahora usa IDs frescos confirmados el 2026-09-28.
  ('enum_contraentrega',   '1031469', 'Opción "ContraEntrega" (reconstruida)'),
  ('enum_mercadopago',     '1031485', 'Opción "Mercado Pago" (reconstruida)'),
  -- Rastreo de publicidad (campos que Kommo ya trae)
  ('cf_utm_source',   '543278', 'utm_source'),
  ('cf_utm_medium',   '543274', 'utm_medium'),
  ('cf_utm_campaign', '543276', 'utm_campaign'),
  ('cf_utm_content',  '543272', 'utm_content'),
  ('cf_utm_term',     '543280', 'utm_term'),
  ('cf_referrer',     '543284', 'referrer'),
  -- Extra
  ('etiqueta_origen', 'Landing', 'Se agrega al nombre de la venta')
on conflict (clave) do update
  set descripcion = excluded.descripcion,
      -- Solo se rellenan los valores que estén VACÍOS. Si tú cambiaste un ID
      -- a mano, se respeta tu cambio aunque se vuelva a correr este archivo.
      valor = case
                when kommo_config.valor = '' then excluded.valor
                else kommo_config.valor
              end;

-- ---------------------------------------------------------------------------
-- 5) BITÁCORA (para ver qué pedidos entró y cuáles fallaron)
-- ---------------------------------------------------------------------------
create table if not exists public.sync_log (
  id         bigint generated always as identity primary key,
  pedido_id  text references public.pedidos(id) on delete set null,
  destino    text not null default 'kommo',
  estado     text not null check (estado in ('ok','error')),
  detalle    text,
  created_at timestamptz not null default now()
);
create index if not exists sync_log_created_at_idx on public.sync_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 6) SEGURIDAD
--    Los pedidos NO se pueden escribir desde el navegador. La única puerta de
--    entrada es la Función "crear-pedido", que valida antes de guardar.
-- ---------------------------------------------------------------------------
alter table public.pedidos         enable row level security;
alter table public.ofertas         enable row level security;
alter table public.administradores enable row level security;
alter table public.kommo_config    enable row level security;
alter table public.sync_log        enable row level security;

create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = auth.uid() and a.activo
  );
$$;

-- PEDIDOS: solo administradores leen / editan / borran
drop policy if exists "pedidos_select_admin" on public.pedidos;
create policy "pedidos_select_admin" on public.pedidos
  for select to authenticated using (public.es_admin());

drop policy if exists "pedidos_update_admin" on public.pedidos;
create policy "pedidos_update_admin" on public.pedidos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "pedidos_delete_admin" on public.pedidos;
create policy "pedidos_delete_admin" on public.pedidos
  for delete to authenticated using (public.es_admin());

-- OFERTAS: los precios son públicos (se ven en la página), lectura libre
drop policy if exists "ofertas_select_admin"  on public.ofertas;
drop policy if exists "ofertas_select_public" on public.ofertas;
create policy "ofertas_select_public" on public.ofertas
  for select to anon, authenticated using (true);

-- BITÁCORA: solo administradores
drop policy if exists "sync_log_select_admin" on public.sync_log;
create policy "sync_log_select_admin" on public.sync_log
  for select to authenticated using (public.es_admin());

-- Refuerzo: el navegador no escribe directamente en nada, y tampoco ve
-- datos de clientes salvo que sea administrador. Las funciones de la
-- base de datos (supabase_functions) usan el rol service_role, que sí
-- tiene todos los permisos.
revoke all                   on public.pedidos         from anon, authenticated;
revoke all                   on public.administradores from anon, authenticated;
revoke all                   on public.kommo_config    from anon, authenticated;
revoke all                   on public.sync_log        from anon, authenticated;
revoke all                   on public.ofertas         from anon, authenticated;

grant select, update, delete on public.pedidos  to authenticated;
grant select                  on public.ofertas  to anon, authenticated;
grant select                  on public.sync_log to authenticated;

-- ---------------------------------------------------------------------------
-- 7) RESUMEN DIARIO (métricas)
-- ---------------------------------------------------------------------------
drop view if exists public.pedidos_por_dia;
create view public.pedidos_por_dia
with (security_invoker = on) as
select
  (created_at at time zone 'America/Bogota')::date              as dia,
  count(*)                                                     as pedidos,
  count(*) filter (where status <> 'cancelled')               as pedidos_validos,
  coalesce(sum(total_price) filter (where status <> 'cancelled'), 0) as ingresos
from public.pedidos
group by 1
order by 1 desc;

revoke all on public.pedidos_por_dia from anon;
grant select on public.pedidos_por_dia to authenticated;

-- ---------------------------------------------------------------------------
-- 8) REGISTRAR TU CUENTA DE ADMINISTRADOR
--    Orden correcto:
--      1) Primero crea el usuario en Supabase > Authentication > Users > Add user
--         (anota el correo EXACTO con el que lo creaste)
--      2) Después ejecuta este SQL.
--    >>> Si el correo no coincide, la línea de abajo no inserta nada <<<
--    >>> solo cambia 'magiapastelera2@gmail.com' por el tuyo y vuelve a correr <<<
--    >>> Si ya está registrado, esto solo lo deja activo.                <<<
-- ---------------------------------------------------------------------------
insert into public.administradores (user_id, email)
select id, email from auth.users where lower(email) = 'magiapastelera2@gmail.com'
on conflict (user_id) do update set email = excluded.email, activo = true;

-- ---------------------------------------------------------------------------
-- 9) COMPROBACIÓN
--    Esta consulta debe devolver 1 fila con tu correo. Si devuelve 0 filas,
--    es que el usuario de Authentication no existe todavía: créalo y vuelve
--    a correr el paso 8.
-- ---------------------------------------------------------------------------
select user_id, email, activo from public.administradores;

