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

-- Valor da fatura do mês lido no Portal do Corretor (11/2026). O coletor
-- grava em faturas só quando o mês está vazio; divergência fica registrada
-- aqui para o usuário decidir.
alter table public.coletas_sulamerica
  add column if not exists fatura_status text
    check (fatura_status in ('gravada', 'conferida', 'divergente', 'sem_acesso', 'erro')),
  add column if not exists fatura_valor numeric(14,2),
  add column if not exists fatura_valor_sistema numeric(14,2),
  add column if not exists fatura_vencimento date,
  add column if not exists fatura_mensagem text;

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
  if p_nome not in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha',
                    'corretor_login', 'corretor_senha', 'gc_login', 'gc_senha') then
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
         case when s.name in ('sulamerica_login', 'sulamerica_imap_usuario', 'corretor_login', 'gc_login') then d.decrypted_secret end
  from vault.secrets s
  join vault.decrypted_secrets d on d.id = s.id
  where s.name in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha',
                   'corretor_login', 'corretor_senha', 'gc_login', 'gc_senha');
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
  where name in ('sulamerica_login', 'sulamerica_senha', 'sulamerica_imap_usuario', 'sulamerica_imap_senha',
                 'corretor_login', 'corretor_senha', 'gc_login', 'gc_senha');
$$;
revoke all on function public.credenciais_sulamerica_coletor() from public, anon, authenticated;
grant execute on function public.credenciais_sulamerica_coletor() to service_role;

-- ---------------------------------------------------------------------------
-- Gestão Conectada (12/11/2026): internações e autorizações lidas no portal
-- sulamerica.my.site.com/gestaoconectada. O portal só mostra 7/30/60 dias;
-- aqui fica o histórico. DADO DE SAÚDE SENSÍVEL (LGPD art. 11): o app só LÊ
-- (select para authenticated); quem grava é o coletor (service_role).
-- ---------------------------------------------------------------------------

