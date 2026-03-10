create extension if not exists "pgcrypto";

create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  motoboy_id uuid references auth.users (id),
  endereco_coleta text not null,
  endereco_entrega text not null,
  detalhes text,
  valor numeric(10, 2),
  empresa_nome text,
  motoboy_nome text,
  status text not null default 'pendente',
  aceita_em timestamptz,
  coletada_em timestamptz,
  entregue_em timestamptz,
  cancelada_em timestamptz
);

alter table public.entregas
  add column if not exists valor numeric(10, 2),
  add column if not exists empresa_nome text,
  add column if not exists motoboy_nome text,
  add column if not exists aceita_em timestamptz,
  add column if not exists coletada_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists cancelada_em timestamptz;

alter table public.entregas
  alter column status set default 'pendente';

update public.entregas
set status = case
  when status in ('DISPONIVEL', 'disponivel') then 'pendente'
  when status in ('ACEITA', 'aceita') then 'aceita'
  when status in ('COLETADA', 'coletada') then 'coletada'
  when status in ('FINALIZADA', 'ENTREGUE', 'finalizada', 'entregue') then 'entregue'
  when status in ('CANCELADA', 'cancelada') then 'cancelada'
  else status
end;

update public.entregas
set aceita_em = coalesce(aceita_em, created_at)
where status in ('aceita', 'coletada', 'entregue');

update public.entregas
set coletada_em = coalesce(coletada_em, aceita_em, created_at)
where status in ('coletada', 'entregue');

update public.entregas
set entregue_em = coalesce(entregue_em, coletada_em, aceita_em, created_at)
where status = 'entregue';

update public.entregas
set cancelada_em = coalesce(cancelada_em, created_at)
where status = 'cancelada';

alter table public.entregas
  drop constraint if exists entregas_status_check;

alter table public.entregas
  add constraint entregas_status_check
  check (status in ('pendente', 'aceita', 'coletada', 'entregue', 'cancelada'));

create or replace function public.entregas_enforce_status_flow()
returns trigger
language plpgsql
as $$
declare
  old_status_normalized text;
begin
  if new.status is not null then
    new.status := lower(new.status);
    if new.status = 'disponivel' then
      new.status := 'pendente';
    elsif new.status = 'finalizada' then
      new.status := 'entregue';
    end if;
  end if;

  if tg_op <> 'INSERT' then
    old_status_normalized := lower(old.status);
    if old_status_normalized = 'disponivel' then
      old_status_normalized := 'pendente';
    elsif old_status_normalized = 'finalizada' then
      old_status_normalized := 'entregue';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'pendente';
    end if;

    if new.status <> 'pendente' then
      raise exception 'Status inicial invalido: %', new.status;
    end if;

    if new.motoboy_id is not null then
      raise exception 'Entrega pendente nao pode ter motoboy definido.';
    end if;

    new.aceita_em := null;
    new.coletada_em := null;
    new.entregue_em := null;
    new.cancelada_em := null;
    return new;
  end if;

  if new.status not in ('pendente', 'aceita', 'coletada', 'entregue', 'cancelada') then
    raise exception 'Status invalido: %', new.status;
  end if;

  if old_status_normalized in ('entregue', 'cancelada') and new.status <> old_status_normalized then
    raise exception 'Entrega em status final nao pode voltar de status.';
  end if;

  if old_status_normalized <> new.status then
    if not (
      (old_status_normalized = 'pendente' and new.status = 'aceita')
      or (old_status_normalized = 'pendente' and new.status = 'cancelada')
      or (old_status_normalized = 'aceita' and new.status = 'coletada')
      or (old_status_normalized = 'coletada' and new.status = 'entregue')
    ) then
      raise exception 'Transicao de status invalida: % -> %', old_status_normalized, new.status;
    end if;
  end if;

  if new.status in ('pendente', 'cancelada') and new.motoboy_id is not null then
    raise exception 'Entrega % nao pode manter motoboy.', new.status;
  end if;

  if old_status_normalized in ('aceita', 'coletada', 'entregue') and new.motoboy_id is distinct from old.motoboy_id then
    raise exception 'Motoboy da entrega nao pode ser alterado apos aceite.';
  end if;

  if old_status_normalized = 'pendente' and new.status = 'aceita' then
    if new.motoboy_id is null then
      raise exception 'Entrega aceita exige motoboy_id.';
    end if;
    new.aceita_em := coalesce(new.aceita_em, now());
  end if;

  if old_status_normalized = 'pendente' and new.status = 'cancelada' then
    new.cancelada_em := coalesce(new.cancelada_em, now());
  end if;

  if old_status_normalized = 'aceita' and new.status = 'coletada' then
    new.coletada_em := coalesce(new.coletada_em, now());
  end if;

  if old_status_normalized = 'coletada' and new.status = 'entregue' then
    new.entregue_em := coalesce(new.entregue_em, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_entregas_enforce_status_flow on public.entregas;
create trigger trg_entregas_enforce_status_flow
before insert or update on public.entregas
for each row
execute function public.entregas_enforce_status_flow();

create unique index if not exists entregas_motoboy_ativa_idx
on public.entregas (motoboy_id)
where motoboy_id is not null
  and status in ('aceita', 'coletada');

alter table public.entregas enable row level security;

drop policy if exists "entregas_select" on public.entregas;
create policy "entregas_select" on public.entregas
for select using (
  created_by = auth.uid()
  or motoboy_id = auth.uid()
  or lower(status) in ('pendente', 'disponivel')
);

drop policy if exists "entregas_insert" on public.entregas;
create policy "entregas_insert" on public.entregas
for insert with check (
  created_by = auth.uid()
);

drop policy if exists "entregas_accept" on public.entregas;
drop policy if exists "entregas_update_empresa_pendente" on public.entregas;
drop policy if exists "entregas_update_motoboy" on public.entregas;

create policy "entregas_update_empresa_pendente" on public.entregas
for update using (
  created_by = auth.uid()
  and lower(status) in ('pendente', 'disponivel')
) with check (
  created_by = auth.uid()
  and lower(status) in ('pendente', 'disponivel', 'cancelada')
  and motoboy_id is null
);

create policy "entregas_update_motoboy" on public.entregas
for update using (
  (lower(status) in ('pendente', 'disponivel') and motoboy_id is null)
  or motoboy_id = auth.uid()
) with check (
  motoboy_id = auth.uid()
  and lower(status) in ('aceita', 'coletada', 'entregue')
);
