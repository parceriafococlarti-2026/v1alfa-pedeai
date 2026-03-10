alter table public.entregas
  add column if not exists valor numeric(10, 2);
