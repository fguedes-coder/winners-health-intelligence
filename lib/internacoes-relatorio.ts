// Resumo das internações do Gestão Conectada para o relatório executivo.
//
// Duas visões do mesmo período:
//   - "aconteceram": DATA DE INTERNAÇÃO dentro das competências do relatório
//     (o que aconteceu no mês, mesmo que a conta ainda não tenha chegado);
//   - "pagas": internações cujas contas foram PAGAS nas competências do
//     relatório (o TXT). É o que explica o número "Internações" do resumo
//     executivo — que é por mês de pagamento — com quem, onde, quanto tempo e
//     por quê.
// Negadas e canceladas ficam de fora das duas.
//
// Privacidade:
//   - anonimizado (vai para a empresa): só agregados; contagem de saúde
//     mental abaixo de K vira "menos de K"; hospital com menos de K pessoas
//     vai para "Demais hospitais"; nenhuma linha por pessoa — nem por pseudônimo.
//   - nominal (uso interno da Winners): caso a caso, com nome, hospital,
//     datas, dias, motivo, custo e reinternação.

import { K_ANONIMATO, rotuloPrestadorSeguro } from '@/lib/privacidade-clinica'
import type { InternacaoGC, SituacaoInternacao } from '@/lib/gestao-conectada'

export type CasoInternacaoRelatorio = {
  beneficiario: string
  perfil: string
  hospital: string
  internacao: string
  alta: string
  dias: number | null
  caraterTipo: string
  situacao: string
  custo: number | null
  reinternacao: string | null
  saudeMental: boolean
  motivo: string
}

export type ResumoInternacoesRelatorio = {
  inicio: string
  fim: string
  /** Primeira data de internação que o robô tem — antes disso não há dado. */
  coletaDesde: string | null
  total: number
  urgencia: number
  eletivas: number
  cirurgicas: number
  clinicas: number
  altas: number
  emCurso: number
  permanenciaMedia: number | null
  diasTotais: number
  reinternacoes: number
  /** Texto pronto (pode ser "menos de 5" no anonimizado). */
  saudeMental: string
  custoPago: number
  comCusto: number
  /** Internados na data de geração do relatório (todas as datas). */
  internadosHoje: number
  hospitais: { nome: string; internacoes: number; dias: number }[]
  casos: CasoInternacaoRelatorio[]
  /** Internações cujas contas foram pagas nas competências do relatório. */
  pagas: {
    total: number
    valor: number
    urgencia: number
    permanenciaMedia: number | null
    reinternacoes: number
    /** Internações no TXT do período (o número do resumo executivo). */
    pessoasTXT: number | null
    /** Só no nominal. Custo = valor pago NAS competências do relatório. */
    casos: CasoInternacaoRelatorio[]
  }
  interpretacao: string
}

