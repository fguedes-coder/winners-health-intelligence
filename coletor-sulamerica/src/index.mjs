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
import { carregarCredenciais, carregarCredenciaisGC } from './credenciais.mjs'
import { buscarValorFatura } from './portal-corretor.mjs'
import { associarFatura } from './fatura.mjs'
import { coletarGestaoConectada, varrerBeneficiarios } from './gestao-conectada.mjs'
import {
  casosParaPular,
  estadoVarredura,
  gravarCarteirinha,
  gravarManifestacoes,
  gravarOrigens,
  manifestacoesARevisitar,
} from './manifestacoes-gc.mjs'

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
    // Lidas a cada execução: se o usuário trocar uma senha na tela, a próxima
    // busca já usa a nova, sem reiniciar o coletor.
    const credenciais = await carregarCredenciais(db)
    const { nome, conteudo } = await baixarContasPagas({
      competencia,
      podeSolicitar: !jaSolicitado,
      log: (m) => log(`  ${m}`),
      credenciais,
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

    // Valor da fatura do mês, no Portal do Corretor. Falhar aqui NÃO desfaz
    // o TXT: o arquivo continua pronto e a fatura é lançada à mão.
    await coletarFatura(coleta, credenciais)
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

/**
 * Lê o valor da fatura da competência no Portal do Corretor e o associa no
 * Health (ver fatura.mjs: grava se o mês está vazio, nunca sobrescreve).
 */
async function coletarFatura(coleta, credenciais) {
  const { competencia } = coleta
  const registrar = (campos) =>
    db.from('coletas_sulamerica').update(campos).eq('id', coleta.id).then(({ error }) => {
      if (error) log(`  não consegui registrar a fatura: ${error.message}`)
    })

  if (!credenciais.corretor) {
    await registrar({
      fatura_status: 'sem_acesso',
      fatura_mensagem: 'Acesso ao Portal do Corretor não cadastrado em Configurações → Robôs.',
    })
    log('  fatura: sem acesso ao Portal do Corretor cadastrado')
    return
  }

  try {
    const { valor, vencimento } = await buscarValorFatura({
      competencia,
      log: (m) => log(`  ${m}`),
      credenciais: credenciais.corretor,
    })
    const { status, valorSistema } = await associarFatura(db, { competencia, valor })
    await registrar({
      fatura_status: status,
      fatura_valor: valor,
      fatura_valor_sistema: valorSistema,
      fatura_vencimento: vencimento,
      fatura_mensagem: null,
    })
    log(`  fatura ${status}: R$ ${valor.toFixed(2)}${valorSistema != null ? ` (sistema: R$ ${valorSistema.toFixed(2)})` : ''}`)
  } catch (e) {
    const mensagem = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300)
    await registrar({ fatura_status: 'erro', fatura_mensagem: mensagem })
    log(`  fatura: erro: ${mensagem}`)
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

// ---------------------------------------------------------------------------
// Gestão Conectada — internações e autorizações (fila coletas_gestao_conectada)
//   tipo 'rapida' ..... a cada `intervaloHoras`, das 6h às 22h: relatórios +
//                       internações sem alta
//   tipo 'varredura' .. de madrugada, a cada `intervaloDias`: ficha de cada
//                       carteirinha e todo o histórico de manifestações
// ---------------------------------------------------------------------------

/** Há atualização pendente ou rodando (qualquer tipo)? */
async function gcEmAndamento() {
  const { data } = await db
    .from('coletas_gestao_conectada')
    .select('id')
    .in('status', ['pendente', 'executando'])
    .limit(1)
  return Boolean(data?.length)
}

async function agendarGC() {
  const { hora } = agoraSP()
  const gc = config.gestaoConectada
  if (await gcEmAndamento()) return
  if (!(await carregarCredenciaisGC(db))) return

  // Varredura de madrugada.
  const v = gc.varredura
  if (hora >= v.horaInicio && hora < v.horaFim) {
    const [{ data: ultimaOk }, { data: ultimaTentativa }] = await Promise.all([
      // Completa = 'ok' sem mensagem (a parcial grava aviso).
      db.from('coletas_gestao_conectada').select('concluido_em').eq('tipo', 'varredura').eq('status', 'ok').is('mensagem', null)
        .order('concluido_em', { ascending: false }).limit(1),
      db.from('coletas_gestao_conectada').select('solicitado_em').eq('tipo', 'varredura')
        .order('solicitado_em', { ascending: false }).limit(1),
    ])
    const okHa = ultimaOk?.[0] ? Date.now() - new Date(ultimaOk[0].concluido_em).getTime() : Infinity
    const tentouHa = ultimaTentativa?.[0] ? Date.now() - new Date(ultimaTentativa[0].solicitado_em).getTime() : Infinity
    // Completa há mais de N dias e nenhuma tentativa nesta madrugada.
    if (okHa > v.intervaloDias * 86_400_000 && tentouHa > 12 * 3600_000) {
      const { error } = await db.from('coletas_gestao_conectada').insert({ origem: 'agendado', status: 'pendente', tipo: 'varredura' })
      if (!error) log('varredura do Gestão Conectada agendada')
    }
    return
  }

  if (hora < gc.horaInicio || hora >= gc.horaFim) return
  const { data: ultimas } = await db
    .from('coletas_gestao_conectada')
    .select('status, solicitado_em, concluido_em')
    .eq('tipo', 'rapida')
    .order('solicitado_em', { ascending: false })
    .limit(1)
  const u = ultimas?.[0]
  if (u) {
    const desde = Date.now() - new Date(u.concluido_em ?? u.solicitado_em).getTime()
    const espera = u.status === 'erro' ? 3 * 3600_000 : gc.intervaloHoras * 3600_000
    if (desde < espera) return
  }
  const { error } = await db.from('coletas_gestao_conectada').insert({ origem: 'agendado', status: 'pendente', tipo: 'rapida' })
  if (!error) log('atualização do Gestão Conectada agendada')
}

async function processarGC() {
  const agora = new Date().toISOString()
  const { data: pend } = await db
    .from('coletas_gestao_conectada')
    .select('id')
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: true })
    .limit(1)
  const p = pend?.[0]
  if (!p) return
  const { data: coleta } = await db
    .from('coletas_gestao_conectada')
    .update({ status: 'executando', iniciado_em: agora })
    .eq('id', p.id)
    .eq('status', 'pendente')
    .select('id, tipo')
    .maybeSingle()
  if (!coleta) return

  log(`Gestão Conectada · ${coleta.tipo} ${coleta.id}`)
  try {
    const credenciais = await carregarCredenciaisGC(db)
    if (!credenciais) throw new Error('Acesso ao Gestão Conectada não cadastrado em Configurações → Robôs.')
    const fim = coleta.tipo === 'varredura' ? await executarVarredura(credenciais) : await executarRapida(credenciais)
    await db.from('coletas_gestao_conectada').update({
      status: 'ok',
      mensagem: fim.mensagem ?? null,
      relatorios_lidos: fim.relatorios ?? null,
      manifestacoes: fim.manifestacoes,
      internacoes_abertas: fim.internacoesAbertas ?? null,
      beneficiarios: fim.beneficiarios ?? null,
      concluido_em: new Date().toISOString(),
    }).eq('id', coleta.id)
    log(`  Gestão Conectada ok: ${fim.resumo}`)
  } catch (e) {
    const mensagem = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300)
    await db.from('coletas_gestao_conectada').update({
      status: 'erro',
      mensagem,
      concluido_em: new Date().toISOString(),
    }).eq('id', coleta.id)
    log(`  Gestão Conectada erro: ${mensagem}`)
  }
}