create table if not exists public.gc_manifestacoes (
  numero text primary key,
  case_id text not null unique,
  tipo_registro text,
  status_portal text,
  status text,
  numero_guia text,
  abertura_em timestamptz,
  fechamento_em timestamptz,
  motivo_autorizacao text,
  motivo_negativa text,
  prestador_codigo text,
  prestador_nome text,
  beneficiario_nome text,
  -- 17 dígitos no portal; a base do Health usa os 16 primeiros (o 17º é verificador).
  carteirinha_sulamerica text,
  carteirinha text generated always as (left(carteirinha_sulamerica, 16)) stored,
  medico_nome text,
  medico_conselho text,
  medico_uf text,
  medico_numero text,
  data_prevista date,
  carater text,
  regime text,
  tipo_internacao text,
  diarias_solicitadas integer,
  diarias_autorizadas integer,
  acomodacao text,
  data_internacao date,
  data_alta date,
  tempo_internacao integer,
  hipotese_diagnostica text,
  indicacao_clinica text,
  observacao text,
  procedimentos jsonb not null default '[]'::jsonb,
  medicamentos jsonb not null default '[]'::jsonb,
  relacionadas jsonb not null default '[]'::jsonb,
  campos jsonb not null default '{}'::jsonb,
  primeira_coleta_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Fase 2: relatórios do portal em que a manifestação apareceu (acumulado) —
-- é por eles que se sabe que uma internação é psiquiátrica, por exemplo.
alter table public.gc_manifestacoes
  add column if not exists relatorios text[] not null default '{}';

create index if not exists gc_manifestacoes_carteirinha on public.gc_manifestacoes (carteirinha);
create index if not exists gc_manifestacoes_internacao on public.gc_manifestacoes (data_internacao desc);
create index if not exists gc_manifestacoes_abertura on public.gc_manifestacoes (abertura_em desc);

alter table public.gc_manifestacoes enable row level security;
drop policy if exists gc_manifestacoes_select on public.gc_manifestacoes;
create policy gc_manifestacoes_select on public.gc_manifestacoes for select to authenticated using (true);
revoke all on public.gc_manifestacoes from anon, authenticated;
grant select on public.gc_manifestacoes to authenticated;
grant all on public.gc_manifestacoes to service_role;

-- Fila/histórico das atualizações. O botão "Atualizar agora" grava 'pendente'.
create table if not exists public.coletas_gestao_conectada (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'manual' check (origem in ('manual', 'agendado')),
  status text not null default 'pendente' check (status in ('pendente', 'executando', 'ok', 'erro')),
  mensagem text,
  relatorios_lidos integer,
  manifestacoes integer,
  internacoes_abertas integer,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz
);

create unique index if not exists coletas_gestao_conectada_uma_em_andamento
  on public.coletas_gestao_conectada ((true))
  where status in ('pendente', 'executando');

alter table public.coletas_gestao_conectada enable row level security;
drop policy if exists coletas_gestao_conectada_select on public.coletas_gestao_conectada;
drop policy if exists coletas_gestao_conectada_insert on public.coletas_gestao_conectada;
create policy coletas_gestao_conectada_select on public.coletas_gestao_conectada for select to authenticated using (true);
create policy coletas_gestao_conectada_insert on public.coletas_gestao_conectada for insert to authenticated
  with check (status = 'pendente' and origem = 'manual');
revoke all on public.coletas_gestao_conectada from anon, authenticated;
grant select, insert on public.coletas_gestao_conectada to authenticated;
grant all on public.coletas_gestao_conectada to service_role;

-- ---------------------------------------------------------------------------
-- Fase 3 (Gestão Conectada): varredura semanal das fichas de carteirinha
-- ---------------------------------------------------------------------------

-- Tipo da atualização: 'rapida' (a cada 6 h) ou 'varredura' (semanal, de madrugada).
alter table public.coletas_gestao_conectada
  add column if not exists tipo text not null default 'rapida',
  add column if not exists beneficiarios integer;
alter table public.coletas_gestao_conectada drop constraint if exists coletas_gestao_conectada_tipo_check;
alter table public.coletas_gestao_conectada
  add constraint coletas_gestao_conectada_tipo_check check (tipo in ('rapida', 'varredura'));
-- O app só pede a atualização rápida; a varredura é do robô.
drop policy if exists coletas_gestao_conectada_insert on public.coletas_gestao_conectada;
create policy coletas_gestao_conectada_insert on public.coletas_gestao_conectada for insert to authenticated
  with check (status = 'pendente' and origem = 'manual' and tipo = 'rapida');

-- Ficha de cada carteirinha no portal (uma pessoa pode ter várias: plano
-- anterior, dependente que virou titular…). Nunca apagada.
create table if not exists public.gc_beneficiarios (
  beneficiario_id text primary key,          -- a22… (Salesforce)
  conta_id text,                             -- 001… (a pessoa)
  carteirinha_sulamerica text,               -- 17 dígitos
  carteirinha text generated always as (left(carteirinha_sulamerica, 16)) stored,
  nome text,
  vigente text,
  codigo_empresa text,
  nome_empresa text,
  plano text,
  total_manifestacoes text,                  -- como o portal mostra: "3", "6+"
  casos text[] not null default '{}',        -- IDs das manifestações (500…)
  campos jsonb not null default '{}'::jsonb,
  primeira_coleta_em timestamptz not null default now(),
  verificado_em timestamptz not null default now()
);
create index if not exists gc_beneficiarios_carteirinha on public.gc_beneficiarios (carteirinha);
create index if not exists gc_beneficiarios_conta on public.gc_beneficiarios (conta_id);

alter table public.gc_beneficiarios enable row level security;
drop policy if exists gc_beneficiarios_select on public.gc_beneficiarios;
create policy gc_beneficiarios_select on public.gc_beneficiarios for select to authenticated using (true);
revoke all on public.gc_beneficiarios from anon, authenticated;
grant select on public.gc_beneficiarios to authenticated;
grant all on public.gc_beneficiarios to service_role;

-- Quando a manifestação apareceu num relatório do portal pela última vez.
-- Internação sem alta só conta como "internado agora" se foi vista há pouco
-- (ou ainda está dentro das diárias): as antigas que a varredura traz sem
-- alta lançada viram "sem alta registrada".
alter table public.gc_manifestacoes add column if not exists visto_em_relatorio_em timestamptz;
update public.gc_manifestacoes set visto_em_relatorio_em = atualizado_em
  where visto_em_relatorio_em is null and relatorios <> '{}';

-- ---------------------------------------------------------------------------
-- Fase 4 — anexos das manifestações (pedido médico, aviso de internação,
-- relatório médico, laudo, receita, orçamento de OPME…)
--
-- O robô abre o visualizador do portal, baixa cada arquivo SÓ EM MEMÓRIA e o
-- Claude lê o documento (muitos são escaneados ou manuscritos). Guarda-se a
-- leitura (CID, diagnóstico, resumo, transcrição), NUNCA o arquivo. É o dado
-- mais sensível do sistema (LGPD art. 11): só o app interno (Fernando e o
-- médico) lê; não entra em relatório para a empresa, nem no nominal.
-- ---------------------------------------------------------------------------

alter table public.gc_manifestacoes add column if not exists anexos_lidos_em timestamptz;
alter table public.gc_manifestacoes add column if not exists anexos integer;

create table if not exists public.gc_documentos (
  id bigint generated always as identity primary key,
  case_id text not null references public.gc_manifestacoes (case_id) on delete cascade,
  numero text not null,
  -- Nome do arquivo no bucket do portal (ex.: 134226437.pdf).
  arquivo text not null,
  ordem integer,
  descricao text,
  recebido_em timestamptz,
  formato text,
  tamanho integer,
  hash text,
  tipo_documento text,
  data_documento date,
  medico text,
  estabelecimento text,
  cids jsonb not null default '[]'::jsonb,
  diagnostico text,
  quadro_clinico text,
  conduta text,
  leito text,
  carater text,
  diarias_previstas integer,
  procedimentos jsonb not null default '[]'::jsonb,
  materiais jsonb not null default '[]'::jsonb,
  medicamentos jsonb not null default '[]'::jsonb,
  exames jsonb not null default '[]'::jsonb,
  resumo text,
  transcricao text,
  legibilidade text,
  observacoes text,
  -- Leitura não feita (formato não suportado, recusa, erro): fica registrado
  -- para não tentar de novo a cada ciclo.
  erro text,
  modelo text,
  analisado_em timestamptz not null default now(),
  unique (case_id, arquivo)
);
create index if not exists gc_documentos_numero on public.gc_documentos (numero);
create index if not exists gc_documentos_hash on public.gc_documentos (hash);

alter table public.gc_documentos enable row level security;
drop policy if exists gc_documentos_select on public.gc_documentos;
create policy gc_documentos_select on public.gc_documentos for select to authenticated using (true);
revoke all on public.gc_documentos from anon, authenticated;
grant select on public.gc_documentos to authenticated;
grant all on public.gc_documentos to service_role;

-- O robô usa a mesma chave do Claude do "Converse com a Winners"
-- (supabase/assistente.sql), lida pela service_role.
grant execute on function public.chave_assistente() to service_role;
