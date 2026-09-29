-- ============================================================================
--  004: tráfico de la página
--  Cada vez que alguien entra al sitio (o se va), la función registrar-visita
--  guarda una fila acá. Con estos datos el reporte diario de Telegram calcula
--  visitas, visitantes únicos, cuántos repiten, el tiempo en el sitio, de dónde
--  vienen (utm/referrer), etc.
-- ============================================================================

create table if not exists public.visitas (
  id bigint generated always as identity primary key,
  visitante_id text not null,
  inicio timestamptz not null default now(),
  duracion_seg integer,
  ruta text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists visitas_inicio_idx on public.visitas (inicio);
create index if not exists visitas_visitante_idx on public.visitas (visitante_id);

alter table public.visitas enable row level security;