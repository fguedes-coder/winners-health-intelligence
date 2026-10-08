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

-- ---------------------------------------------------------------------------
-- Credenciais do portal e do e-mail do token, digitadas pelo usuário em
-- Configurações → Robôs e guardadas CRIPTOGRAFADAS no Supabase
-- Vault. O app grava e consulta só a data de atualização; o valor
-- descriptografado sai apenas para o coletor (service_role).
-- ---------------------------------------------------------------------------

create or replace function public.salvar_credencial_sulamerica(p_nome text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_nome not in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha') then
    raise exception 'credencial desconhecida: %', p_nome;
  end if;
  if coalesce(btrim(p_valor), '') = '' then
    raise exception 'valor vazio para %', p_nome;
  end if;
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then
    perform vault.create_secret(p_valor, p_nome, 'Coletor SulAmérica — Winners Health Intelligence');
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
end;
$$;
revoke all on function public.salvar_credencial_sulamerica(text, text) from public, anon;
grant execute on function public.salvar_credencial_sulamerica(text, text) to authenticated;

-- Para a tela: o que está cadastrado e quando. Valor só dos logins (e-mails),
-- nunca das senhas.
create or replace function public.status_credenciais_sulamerica()
returns table (nome text, atualizado_em timestamptz, valor_visivel text)
language sql
security definer
set search_path = ''
as $$
  select s.name,
         s.updated_at,
         case when s.name in ('sulamerica_login', 'sulamerica_imap_usuario') then d.decrypted_secret end
  from vault.secrets s
  join vault.decrypted_secrets d on d.id = s.id
  where s.name in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha');
$$;
revoke all on function public.status_credenciais_sulamerica() from public, anon;
grant execute on function public.status_credenciais_sulamerica() to authenticated;

-- Para o coletor: valores descriptografados. Só a service_role executa.
create or replace function public.credenciais_sulamerica_coletor()
returns table (nome text, valor text)
language sql
security definer
set search_path = ''
as $$
  select name, decrypted_secret
  from vault.decrypted_secrets
  where name in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha');
$$;
revoke all on function public.credenciais_sulamerica_coletor() from public, anon, authenticated;
grant execute on function public.credenciais_sulamerica_coletor() to service_role;
