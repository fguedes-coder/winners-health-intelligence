// Resumo das internações do Gestão Conectada para o relatório executivo.
//
// Período = internações com DATA DE INTERNAÇÃO dentro das competências do
// relatório (não o mês de pagamento do TXT: é o que aconteceu no mês).
//
// Privacidade:
//   - anonimizado (vai para a empresa): só agregados; contagem de saúde
//     mental abaixo de K vira "menos de K"; hospital sensível suprimido;
//     nenhuma linha por pessoa — nem por pseudônimo.
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

export function resumirInternacoesRelatorio(
  internacoes: InternacaoGC[],
  opts: { competenciaInicio: string; competenciaFim: string; anonimizado: boolean },
): ResumoInternacoesRelatorio | null {
  const inicio = `${opts.competenciaInicio}-01`
  const fim = ultimoDia(opts.competenciaFim)
  const confirmadas = internacoes.filter((i) => i.dataInternacao)
  const coletaDesde = confirmadas.map((i) => i.dataInternacao!).sort()[0] ?? null
  const doPeriodo = confirmadas
    .filter((i) => i.dataInternacao! >= inicio && i.dataInternacao! <= fim)
    .sort((a, b) => a.dataInternacao!.localeCompare(b.dataInternacao!))
  const internadosHoje = internacoes.filter((i) => i.situacao === 'internado').length
  if (doPeriodo.length === 0 && internadosHoje === 0) return null

  const urg = (i: InternacaoGC) => /urg|emerg/i.test(i.carater ?? '')
  const cir = (i: InternacaoGC) => /cir[uú]rg/i.test(i.tipoInternacao ?? '')
  const altas = doPeriodo.filter((i) => i.situacao === 'alta' && i.dias != null)
  const comCusto = doPeriodo.filter((i) => i.custoPago != null)
  const sm = doPeriodo.filter((i) => i.saudeMental).length
  const reint = doPeriodo.filter((i) => i.reinternacao).length

  // Hospitais: no anonimizado, prestador sensível (ex.: clínica psiquiátrica)
  // com menos de K pessoas é agregado.
  const porHosp = new Map<string, { internacoes: number; dias: number; pessoas: Set<string> }>()
  for (const i of doPeriodo) {
    const nome = i.prestador ?? 'Não informado'
    const h = porHosp.get(nome) ?? { internacoes: 0, dias: 0, pessoas: new Set<string>() }
    h.internacoes++
    h.dias += i.dias ?? 0
    h.pessoas.add(i.carteirinha ?? i.numero)
    porHosp.set(nome, h)
  }
  const hospitais = [...porHosp.entries()]
    .map(([nome, h]) => ({
      nome: opts.anonimizado ? rotuloPrestadorSeguro(nome, h.pessoas.size).rotulo : nome,
      internacoes: h.internacoes,
      dias: h.dias,
    }))
    .sort((a, b) => b.internacoes - a.internacoes || b.dias - a.dias)
    .slice(0, 8)

  const casos: CasoInternacaoRelatorio[] = opts.anonimizado
    ? []
    : doPeriodo.map((i) => ({
        beneficiario: i.beneficiarioNome ?? i.carteirinha ?? `manifestação ${i.numero}`,
        perfil: [i.tipoBeneficiario, i.idade != null ? `${i.idade} anos` : null, i.empresa].filter(Boolean).join(' · '),
        hospital: i.prestador ?? '—',
        internacao: dataBR(i.dataInternacao),
        alta: i.dataAlta ? dataBR(i.dataAlta) : i.situacao === 'internado' ? 'internado' : '—',
        dias: i.dias,
        caraterTipo: [i.carater, i.tipoInternacao].filter(Boolean).join(' / ') || '—',
        situacao: SITUACAO[i.situacao],
        custo: i.custoPago,
        reinternacao: i.reinternacao ? `${i.reinternacao.diasDesdeAlta}d após alta` : null,
        saudeMental: i.saudeMental,
        motivo: motivoDe(i),
      }))

  const total = doPeriodo.length
  const permanenciaMedia = altas.length ? altas.reduce((s, i) => s + (i.dias ?? 0), 0) / altas.length : null
  const saudeMental =
    opts.anonimizado && sm > 0 && sm < K_ANONIMATO ? `menos de ${K_ANONIMATO}` : sm.toLocaleString('pt-BR')

  const partes: string[] = []
  if (total > 0) {
    partes.push(
      `No período houve ${total} internação(ões) confirmada(s) pelo hospital: ${doPeriodo.filter(urg).length} de urgência/emergência e ${doPeriodo.filter(cir).length} cirúrgica(s).`,
    )
    if (permanenciaMedia != null)
      partes.push(
        `A permanência média das que já tiveram alta foi de ${permanenciaMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s).`,
      )
    if (reint > 0) partes.push(`${reint} caso(s) de reinternação em até 30 dias após a alta — ponto de atenção para acompanhamento pós-alta.`)
    if (comCusto.length < total)
      partes.push(
        `${total - comCusto.length} internação(ões) ainda não têm conta paga: o custo delas entra nos próximos arquivos da operadora.`,
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
    interpretacao: partes.join(' '),
  }
}
