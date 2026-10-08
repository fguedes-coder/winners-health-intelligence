// Credenciais do portal SulAmérica e do e-mail que recebe o token.
//
// O usuário as digita em Configurações → Robôs; ficam
// criptografadas no Supabase Vault. A função credenciais_sulamerica_coletor
// só pode ser executada pela service_role — o app grava, mas não lê de volta.

/**
 * @typedef {{ portal: { login: string, senha: string },
 *             email: { usuario: string, senha: string } }} Credenciais
 */

const ROTULOS = {
  sulamerica_login: 'login do portal',
  sulamerica_senha: 'senha do portal',
  sulamerica_imap_usuario: 'e-mail que recebe o token',
  sulamerica_imap_senha: 'senha desse e-mail',
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<Credenciais>}
 */
export async function carregarCredenciais(db) {
  const { data, error } = await db.rpc('credenciais_sulamerica_coletor')
  if (error) throw new Error(`Não foi possível ler o acesso SulAmérica: ${error.message}`)

  const valores = Object.fromEntries((data ?? []).map((l) => [l.nome, l.valor ?? '']))
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
  }
}