async function executarRapida(credenciais) {
  const [revisitar, pular] = await Promise.all([manifestacoesARevisitar(db), casosParaPular(db)])
  const { manifestacoes, origens, relatorios } = await coletarGestaoConectada({
    credenciais,
    log: (m) => log(`  ${m}`),
    revisitar,
    pular,
  })
  const { gravadas, internacoesAbertas } = await gravarManifestacoes(db, manifestacoes)
  await gravarOrigens(db, origens)
  return {
    relatorios,
    manifestacoes: gravadas,
    internacoesAbertas,
    resumo: `${gravadas} manifestação(ões) lidas, ${origens.length} já atualizadas, ${internacoesAbertas} internação(ões) sem alta`,
  }
}

async function executarVarredura(credenciais) {
  const v = config.gestaoConectada.varredura
  const estado = await estadoVarredura(db, v.revisitarDias)
  let gravadas = 0
  const r = await varrerBeneficiarios({
    credenciais,
    log: (m) => log(`  ${m}`),
    ...estado,
    prazo: Date.now() + v.maxMinutos * 60_000,
    aoLerCarteirinha: (c) => gravarCarteirinha(db, c),
    aoLerManifestacoes: async (ms) => {
      gravadas += (await gravarManifestacoes(db, ms)).gravadas
    },
  })
  const resumo = `${r.contasLidas}/${r.contas} conta(s), ${r.carteirinhas} carteirinha(s) do contrato (${r.foraDoContrato} de outros contratos ignoradas), ${gravadas} manifestação(ões) nova(s)`
  // Parou pelo prazo: fica 'ok' com aviso e a próxima madrugada continua de
  // onde parou (carteirinhas conferidas são puladas).
  if (!r.completa) {
    return { manifestacoes: gravadas, beneficiarios: r.carteirinhas, mensagem: `Varredura parcial (continua na próxima madrugada): ${resumo}.`, resumo, parcial: true }
  }
  return { manifestacoes: gravadas, beneficiarios: r.carteirinhas, resumo }
}

async function liberarTravadasGC() {
  const agora = Date.now()
  const limites = { rapida: 60, varredura: config.gestaoConectada.varredura.maxMinutos + 45 }
  for (const [tipo, minutos] of Object.entries(limites)) {
    await db.from('coletas_gestao_conectada').update({
      status: 'erro',
      mensagem: 'Atualização interrompida (o coletor reiniciou). Tente novamente.',
      concluido_em: new Date().toISOString(),
    }).eq('status', 'executando').eq('tipo', tipo).lt('iniciado_em', new Date(agora - minutos * 60_000).toISOString())
  }
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
  }
  // Gestão Conectada é independente: uma falha num não trava o outro.
  try {
    await liberarTravadasGC()
    await agendarGC()
    await processarGC()
  } catch (e) {
    log(`falha no ciclo do Gestão Conectada: ${String(e?.message ?? e).slice(0, 300)}`)
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
