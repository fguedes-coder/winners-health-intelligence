-- Fila do coletor SulAmérica (banco do Winners Health Intelligence).
-- O app grava pedidos ('pendente') e lê o estado; o coletor processa com a
-- service role. Padrão RLS do projeto: 4 policies para `authenticated`.

create table if not exists public.coletas_sulamerica (
  id uuid primary key default gen_random_uuid(),
  competencia text not null check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'aguardando', 'pronto', 'importado', 'erro')),
  origem text not null default 'manual' check (origem in ('manual', 'agendado')),
  arquivo_nome text,
  arquivo_path text,
  tamanho integer,
  mensagem text,
  importacao_id uuid references public.importacoes (id) on delete set null,
  tentativas integer not null default 0,
  solicitado_portal_em timestamptz,
  proxima_tentativa_em timestamptz,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz
);

-- No máximo uma busca em andamento por vez (botão e agenda não se atropelam).
create unique index if not exists coletas_sulamerica_uma_em_andamento
  on public.coletas_sulamerica ((true))
  where status in ('pendente', 'executando', 'aguardando');

create index if not exists coletas_sulamerica_competencia
  on public.coletas_sulamerica (competencia, solicitado_em desc);

alter table public.coletas_sulamerica enable row level security;

drop policy if exists coletas_sulamerica_select on public.coletas_sulamerica;
drop policy if exists coletas_sulamerica_insert on public.coletas_sulamerica;
drop policy if exists coletas_sulamerica_update on public.coletas_sulamerica;
drop policy if exists coletas_sulamerica_delete on public.coletas_sulamerica;
create policy coletas_sulamerica_select on public.coletas_sulamerica for select to authenticated using (true);
create policy coletas_sulamerica_insert on public.coletas_sulamerica for insert to authenticated with check (true);
create policy coletas_sulamerica_update on public.coletas_sulamerica for update to authenticated using (true) with check (true);
create policy coletas_sulamerica_delete on public.coletas_sulamerica for delete to authenticated using (true);

revoke all on public.coletas_sulamerica from anon;
grant select, insert, update, delete on public.coletas_sulamerica to authenticated;
grant all on public.coletas_sulamerica to service_role;
