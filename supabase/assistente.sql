-- Chave da API do Claude do "Converse com a Winners", cadastrada em
-- Configurações → Inteligência artificial e guardada CRIPTOGRAFADA no
-- Supabase Vault (secret 'assistente_anthropic_key').
--
-- O app não tem service_role: a rota /api/converse lê a chave pela função
-- chave_assistente(), executável por usuário autenticado. Aceito porque só
-- a equipe da Winners entra no sistema; ponha limite de gasto no console da
-- Anthropic. A variável de ambiente ANTHROPIC_API_KEY, se existir, tem
-- prioridade sobre o cofre.

create or replace function public.salvar_chave_assistente(p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v text := btrim(coalesce(p_valor, ''));
begin
  if v !~ '^sk-ant-[A-Za-z0-9_-]{20,}$' then
    raise exception 'chave inválida: deve começar com sk-ant-';
  end if;
  select id into v_id from vault.secrets where name = 'assistente_anthropic_key';
  if v_id is null then
    perform vault.create_secret(v, 'assistente_anthropic_key', 'Converse com a Winners — API do Claude');
  else
    perform vault.update_secret(v_id, v);
  end if;
end;
$$;
revoke all on function public.salvar_chave_assistente(text) from public, anon;
grant execute on function public.salvar_chave_assistente(text) to authenticated;

-- Para a tela: se está cadastrada, quando e os 4 últimos caracteres.
create or replace function public.status_chave_assistente()
returns table (atualizado_em timestamptz, final text)
language sql
security definer
set search_path = ''
as $$
  select s.updated_at, right(d.decrypted_secret, 4)
  from vault.secrets s
  join vault.decrypted_secrets d on d.id = s.id
  where s.name = 'assistente_anthropic_key';
$$;
revoke all on function public.status_chave_assistente() from public, anon;
grant execute on function public.status_chave_assistente() to authenticated;

-- Para a rota do chat (servidor).
create or replace function public.chave_assistente()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'assistente_anthropic_key';
$$;
revoke all on function public.chave_assistente() from public, anon;
grant execute on function public.chave_assistente() to authenticated;
