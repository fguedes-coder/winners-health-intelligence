import 'server-only'

// Ferramentas do "Converse com a Winners": consultas prontas sobre o banco do
// Health que o modelo pode chamar. Cada uma devolve JSON enxuto (o modelo
// só vê o que está aqui) e reaproveita as mesmas funções das telas e do
// relatório — a resposta do chat bate com o que o sistema mostra.

import { tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  getAutorizacoesGC,
  getHistoricoGC,
  getInternacoesGC,
  hojeSP,
  documentosPorNumero,
  situacaoAutorizacao,
  type DocumentoGC,
  type InternacaoGC,
} from '@/lib/gestao-conectada'
import { getDashboardData, getEventosDetalhados, type EventoDetalhado } from '@/lib/queries'

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const contem = (texto: string | null | undefined, termos: string[]) => {
  if (!texto) return false
  const t = semAcento(texto)
  return termos.some((x) => t.includes(x))
}

const reais = (v: number) => Math.round(v * 100) / 100

/** Anexos lidos (relatório médico, laudo…) sem a transcrição — ver documentos_medicos. */
const relatorioMedico = (docs: DocumentoGC[]) =>
  docs.length
    ? docs.map((d) => ({
        tipo: d.tipoDocumento,
        data: d.dataDocumento,
        cids: d.cids,
        diagnostico: d.diagnostico,
        resumo: d.resumo,
        conduta: d.conduta,
        leito: d.leito,
        diariasPrevistas: d.diariasPrevistas,
        medicamentos: d.medicamentos.length ? d.medicamentos : undefined,
        exames: d.exames.length ? d.exames : undefined,
        erro: d.erro ?? undefined,
      }))
    : null

const textoDosDocumentos = (docs: DocumentoGC[]) =>
  docs.map((d) => [d.cids.map((c) => `${c.codigo} ${c.descricao ?? ''}`).join(' '), d.diagnostico, d.resumo, d.transcricao].join(' ')).join(' ')

const motivo = (i: {
  indicacaoClinica: string | null
  hipoteseDiagnostica?: string | null
  procedimentos: Record<string, string>[]
  documentos: DocumentoGC[]
}) => {
  const procs = i.procedimentos.map((p) => p['Descrição'] ?? p['Descricao'] ?? '').filter(Boolean)
  return {
    hipotese: i.hipoteseDiagnostica ?? null,
    indicacao: i.indicacaoClinica,
    procedimentos: procs.slice(0, 6),
    relatorioMedico: relatorioMedico(i.documentos),
  }
}

function resumoInternacao(i: InternacaoGC) {
  return {
    manifestacao: i.numero,
    beneficiario: i.beneficiarioNome,
    carteirinha: i.carteirinha,
    perfil: { tipo: i.tipoBeneficiario, idade: i.idade, empresa: i.empresa, plano: i.plano },
    situacao: i.situacao,
    hospital: i.prestador,
    medico: i.medico,
    carater: i.carater,
    tipo: i.tipoInternacao,
    acomodacao: i.acomodacao,
    dataInternacao: i.dataInternacao,
    dataAlta: i.dataAlta,
    dias: i.dias,
    diariasAutorizadas: i.diariasAutorizadas,
    custoPago: i.custoPago,
    competenciasPagamento: i.competenciasPagamento,
    reinternacao: i.reinternacao,
    saudeMental: i.saudeMental,
    motivo: motivo(i),
  }
}

async function ultimaColeta() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('coletas_gestao_conectada')
    .select('id, tipo, status, mensagem, solicitado_em, concluido_em')
    .order('solicitado_em', { ascending: false })
    .limit(5)
  return (data ?? []) as {
    id: string
    tipo: string
    status: string
    mensagem: string | null
    solicitado_em: string
    concluido_em: string | null
  }[]
}