const SITUACAO: Record<SituacaoInternacao, string> = {
  internado: 'Internado',
  alta: 'Alta',
  aguardando: 'Autorizada',
  em_analise: 'Em análise',
  negada: 'Negada',
  cancelada: 'Cancelada',
}

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function ultimoDia(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/** Motivo legível: indicação clínica > hipótese > descrição dos procedimentos. */
function motivoDe(i: InternacaoGC): string {
  const procs = i.procedimentos
    .map((p) => p['Descrição'] ?? p['Descricao'] ?? '')
    .filter(Boolean)
    .slice(0, 3)
  const partes = [
    i.hipoteseDiagnostica ? `Hipótese: ${i.hipoteseDiagnostica}` : null,
    i.indicacaoClinica ? `Indicação: ${i.indicacaoClinica}` : null,
    procs.length ? `Procedimentos: ${procs.join('; ')}${i.procedimentos.length > 3 ? '…' : ''}` : null,
  ].filter(Boolean)
  return partes.join(' · ') || 'não informado no portal'
}

function casoDe(i: InternacaoGC, custo: number | null): CasoInternacaoRelatorio {
  return {
    beneficiario: i.beneficiarioNome ?? i.carteirinha ?? `manifestação ${i.numero}`,
    perfil: [i.tipoBeneficiario, i.idade != null ? `${i.idade} anos` : null, i.empresa].filter(Boolean).join(' · '),
    hospital: i.prestador ?? '—',
    internacao: dataBR(i.dataInternacao),
    alta: i.dataAlta ? dataBR(i.dataAlta) : i.situacao === 'internado' ? 'internado' : '—',
    dias: i.dias,
    caraterTipo: [i.carater, i.tipoInternacao].filter(Boolean).join(' / ') || '—',
    situacao: SITUACAO[i.situacao],
    custo,
    reinternacao: i.reinternacao ? `${i.reinternacao.diasDesdeAlta}d após alta` : null,
    saudeMental: i.saudeMental,
    motivo: motivoDe(i),
  }
}

const urg = (i: InternacaoGC) => /urg|emerg/i.test(i.carater ?? '')
const cir = (i: InternacaoGC) => /cir[uú]rg/i.test(i.tipoInternacao ?? '')

export function resumirInternacoesRelatorio(
  internacoes: InternacaoGC[],
  opts: {
    competenciaInicio: string
    competenciaFim: string
    anonimizado: boolean
    /** Nº de internações no TXT do período, como no resumo executivo. */
    pessoasTXT?: number | null
  },
): ResumoInternacoesRelatorio | null {
  const inicio = `${opts.competenciaInicio}-01`
  const fim = ultimoDia(opts.competenciaFim)
  const confirmadas = internacoes.filter(
    (i) => i.dataInternacao && i.situacao !== 'negada' && i.situacao !== 'cancelada',
  )
  const coletaDesde = confirmadas.map((i) => i.dataInternacao!).sort()[0] ?? null
  const doPeriodo = confirmadas
    .filter((i) => i.dataInternacao! >= inicio && i.dataInternacao! <= fim)
    .sort((a, b) => a.dataInternacao!.localeCompare(b.dataInternacao!))
  const internadosHoje = internacoes.filter((i) => i.situacao === 'internado').length

  // Pagas nas competências do relatório (valor só dessas competências).
  const noPeriodo = (comp: string) => comp >= opts.competenciaInicio && comp <= opts.competenciaFim
  const pagas = confirmadas
    .map((i) => {
      const comps = Object.entries(i.custoPorCompetencia ?? {}).filter(([c]) => noPeriodo(c))
      return { i, valor: comps.reduce((s, [, v]) => s + v, 0), temConta: comps.length > 0 }
    })
    .filter((x) => x.temConta)
    .sort((a, b) => a.i.dataInternacao!.localeCompare(b.i.dataInternacao!))

  if (doPeriodo.length === 0 && internadosHoje === 0 && pagas.length === 0) return null

  const altas = doPeriodo.filter((i) => i.situacao === 'alta' && i.dias != null)
  const comCusto = doPeriodo.filter((i) => i.custoPago != null)
  const sm = doPeriodo.filter((i) => i.saudeMental).length
  const reint = doPeriodo.filter((i) => i.reinternacao).length

  // Hospitais: no anonimizado, hospital com menos de K pessoas no período vai
  // para "Demais hospitais" — numa carteira pequena, hospital + mês bastam
  // para a empresa reconhecer quem foi internado.
  const porHosp = new Map<string, { internacoes: number; dias: number; pessoas: Set<string> }>()
  for (const i of doPeriodo) {
    const nome = i.prestador ?? 'Não informado'
    const h = porHosp.get(nome) ?? { internacoes: 0, dias: 0, pessoas: new Set<string>() }
    h.internacoes++
    h.dias += i.dias ?? 0
    h.pessoas.add(i.carteirinha ?? i.numero)
    porHosp.set(nome, h)
  }
  const DEMAIS = `Demais hospitais (menos de ${K_ANONIMATO} pessoas cada)`
  const agrupados = new Map<string, { internacoes: number; dias: number }>()
  for (const [nome, h] of porHosp) {
    const rotulo = !opts.anonimizado
      ? nome
      : h.pessoas.size < K_ANONIMATO
        ? DEMAIS
        : rotuloPrestadorSeguro(nome, h.pessoas.size).rotulo
    const g = agrupados.get(rotulo) ?? { internacoes: 0, dias: 0 }
    g.internacoes += h.internacoes
    g.dias += h.dias
    agrupados.set(rotulo, g)
  }
  const hospitais = [...agrupados.entries()]
    .map(([nome, h]) => ({ nome, internacoes: h.internacoes, dias: h.dias }))
    .sort(
      (a, b) =>
        Number(a.nome === DEMAIS) - Number(b.nome === DEMAIS) || b.internacoes - a.internacoes || b.dias - a.dias,
    )
    .slice(0, 8)

  const casos: CasoInternacaoRelatorio[] = opts.anonimizado ? [] : doPeriodo.map((i) => casoDe(i, i.custoPago))

  const pagasAltas = pagas.filter((x) => x.i.dataAlta && x.i.dias != null)
  const resumoPagas: ResumoInternacoesRelatorio['pagas'] = {
    total: pagas.length,
    valor: pagas.reduce((s, x) => s + x.valor, 0),
    urgencia: pagas.filter((x) => urg(x.i)).length,
    permanenciaMedia: pagasAltas.length
      ? pagasAltas.reduce((s, x) => s + (x.i.dias ?? 0), 0) / pagasAltas.length
      : null,
    reinternacoes: pagas.filter((x) => x.i.reinternacao).length,
    pessoasTXT: opts.pessoasTXT ?? null,
    casos: opts.anonimizado ? [] : pagas.map((x) => casoDe(x.i, x.valor)),
  }

  const total = doPeriodo.length
  const permanenciaMedia = altas.length ? altas.reduce((s, i) => s + (i.dias ?? 0), 0) / altas.length : null
  const saudeMental =
    opts.anonimizado && sm > 0 && sm < K_ANONIMATO ? `menos de ${K_ANONIMATO}` : sm.toLocaleString('pt-BR')
  const dec = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  const partes: string[] = []
  if (pagas.length > 0) {
    partes.push(
      `As contas de internação pagas no período somam ${brl(resumoPagas.valor)} e correspondem a ${pagas.length} internação(ões) identificada(s) no portal${resumoPagas.urgencia ? `, ${resumoPagas.urgencia} de urgência/emergência` : ''}${resumoPagas.permanenciaMedia != null ? `, com permanência média de ${dec(resumoPagas.permanenciaMedia)} dia(s)` : ''}.`,
    )
    if (resumoPagas.reinternacoes > 0)
      partes.push(`${resumoPagas.reinternacoes} delas foi(ram) reinternação em até 30 dias após uma alta.`)
    if (opts.pessoasTXT != null && opts.pessoasTXT > pagas.length)
      partes.push(
        `${opts.pessoasTXT - pagas.length} internação(ões) do arquivo da operadora não têm correspondência no portal (anteriores ao início da coleta ou fora da janela de datas).`,
      )
  }
  if (total > 0) {
    partes.push(
      `Começaram no período ${total} internação(ões), confirmadas pelo hospital: ${doPeriodo.filter(urg).length} de urgência/emergência e ${doPeriodo.filter(cir).length} cirúrgica(s).`,
    )
    if (permanenciaMedia != null)
      partes.push(`A permanência média das que já tiveram alta foi de ${dec(permanenciaMedia)} dia(s).`)
    if (reint > 0)
      partes.push(
        `${reint} caso(s) de reinternação em até 30 dias após a alta — ponto de atenção para acompanhamento pós-alta.`,
      )
    if (comCusto.length < total)
      partes.push(
        `${total - comCusto.length} dessas internações ainda não têm conta paga: o custo entra nos próximos arquivos da operadora.`,
      )
  }
  if (internadosHoje > 0) partes.push(`Na data deste relatório, ${internadosHoje} beneficiário(s) seguem internados.`)

  return {
    inicio,
    fim,
    coletaDesde,
    total,
    urgencia: doPeriodo.filter(urg).length,
    eletivas: doPeriodo.filter((i) => !urg(i)).length,
    cirurgicas: doPeriodo.filter(cir).length,
    clinicas: doPeriodo.filter((i) => !cir(i)).length,
    altas: doPeriodo.filter((i) => i.situacao === 'alta').length,
    emCurso: doPeriodo.filter((i) => i.situacao === 'internado').length,
    permanenciaMedia,
    diasTotais: doPeriodo.reduce((s, i) => s + (i.dias ?? 0), 0),
    reinternacoes: reint,
    saudeMental,
    custoPago: comCusto.reduce((s, i) => s + (i.custoPago ?? 0), 0),
    comCusto: comCusto.length,
    internadosHoje,
    hospitais,
    casos,
    pagas: resumoPagas,
    interpretacao: partes.join(' '),
  }
}
