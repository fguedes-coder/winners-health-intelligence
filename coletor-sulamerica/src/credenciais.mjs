// Credenciais dos portais SulAmérica e do e-mail que recebe o token.
//
// O usuário as digita em Configurações → Robôs; ficam
// criptografadas no Supabase Vault. A função credenciais_sulamerica_coletor
// só pode ser executada pela service_role — o app grava, mas não lê de volta.

/**
 * @typedef {{ portal: { login: string, senha: string },
 *             email: { usuario: string, senha: string },
 *             corretor: { login: string, senha: string } | null }} Credenciais
 *   corretor — acesso ao Portal do Corretor, usado só para ler o valor da
 *   fatura. É opcional: sem ele o TXT é baixado normalmente.
 */

const ROTULOS = {
  sulamerica_login: 'login do portal',
  sulamerica_senha: 'senha do portal',
  sulamerica_imap_usuario: 'e-mail que recebe o token',
  sulamerica_imap_senha: 'senha desse e-mail',
}

/** Todos os valores do cofre, por nome. */
async function lerCofre(db) {
  const { data, error } = await db.rpc('credenciais_sulamerica_coletor')
  if (error) throw new Error(`Não foi possível ler o acesso SulAmérica: ${error.message}`)
  return Object.fromEntries((data ?? []).map((l) => [l.nome, l.valor ?? '']))
}

/** Par login/senha completo, ou null se faltar um dos dois. */
function par(valores, login, senha) {
  const l = String(valores[login] ?? '').trim()
  const s = String(valores[senha] ?? '')
  return l !== '' && s !== '' ? { login: l, senha: s } : null
}

/**
 * Acesso do Robô do TXT (Integra + e-mail do token; Portal do Corretor opcional).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<Credenciais>}
 */
export async function carregarCredenciais(db) {
  const valores = await lerCofre(db)

  const faltando = Object.keys(ROTULOS).filter((k) => !String(valores[k] ?? '').trim())
  if (faltando.length > 0) {
    throw new Error(
      `Acesso SulAmérica incompleto (falta: ${faltando.map((k) => ROTULOS[k]).join(', ')}). ` +
        'Preencha em Configurações → Robôs.',
    )
  }

  return {
    portal: { login: valores.sulamerica_login.trim(), senha: valores.sulamerica_senha },
    email: { usuario: valores.sulamerica_imap_usuario.trim(), senha: valores.sulamerica_imap_senha },
    corretor: par(valores, 'corretor_login', 'corretor_senha'),
  }
}

/**
 * Acesso ao Gestão Conectada, independente do Robô do TXT.
 * @returns {Promise<{ login: string, senha: string } | null>}
 */
export async function carregarCredenciaisGC(db) {
  return par(await lerCofre(db), 'gc_login', 'gc_senha')
}

/**
 * Chave da API do Claude — a mesma do "Converse com a Winners" (Configurações
 * → Inteligência artificial). A variável ANTHROPIC_API_KEY tem prioridade.
 * @returns {Promise<string | null>}
 */
export async function carregarChaveClaude(db) {
  const env = String(process.env.ANTHROPIC_API_KEY ?? '').trim()
  if (env) return env
  const { data, error } = await db.rpc('chave_assistente')
  if (error) throw new Error(`Não foi possível ler a chave do Claude: ${error.message}`)
  return String(data ?? '').trim() || null
}