export const ferramentas = {
  status_dados: tool({
    description:
      'Quando os dados foram atualizados: última leitura do portal SulAmérica Gestão Conectada (internações/autorizações em tempo real) e últimas competências do arquivo de contas pagas (TXT). Use antes de responder perguntas sobre "hoje"/"agora".',
    inputSchema: z.object({}),
    execute: async () => {
      const supabase = await createClient()
      const [coletas, { data: comps }] = await Promise.all([
        ultimaColeta(),
        supabase.from('eventos_utilizacao').select('competencia').order('competencia', { ascending: false }).limit(1),
      ])
      const ok = coletas.find((c) => c.status === 'ok')
      return {
        agoraSaoPaulo: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        gestaoConectada: {
          ultimaLeituraOk: ok?.concluido_em ?? null,
          horasDesdeUltimaLeitura: ok?.concluido_em
            ? Math.round(((Date.now() - Date.parse(ok.concluido_em)) / 3_600_000) * 10) / 10
            : null,
          emAndamento: coletas.some((c) => c.status === 'pendente' || c.status === 'executando'),
          ultimas: coletas.map((c) => ({ tipo: c.tipo, status: c.status, quando: c.concluido_em ?? c.solicitado_em, mensagem: c.mensagem })),
          rotina: 'atualiza sozinho a cada 6 h (6h–22h); varredura semanal do histórico de madrugada',
        },
        contasPagasTXT: { ultimaCompetencia: (comps?.[0] as { competencia: string } | undefined)?.competencia ?? null },
      }
    },
  }),

  atualizar_gestao_conectada: tool({
    description:
      'Pede ao robô uma leitura nova do portal Gestão Conectada e ESPERA terminar (3 a 8 minutos). Use quando a pergunta for sobre a situação atual e a última leitura tiver mais de 2 horas, ou quando o usuário pedir.',
    inputSchema: z.object({}),
    execute: async () => {
      const supabase = await createClient()
      const inicio = Date.now()
      const { error } = await supabase.from('coletas_gestao_conectada').insert({ origem: 'manual', status: 'pendente' })
      // 23505 = já existe uma na fila/rodando: só espera por ela.
      if (error && error.code !== '23505') return { ok: false, erro: error.message }
      const limite = inicio + 9 * 60_000
      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 10_000))
        const [u] = await ultimaColeta()
        if (u && (u.status === 'ok' || u.status === 'erro') && Date.parse(u.concluido_em ?? u.solicitado_em) >= inicio - 60_000) {
          return { ok: u.status === 'ok', status: u.status, mensagem: u.mensagem, concluidoEm: u.concluido_em, minutos: Math.round((Date.now() - inicio) / 6000) / 10 }
        }
      }
      return { ok: false, erro: 'A atualização ainda não terminou depois de 9 minutos; os dados atuais são da leitura anterior.' }
    },
  }),

  internados_agora: tool({
    description:
      'Quem está internado neste momento (internação confirmada pelo hospital e sem alta), com hospital, dias internado, caráter, motivo (indicação clínica e procedimentos), perfil e plano.',
    inputSchema: z.object({}),
    execute: async () => {
      const { disponivel, internacoes, ultimaColeta: u, hoje } = await getInternacoesGC()
      if (!disponivel) return { disponivel: false }
      const agora = internacoes.filter((i) => i.situacao === 'internado')
      const andamento = internacoes.filter((i) => i.situacao === 'aguardando' || i.situacao === 'em_analise')
      return {
        hoje,
        ultimaLeitura: u?.quando ?? null,
        internados: agora.map(resumoInternacao),
        solicitacoesEmAndamento: andamento.map(resumoInternacao),
      }
    },
  }),

  internacoes_periodo: tool({
    description:
      'Internações do Gestão Conectada com DATA DE INTERNAÇÃO no período (dados desde 16/07/2026; a varredura semanal traz histórico anterior). Inclui alta, dias, hospital, motivo, custo pago ligado ao TXT, reinternação e saúde mental. Negadas e canceladas vêm separadas.',
    inputSchema: z.object({
      inicio: z.string().describe('AAAA-MM-DD'),
      fim: z.string().describe('AAAA-MM-DD'),
    }),
    execute: async ({ inicio, fim }) => {
      const { disponivel, internacoes } = await getInternacoesGC()
      if (!disponivel) return { disponivel: false }
      const doPeriodo = internacoes.filter((i) => i.dataInternacao && i.dataInternacao >= inicio && i.dataInternacao <= fim)
      const validas = doPeriodo.filter((i) => i.situacao !== 'negada' && i.situacao !== 'cancelada')
      const altas = validas.filter((i) => i.dataAlta && i.dias != null)
      return {
        periodo: { inicio, fim },
        total: validas.length,
        pessoas: new Set(validas.map((i) => i.carteirinha)).size,
        urgencia: validas.filter((i) => /urg|emerg/i.test(i.carater ?? '')).length,
        permanenciaMedia: altas.length ? Math.round((altas.reduce((s, i) => s + (i.dias ?? 0), 0) / altas.length) * 10) / 10 : null,
        reinternacoes: validas.filter((i) => i.reinternacao).length,
        custoPagoIdentificado: reais(validas.reduce((s, i) => s + (i.custoPago ?? 0), 0)),
        internacoes: validas.map(resumoInternacao),
        negadasOuCanceladas: doPeriodo.filter((i) => !validas.includes(i)).map((i) => ({ manifestacao: i.numero, beneficiario: i.beneficiarioNome, situacao: i.situacao, data: i.dataInternacao })),
      }
    },
  }),

  autorizacoes: tool({
    description:
      'Pedidos de autorização fora internação (exames SP/SADT, prorrogações, OPME, quimio/radio, terapias) abertos no período, com beneficiário, situação (autorizada/negada/cancelada/em análise), prestador, procedimentos ou material. Histórico de ~1 ano.',
    inputSchema: z.object({
      inicio: z.string().describe('AAAA-MM-DD'),
      fim: z.string().describe('AAAA-MM-DD'),
      tipo: z.string().optional().describe('filtra por tipo, ex.: "SP/SADT", "OPME", "Prorrogação"'),
    }),
    execute: async ({ inicio, fim, tipo }) => {
      const todas = await getAutorizacoesGC(inicio)
      const diaSP = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '')
      const lista = todas
        .filter((a) => {
          const d = diaSP(a.aberturaEm)
          return d >= inicio && d <= fim && (!tipo || contem(a.tipoRegistro, [semAcento(tipo)]))
        })
        .slice(0, 150)
      return {
        periodo: { inicio, fim },
        total: lista.length,
        porTipo: Object.entries(
          lista.reduce<Record<string, number>>((m, a) => ((m[a.tipoRegistro ?? '—'] = (m[a.tipoRegistro ?? '—'] ?? 0) + 1), m), {}),
        ),
        autorizacoes: lista.map((a) => ({
          manifestacao: a.numero,
          beneficiario: a.beneficiarioNome,
          carteirinha: a.carteirinha,
          perfil: { tipo: a.tipoBeneficiario, empresa: a.empresa, plano: a.plano },
          tipo: a.tipoRegistro,
          situacao: situacaoAutorizacao(a.statusPortal),
          motivoNegativa: a.motivoNegativa,
          abertura: diaSP(a.aberturaEm),
          prestador: a.prestador,
          medico: a.medico,
          procedimentos: a.procedimentos.map((p) => p['Descrição'] ?? p['Descricao'] ?? '').filter(Boolean).slice(0, 6),
          material: a.material,
          indicacao: a.indicacaoClinica,
          relatorioMedico: relatorioMedico(a.documentos),
          saudeMental: a.saudeMental,
        })),
      }
    },
  }),

  buscar_procedimento: tool({
    description:
      'Procura um procedimento, exame, especialidade ou tema (ex.: cirurgia cardíaca, ressonância, parto, oncologia, coluna, psiquiatria) nos DOIS bancos: portal Gestão Conectada (procedimentos, material OPME, indicação clínica) e contas pagas do TXT (descrição do serviço). Passe vários termos-chave em MAIÚSCULAS sem acento, incluindo sinônimos e nomes técnicos (ex.: para coração: REVASCULARIZ, SAFENA, ANGIOPLASTIA CORON, STENT, VALV, MARCAPASSO, CATETERISMO, CARDIOLOGIA).',
    inputSchema: z.object({
      termos: z.array(z.string()).min(1).max(20),
      desde: z.string().optional().describe('AAAA-MM-DD; padrão: 2 anos atrás'),
    }),
    execute: async ({ termos, desde }) => {
      const t = termos.map(semAcento).filter((x) => x.length >= 3)
      const inicio = desde ?? new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10)
      const [{ internacoes }, autorizacoes, eventos] = await Promise.all([
        getInternacoesGC(),
        getAutorizacoesGC(inicio),
        getEventosDetalhados(),
      ])
      const gcInt = internacoes
        .filter((i) =>
          contem([i.indicacaoClinica, i.hipoteseDiagnostica, ...i.procedimentos.map((p) => Object.values(p).join(' ')), textoDosDocumentos(i.documentos)].join(' '), t),
        )
        .map((i) => ({ ...resumoInternacao(i), fonte: 'Gestão Conectada (internação)' }))
      const gcAut = autorizacoes
        .filter((a) =>
          contem([a.indicacaoClinica, a.material, ...a.procedimentos.map((p) => Object.values(p).join(' ')), textoDosDocumentos(a.documentos)].join(' '), t),
        )
        .map((a) => ({
          fonte: 'Gestão Conectada (autorização)',
          beneficiario: a.beneficiarioNome,
          carteirinha: a.carteirinha,
          tipo: a.tipoRegistro,
          situacao: situacaoAutorizacao(a.statusPortal),
          abertura: a.aberturaEm?.slice(0, 10),
          prestador: a.prestador,
          procedimentos: a.procedimentos.map((p) => p['Descrição'] ?? '').filter(Boolean).slice(0, 4),
          material: a.material,
          relatorioMedico: relatorioMedico(a.documentos),
        }))
      // TXT: agrupa por pessoa e serviço.
      const txt = new Map<string, { beneficiario: string; carteirinha: string; servicos: Set<string>; lancamentos: number; valor: number; de: string; ate: string; internacao: boolean }>()
      for (const e of eventos as EventoDetalhado[]) {
        if ((e.dataAtendimento ?? e.competencia ?? '') < inicio.slice(0, 7)) continue
        if (!contem(`${e.servico ?? ''} ${e.servicoPrincipal ?? ''}`, t)) continue
        const g = txt.get(e.beneficiario) ?? { beneficiario: e.nome ?? e.beneficiario, carteirinha: e.beneficiario, servicos: new Set<string>(), lancamentos: 0, valor: 0, de: e.dataAtendimento ?? '', ate: e.dataAtendimento ?? '', internacao: false }
        g.servicos.add(e.servicoPrincipal ?? e.servico ?? '')
        g.lancamentos++
        g.valor += e.valorPago
        if (e.dataAtendimento && (!g.de || e.dataAtendimento < g.de)) g.de = e.dataAtendimento
        if (e.dataAtendimento && e.dataAtendimento > g.ate) g.ate = e.dataAtendimento
        g.internacao ||= e.internacao
        txt.set(e.beneficiario, g)
      }
      return {
        termos: t,
        desde: inicio,
        portalInternacoes: gcInt.slice(0, 40),
        portalAutorizacoes: gcAut.slice(0, 60),
        contasPagasTXT: [...txt.values()]
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 60)
          .map((g) => ({ ...g, servicos: [...g.servicos].slice(0, 8), valor: reais(g.valor), fonte: 'TXT contas pagas' })),
        observacao:
          'No portal, a busca cobre procedimentos, indicação clínica e os anexos lidos (CID, diagnóstico, transcrição do relatório médico). No TXT, só o nome do serviço.',
      }
    },
  }),

  historico_pessoa: tool({
    description:
      'Tudo sobre UMA pessoa: linha do tempo no Gestão Conectada (internações, exames, prorrogações, OPME) e utilização paga no TXT por mês (valor, principais serviços, prestadores). Busque por parte do nome ou pela carteirinha.',
    inputSchema: z.object({ busca: z.string().min(3).describe('parte do nome ou carteirinha') }),
    execute: async ({ busca }) => {
      const eventos = await getEventosDetalhados()
      const b = semAcento(busca.trim())
      const digitos = busca.replace(/\D/g, '')
      const supabase = await createClient()
      const { data: gcNomes } = await supabase
        .from('gc_manifestacoes')
        .select('carteirinha, beneficiario_nome')
        .ilike('beneficiario_nome', `%${busca.trim()}%`)
        .limit(50)
      const candidatos = new Map<string, string>()
      for (const e of eventos) {
        if ((digitos.length >= 8 && e.beneficiario.includes(digitos)) || (e.nome && semAcento(e.nome).includes(b))) {
          candidatos.set(e.beneficiario, e.nome ?? e.beneficiario)
        }
      }
      for (const g of (gcNomes ?? []) as { carteirinha: string | null; beneficiario_nome: string | null }[]) {
        if (g.carteirinha) candidatos.set(g.carteirinha, g.beneficiario_nome ?? g.carteirinha)
      }
      if (candidatos.size === 0) return { encontrado: false }
      if (candidatos.size > 5) {
        return { encontrado: false, maisDeUmaPessoa: [...candidatos].slice(0, 15).map(([c, n]) => ({ carteirinha: c, nome: n })) }
      }
      const pessoas = []
      for (const [cart, nome] of candidatos) {
        const [{ ficha, eventos: linha }] = await Promise.all([getHistoricoGC(cart)])
        const meus = eventos.filter((e) => e.beneficiario === cart)
        const porMes = new Map<string, { valor: number; eventos: number; servicos: Map<string, number>; prestadores: Set<string>; internacao: boolean }>()
        for (const e of meus) {
          const m = e.competencia ?? '—'
          const g = porMes.get(m) ?? { valor: 0, eventos: 0, servicos: new Map(), prestadores: new Set<string>(), internacao: false }
          g.valor += e.valorPago
          g.eventos++
          const s = e.servicoPrincipal ?? e.servico ?? '—'
          g.servicos.set(s, (g.servicos.get(s) ?? 0) + e.valorPago)
          if (e.prestadorNome) g.prestadores.add(e.prestadorNome)
          g.internacao ||= e.internacao
          porMes.set(m, g)
        }
        const e0 = meus[0]
        pessoas.push({
          nome,
          carteirinha: cart,
          perfil: e0 ? { tipo: e0.tipoBeneficiario, idade: e0.idade, sexo: e0.sexo, plano: e0.plano, filial: e0.subCodigo } : null,
          fichaPortal: ficha,
          gestaoConectada: linha.slice(0, 60).map(({ documentos, ...e }) => ({ ...e, relatorioMedico: relatorioMedico(documentos) })),
          contasPagasPorCompetencia: [...porMes.entries()]
            .sort(([a], [b2]) => a.localeCompare(b2))
            .map(([competencia, g]) => ({
              competencia,
              valor: reais(g.valor),
              lancamentos: g.eventos,
              internacao: g.internacao,
              principaisServicos: [...g.servicos.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([s, v]) => `${s} (R$ ${reais(v)})`),
              prestadores: [...g.prestadores].slice(0, 5),
            })),
          totalPagoTXT: reais(meus.reduce((s, e) => s + e.valorPago, 0)),
        })
      }
      return { encontrado: true, pessoas }
    },
  }),

  documentos_medicos: tool({
    description:
      'Documentos anexados a uma manifestação no portal (aviso/solicitação de internação, relatório médico, pedido médico, laudo, receita, orçamento de OPME), lidos por IA: CID, diagnóstico, quadro clínico, conduta, medicamentos, exames e a TRANSCRIÇÃO completa. Use para ir a fundo num caso (ex.: "por que está internada?", "o que diz o laudo?"). Passe o número da manifestação (vem das outras ferramentas).',
    inputSchema: z.object({ manifestacoes: z.array(z.string()).min(1).max(10) }),
    execute: async ({ manifestacoes }) => {
      const supabase = await createClient()
      const docs = await documentosPorNumero(supabase, manifestacoes)
      return {
        aviso: 'Leitura automática de documento escaneado/manuscrito: trechos marcados [ilegível] não foram lidos. Na dúvida, conferir o original no portal.',
        manifestacoes: manifestacoes.map((m) => ({ manifestacao: m, documentos: docs.get(m) ?? [] })),
      }
    },
  }),

  indicadores: tool({
    description:
      'Indicadores do contrato por COMPETÊNCIA (mês de pagamento do TXT, "AAAA-MM"): valor utilizado, fatura, sinistralidade, vidas, custo médio, internações e saúde mental pelo TXT, top utilizadores, top prestadores, categorias e resumo por filial (subestipulante). Para o ano contratual, passe todos os meses desde março.',
    inputSchema: z.object({ competencias: z.array(z.string()).min(1).max(24).describe('["2026-10"] ou vários meses') }),
    execute: async ({ competencias }) => {
      const d = await getDashboardData({ mes: competencias })
      if (!d.hasData) return { hasData: false }
      return {
        competencias,
        kpis: d.kpis,
        vidas: d.vidas,
        resumoPorCompetencia: d.resumoCompetencia,
        categorias: d.categoriasGerenciais.slice(0, 13),
        saudeMental: d.saudeMentalResumo,
        topUtilizadores: d.topUtilizadores.slice(0, 15),
        topPrestadores: d.topPrestadores.slice(0, 10),
        porFilial: d.subestipulanteResumo,
        faixaEtaria: d.faixaEtaria,
      }
    },
  }),
}

