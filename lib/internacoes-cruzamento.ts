// Cruzamento do Gestão Conectada (o que aconteceu: datas, alta, hospital)
// com o TXT de contas pagas (quanto custou). Funções puras — sem banco.
//
// O TXT não traz mais a data de internação (vazia desde jul/26) nem a alta;
// por isso a ligação é pela CARTEIRINHA + DATA DE ATENDIMENTO do lançamento de
// internação dentro da janela da internação real (com folga de 2 dias para
// pré-operatório e para a conta fechada no dia seguinte à alta).

export const FOLGA_DIAS = 2
/** Sem alta informada: considera até 30 dias depois da internação. */
export const JANELA_SEM_ALTA_DIAS = 30
/** Reinternação: nova internação até 30 dias depois da alta anterior (padrão ANS). */
export const REINTERNACAO_DIAS = 30

const DIA_MS = 86_400_000
const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DIA_MS

export type InternacaoBase = {
  numero: string
  carteirinha: string | null
  dataInternacao: string | null
  dataAlta: string | null
}

export type LancamentoTXT = {
  carteirinha: string
  dataAtendimento: string | null
  valorPago: number
  competencia: string | null
}

export type CustoInternacao = {
  valorPago: number
  lancamentos: number
  /** Competências (mês de pagamento) em que as contas apareceram. */
  competencias: string[]
  /** Valor pago em cada competência (mês de pagamento). */
  porCompetencia: Record<string, number>
  /** Último dia de atendimento cobrado (AAAA-MM-DD). */
  ultimoAtendimento: string
}

/** Custo pago (TXT) de cada internação do Gestão Conectada, por número da manifestação. */
export function custoPorInternacao(
  internacoes: InternacaoBase[],
  lancamentos: LancamentoTXT[],
): Map<string, CustoInternacao> {
  const porPessoa = new Map<string, LancamentoTXT[]>()
  for (const l of lancamentos) {
    if (!l.dataAtendimento) continue
    const g = porPessoa.get(l.carteirinha)
    if (g) g.push(l)
    else porPessoa.set(l.carteirinha, [l])
  }

  const res = new Map<string, CustoInternacao>()
  // Um lançamento conta para UMA internação só (a primeira cuja janela o contém).
  const usados = new Set<LancamentoTXT>()
  const ordenadas = [...internacoes]
    .filter((i) => i.carteirinha && i.dataInternacao)
    .sort((a, b) => (a.dataInternacao ?? '').localeCompare(b.dataInternacao ?? ''))

  for (const [k, i] of ordenadas.entries()) {
    const ini = dia(i.dataInternacao!) - FOLGA_DIAS
    // Sem alta: até 30 dias, mas nunca entrando na janela da próxima
    // internação da mesma pessoa (senão a conta dela vinha para esta).
    const proxima = ordenadas.slice(k + 1).find((x) => x.carteirinha === i.carteirinha && x.dataInternacao! > i.dataInternacao!)
    const fim = i.dataAlta
      ? dia(i.dataAlta) + FOLGA_DIAS
      : Math.min(
          dia(i.dataInternacao!) + JANELA_SEM_ALTA_DIAS + FOLGA_DIAS,
          proxima ? dia(proxima.dataInternacao!) - FOLGA_DIAS - 1 : Infinity,
        )
    let valor = 0
    let n = 0
    let ultimo = ''
    const comps = new Set<string>()
    const porComp: Record<string, number> = {}
    for (const l of porPessoa.get(i.carteirinha!) ?? []) {
      if (usados.has(l)) continue
      const d = dia(l.dataAtendimento!)
      if (d < ini || d > fim) continue
      usados.add(l)
      valor += l.valorPago
      n++
      if (l.dataAtendimento!.slice(0, 10) > ultimo) ultimo = l.dataAtendimento!.slice(0, 10)
      if (l.competencia) {
        comps.add(l.competencia)
        porComp[l.competencia] = (porComp[l.competencia] ?? 0) + l.valorPago
      }
    }
    if (n > 0)
      res.set(i.numero, { valorPago: valor, lancamentos: n, competencias: [...comps].sort(), porCompetencia: porComp, ultimoAtendimento: ultimo })
  }
  return res
}

export type Reinternacao = {
  numero: string
  anterior: string
  /** Dias entre a alta anterior e a nova internação. */
  diasDesdeAlta: number
}

/**
 * Reinternações: mesma carteirinha, nova internação até 30 dias após a alta
 * anterior. Compara com a ÚLTIMA alta já ocorrida (não só com o registro
 * imediatamente anterior, que pode não ter alta). Quem chama deve passar só
 * internações válidas — sem negadas/canceladas.
 */
export function reinternacoes(internacoes: InternacaoBase[]): Map<string, Reinternacao> {
  const porPessoa = new Map<string, InternacaoBase[]>()
  for (const i of internacoes) {
    if (!i.carteirinha || !i.dataInternacao) continue
    const g = porPessoa.get(i.carteirinha)
    if (g) g.push(i)
    else porPessoa.set(i.carteirinha, [i])
  }
  const res = new Map<string, Reinternacao>()
  for (const lista of porPessoa.values()) {
    lista.sort((a, b) => (a.dataInternacao ?? '').localeCompare(b.dataInternacao ?? ''))
    let ultima: InternacaoBase | null = null
    for (const atual of lista) {
      if (ultima?.dataAlta) {
        const dias = dia(atual.dataInternacao!) - dia(ultima.dataAlta)
        if (dias >= 0 && dias <= REINTERNACAO_DIAS) {
          res.set(atual.numero, { numero: atual.numero, anterior: ultima.numero, diasDesdeAlta: dias })
        }
      }
      if (atual.dataAlta && (!ultima?.dataAlta || atual.dataAlta > ultima.dataAlta)) ultima = atual
    }
  }
  return res
}

/** Internação de saúde mental: veio de um relatório psiquiátrico do portal ou o texto indica. */
export function ehSaudeMentalGC(i: {
  relatorios?: string[]
  indicacaoClinica?: string | null
  hipoteseDiagnostica?: string | null
  procedimentos?: Record<string, string>[]
}): boolean {
  if ((i.relatorios ?? []).some((r) => /psiqui|TEA/i.test(r))) return true
  const texto = [
    i.indicacaoClinica,
    i.hipoteseDiagnostica,
    ...(i.procedimentos ?? []).map((p) => Object.values(p).join(' ')),
  ].join(' ')
  return /PSIQUIATR|PSICOTERAP|SA[UÚ]DE MENTAL|DEPEND[EÊ]NCIA QU[IÍ]MICA|\bTEA\b|AUTIS/i.test(texto)
}
