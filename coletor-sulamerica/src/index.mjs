// Coletor SulAmérica — laço principal.
//
// Fila: tabela coletas_sulamerica no banco do Health. O botão "Buscar agora"
// da tela de Uploads grava uma linha 'pendente'; a agenda do dia 3 também.
// A cada 30 s o coletor pega a próxima linha e:
//   - arquivo do mês já disponível no portal → baixa e marca 'pronto';
//   - não disponível → faz a Nova Solicitação e marca 'aguardando', voltando
//     a conferir depois de ~70 min (a SulAmérica libera em até 1 h);
//   - falha → marca 'erro' com a mensagem, visível na tela de Uploads.
// O coletor NUNCA importa: processar e confirmar é ação do usuário.

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { ArquivoIndisponivel, ArquivoSolicitado, baixarContasPagas } from './portal.mjs'

const db = createClient(config.supabase.url, config.supabase.chave, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const INTERVALO_MS = 30_000
let ocupado = false

function log(msg) {
  console.log(`[coletor] ${new Date().toISOString()} ${msg}`)
}

/** Data/hora de São Paulo, independente do fuso do servidor. */
function agoraSP() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  )
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) }
}

/** Em outubro busca-se setembro: a competência é sempre a do mês anterior. */
function competenciaMesAnterior() {
  const { ano, mes } = agoraSP()
  const a = mes === 1 ? ano - 1 : ano
  const m = mes === 1 ? 12 : mes - 1
  return `${a}-${String(m).padStart(2, '0')}`
}

/** Agenda: dias 3 a 5, 7h–19h, se o mês anterior ainda não tem arquivo. */
async function agendar() {
  const { dia, hora } = agoraSP()
  if (!config.agenda.dias.includes(dia)) return
  if (hora < config.agenda.horaInicio || hora >= config.agenda.horaFim) return

  const competencia = competenciaMesAnterior()
  const { data: existentes } = await db
    .from('coletas_sulamerica')
    .select('status, concluido_em')
    .eq('competencia', competencia)
  const linhas = existentes ?? []
  if (linhas.some((l) => ['pendente', 'executando', 'aguardando', 'pronto', 'importado'].includes(l.status))) return

  // Depois de um erro, espera 3 h antes de tentar de novo no mesmo dia.
  const ultimoErro = linhas
    .filter((l) => l.status === 'erro' && l.concluido_em)
    .map((l) => new Date(l.concluido_em).getTime())
    .sort((a, b) => b - a)[0]
  if (ultimoErro && Date.now() - ultimoErro < 3 * 3600_000) return

  const { error } = await db
    .from('coletas_sulamerica')
    .insert({ competencia, origem: 'agendado', status: 'pendente' })
  if (!error) log(`busca agendada de ${competencia}`)
}

/** Pega a próxima linha da fila de forma atômica (só um coletor a processa). */
async function proximaDaFila() {
  const agora = new Date().toISOString()
  const { data: candidatas } = await db
    .from('coletas_sulamerica')
    .select('*')
    .or(`status.eq.pendente,and(status.eq.aguardando,proxima_tentativa_em.lte.${agora})`)
    .order('solicitado_em', { ascending: true })
    .limit(1)
  const c = candidatas?.[0]
  if (!c) return null

  const { data: travada } = await db
    .from('coletas_sulamerica')
    .update({ status: 'executando', iniciado_em: agora, tentativas: (c.tentativas ?? 0) + 1 })
    .eq('id', c.id)
    .eq('status', c.status)
    .select('*')
    .maybeSingle()
  return travada ?? null
}

async function processar(coleta) {
  const { competencia } = coleta
  const jaSolicitado = Boolean(coleta.solicitado_portal_em)
  log(`coleta ${coleta.id} · ${competencia} · tentativa ${coleta.tentativas}`)

  try {
    const { nome, conteudo } = await baixarContasPagas({
      competencia,
      podeSolicitar: !jaSolicitado,
      log: (m) => log(`  ${m}`),
    })
    const path = `coletas-sulamerica/${competencia}/${Date.now()}-${nome.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: upErr } = await db.storage
      .from(config.supabase.bucket)
      .upload(path, conteudo, { contentType: 'text/plain', upsert: false })
    if (upErr) throw new Error(`Falha ao guardar o arquivo: ${upErr.message}`)

    await db.from('coletas_sulamerica').update({
      status: 'pronto',
      arquivo_path: path,
      arquivo_nome: nome,
      tamanho: conteudo.length,
      mensagem: null,
      concluido_em: new Date().toISOString(),
      proxima_tentativa_em: null,
    }).eq('id', coleta.id)
    log(`  pronto: ${nome} (${conteudo.length} bytes)`)
  } catch (e) {
    const espera = config.esperaAposSolicitacaoMin * 60_000
    if (e instanceof ArquivoSolicitado) {
      await db.from('coletas_sulamerica').update({
        status: 'aguardando',
        solicitado_portal_em: new Date().toISOString(),
        proxima_tentativa_em: new Date(Date.now() + espera).toISOString(),
        mensagem: e.message,
      }).eq('id', coleta.id)
      log(`  ${e.message} Nova conferência em ${config.esperaAposSolicitacaoMin} min.`)
      return
    }
    if (e instanceof ArquivoIndisponivel && coleta.tentativas <= config.maxVerificacoesAposSolicitacao) {
      await db.from('coletas_sulamerica').update({
        status: 'aguardando',
        proxima_tentativa_em: new Date(Date.now() + espera).toISOString(),
        mensagem: e.message,
      }).eq('id', coleta.id)
      log(`  ${e.message} Nova conferência em ${config.esperaAposSolicitacaoMin} min.`)
      return
    }
    // Mensagem curta e sem segredos: é exibida na tela de Uploads.
    const mensagem = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300)
    await db.from('coletas_sulamerica').update({
      status: 'erro',
      mensagem,
      concluido_em: new Date().toISOString(),
      proxima_tentativa_em: null,
    }).eq('id', coleta.id)
    log(`  erro: ${mensagem}`)
  }
}

/** Coleta que ficou 'executando' porque o coletor reiniciou no meio. */
async function liberarTravadas() {
  const limite = new Date(Date.now() - 20 * 60_000).toISOString()
  await db.from('coletas_sulamerica').update({
    status: 'erro',
    mensagem: 'Busca interrompida (o coletor reiniciou). Tente novamente.',
    concluido_em: new Date().toISOString(),
  }).eq('status', 'executando').lt('iniciado_em', limite)
}

async function ciclo() {
  if (ocupado) return
  ocupado = true
  try {
    await liberarTravadas()
    await agendar()
    const coleta = await proximaDaFila()
    if (coleta) await processar(coleta)
  } catch (e) {
    log(`falha no ciclo: ${String(e?.message ?? e).slice(0, 300)}`)
  } finally {
    ocupado = false
  }
}

log('iniciado')
await ciclo()
const timer = setInterval(ciclo, INTERVALO_MS)
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    log(`encerrando (${sinal})`)
    clearInterval(timer)
    process.exit(0)
  })
}
