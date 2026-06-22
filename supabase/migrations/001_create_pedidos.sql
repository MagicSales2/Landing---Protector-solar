-- Tabla principal de pedidos
create table if not exists public.pedidos (
  id text primary key,
  client_name text not null,
  client_phone text not null,
  client_email text default '',
  document_id text default '',
  department text not null,
  city text not null,
  address text not null,
  address2 text default '',
  notes text default '',
  offer_id text not null,
  offer_name text not null,
  total_price numeric not null,
  quantity integer not null default 1,
  status text not null default 'new',
  payment_method text default 'Contra Entrega',
  created_at timestamptz not null default now()
);

-- Índices para búsquedas frecuentes
create index if not exists idx_pedidos_status on public.pedidos(status);
create index if not exists idx_pedidos_created_at on public.pedidos(created_at desc);
create index if not exists idx_pedidos_client_phone on public.pedidos(client_phone);

-- Seguridad: RLS
alter table public.pedidos enable row level security;

-- Política: cualquier persona puede insertar un pedido (público)
create policy "Cualquiera puede crear pedidos"
  on public.pedidos
  for insert
  with check (true);

-- Política: solo usuarios autenticados pueden ver pedidos
create policy "Solo admins pueden ver pedidos"
  on public.pedidos
  for select
  using (auth.role() = 'authenticated');

-- Política: solo usuarios autenticados pueden actualizar pedidos
create policy "Solo admins pueden actualizar pedidos"
  on public.pedidos
  for update
  using (auth.role() = 'authenticated');

-- Política: solo usuarios autenticados pueden eliminar pedidos
create policy "Solo admins pueden eliminar pedidos"
  on public.pedidos
  for delete
  using (auth.role() = 'authenticated');
