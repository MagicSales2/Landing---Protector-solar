-- Wompi: almacenar link de pago y datos de transacción
alter table public.pedidos
  add column if not exists wompi_payment_link_id text,
  add column if not exists wompi_transaction_id text,
  add column if not exists wompi_status text;

create index if not exists pedidos_wompi_payment_link_id_idx
  on public.pedidos (wompi_payment_link_id);

-- Config opcional para activar/desactivar Wompi
create table if not exists public.config_wompi (
  clave text primary key,
  valor text not null default ''
);

insert into public.config_wompi (clave, valor)
values ('activo', 'true')
on conflict (clave) do nothing;