export function promptSistema() {
  const hoje = hojeSP()
  return `Você é a inteligência da Winners Health Intelligence, plataforma de gestão de saúde da Winners Corretora. Quem pergunta é o Fernando (dono e administrador) ou o médico da Winners — uso interno: pode usar nomes, carteirinhas e dados clínicos à vontade.

Hoje é ${hoje} (horário de São Paulo). Cliente principal: DMS LOG (apólice SulAmérica 81938; filiais/subestipulantes 82CC9 matriz, 82CCA, 82CCB SP, 82CCC RJ). Ano contratual começa em março.

Fontes de dados (use as ferramentas; nunca invente números):
- SulAmérica Gestão Conectada (portal, lido por robô a cada 6 h): internações em tempo real (data de internação, alta, hospital, procedimentos, indicação clínica) e autorizações (exames SP/SADT, prorrogações, OPME). Internações desde 16/07/2026; autorizações ~1 ano; a varredura semanal traz histórico mais antigo. Os campos do portal quase nunca trazem CID/diagnóstico, mas os ANEXOS (aviso de internação, relatório médico, laudo, receita) são lidos por IA: "relatorioMedico" traz CID, diagnóstico e resumo; documentos_medicos traz a transcrição completa. Para "por qual causa", use o relatorioMedico; sem anexo lido, use indicação clínica + procedimentos e diga que não há relatório anexado. A leitura de documento manuscrito pode ter trechos [ilegível].
- TXT de contas pagas (arquivo da operadora): valores pagos por evento, por COMPETÊNCIA = mês de pagamento, não do atendimento (eventos chegam 1–2 meses depois). É a base de custo e sinistralidade.

Como agir:
- Perguntas sobre "hoje/agora/neste momento": chame status_dados; se a última leitura do Gestão Conectada tiver mais de 2 horas (ou o usuário pedir), chame atualizar_gestao_conectada antes de responder (avise que leva alguns minutos).
- "Internação no mês" pode ser pelo mês em que aconteceu (Gestão Conectada) ou pelo mês em que foi paga (TXT/indicadores). Se não estiver claro, responda as duas e explique a diferença em uma linha.
- Para temas clínicos (ex.: cirurgia do coração), use buscar_procedimento com vários termos técnicos e sinônimos.
- Para uma pessoa específica, use historico_pessoa.
- Para ir a fundo num caso (motivo da internação, o que o médico escreveu, medicamentos, exames), use documentos_medicos com o número da manifestação.
- Combine ferramentas quando precisar; não peça confirmação para consultar.

Formato da resposta: português do Brasil, direto. Comece pela resposta (número/nome), depois os detalhes. Use tabelas Markdown curtas para listas de pessoas. Valores em R$ com separador brasileiro; datas DD/MM/AAAA. Diga a data da última atualização quando o dado for do portal. Se o dado não existir no banco, diga claramente o que falta e de onde viria.`
}
