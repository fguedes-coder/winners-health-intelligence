// Camada de proteção de dado sensível de saúde na exibição de relatórios.
//
// Substituir o nome do beneficiário por um rótulo (RISCO-0XX) NÃO anonimiza um
// registro que é único na base: numa carteira de 90 vidas utilizadoras, uma
// linha "CURETAGEM POS-ABORTAMENTO — R$ 2.910" é reidentificável por quem tem
// acesso a afastamentos (LGPD art. 11 c/c art. 12 — reidentificação por
// esforço razoável). O relatório ainda se declara anonimizado no rodapé, o que
// agrava a exposição.
//
// Duas regras, aplicadas em conjunto:
//   1. Generalização clínica — descrições que revelam condição sensível nunca
//      são exibidas nominalmente; viram o capítulo clínico correspondente.
//   2. k-anonimato — linhas com menos de K beneficiários distintos no período
//      não aparecem isoladas; são agregadas num balde residual.

/** Mínimo de beneficiários distintos para uma linha ser exibida nominalmente. */
export const K_ANONIMATO = 5

export type TemaSensivel =
  | 'saude-reprodutiva'
  | 'ist-infectologia'
  | 'oncologia'
  | 'saude-mental'
  | 'dependencia-quimica'
  | 'pediatria'

// Cada tema é generalizado para o capítulo clínico, nunca para o procedimento.
const TEMAS: {
  tema: TemaSensivel
  re: RegExp
  rotulo: string
  rotuloInternacao: string
}[] = [
  {
    tema: 'saude-reprodutiva',
    re: /ABORT|CURETAGEM|\bPARTO\b|CESAR|PUERP|GESTAC|GESTANTE|PRE.?NATAL|LAQUEAD|VASECTOM|HISTERECTOM|FERTILIZ|INSEMINAC|\bDIU\b|CONTRACEP|OBSTETR/i,
    rotulo: 'Procedimento em saúde reprodutiva',
    rotuloInternacao: 'Internação obstétrica',
  },
  {
    tema: 'ist-infectologia',
    re: /\bHIV\b|\bAIDS\b|SIFILIS|S[IÍ]FILIS|GONORR|CLAMIDIA|HEPATITE\s?[BC]\b|\bIST\b|\bDST\b|ANTIRRETROVIR|CARGA\s+VIRAL|\bPREP\b|INFECTOLOG/i,
    rotulo: 'Acompanhamento em infectologia',
    rotuloInternacao: 'Internação em infectologia',
  },
  {
    tema: 'oncologia',
    re: /ONCOL|QUIMIOTERAP|RADIOTERAP|NEOPLAS|\bTUMOR|C[AÂ]NCER|MASTECTOM|BRAQUITERAP|IMUNOTERAP/i,
    rotulo: 'Tratamento oncológico',
    rotuloInternacao: 'Internação oncológica',
  },
  {
    tema: 'saude-mental',
    re: /PSIQUIATR|PSICOLOG|PSICOTERAP|NEUROPSIC|SA[UÚ]DE\s+MENTAL|TERAPIA\s+OCUPACION/i,
    rotulo: 'Atendimento em saúde mental',
    rotuloInternacao: 'Internação em saúde mental',
  },
  {
    tema: 'dependencia-quimica',
    re: /DEPEND[EÊ]NCIA\s+QU[IÍ]MICA|DESINTOX|TOXICOMAN|ALCOOL|[AÁ]LCOOL|ETILIS|\bCAPS\s?AD\b|ABSTIN[EÊ]NCIA/i,
    rotulo: 'Tratamento de dependência química',
    rotuloInternacao: 'Internação para tratamento de dependência química',
  },
]

// Prestadores cuja razão social revela a especialidade — e, com poucas vidas,
// revela a condição de quem foi atendido.
const PRESTADORES_SENSIVEIS: { tema: TemaSensivel; re: RegExp }[] = [
  {
    tema: 'saude-reprodutiva',
    re: /MULHER|MATERNIDADE|OBSTETR|GINECOL|REPRODUC|FERTIL|PERINAT/i,
  },
  { tema: 'oncologia', re: /ONCOL|C[AÂ]NCER|INCA\b|RADIOTERAP|QUIMIOTERAP/i },
  {
    tema: 'saude-mental',
    re: /PSIQUIATR|PSICOL|SA[UÚ]DE\s+MENTAL|INSTITUTO\s+DE\s+PSIQ/i,
  },
  { tema: 'dependencia-quimica', re: /CAPS\s?AD|DEPEND[EÊ]NCIA\s+QU[IÍ]MICA|REABILITAC[AÃ]O\s+QU[IÍ]MICA/i },
  { tema: 'ist-infectologia', re: /INFECTOLOG|DOENCAS\s+INFECC|EMILIO\s+RIBAS/i },
  { tema: 'pediatria', re: /CRIANC|PEDIATR|INFANTIL/i },
]

const ROTULO_ESPECIALIDADE: Record<TemaSensivel, string> = {
  'saude-reprodutiva': 'Prestador especializado em saúde da mulher',
  'ist-infectologia': 'Prestador especializado em infectologia',
  oncologia: 'Prestador especializado em oncologia',
  'saude-mental': 'Prestador especializado em saúde mental',
  'dependencia-quimica': 'Prestador especializado em dependência química',
  pediatria: 'Prestador especializado em pediatria',
}

/** Balde residual das linhas suprimidas por k-anonimato. */
export const ROTULO_RESIDUAL_PROCEDIMENTO = 'Demais procedimentos'
export const ROTULO_RESIDUAL_PRESTADOR = 'Demais prestadores'

/** Tema sensível revelado pela descrição do procedimento, se houver. */
export function temaSensivelProcedimento(
  descricao: string | null | undefined,
): TemaSensivel | null {
  const t = descricao ?? ''
  if (!t) return null
  return TEMAS.find((x) => x.re.test(t))?.tema ?? null
}

/**
 * Rótulo seguro de um procedimento: descrições sensíveis são generalizadas
 * para o capítulo clínico; as demais são preservadas como vêm do arquivo.
 */
export function rotuloProcedimentoSeguro(
  descricao: string | null | undefined,
  opts: { internacao?: boolean } = {},
): { rotulo: string; sensivel: boolean; tema: TemaSensivel | null } {
  const original = (descricao ?? '').replace(/\s+/g, ' ').trim()
  const match = original ? TEMAS.find((x) => x.re.test(original)) : undefined
  if (!match) return { rotulo: original || 'Não informado', sensivel: false, tema: null }
  return {
    rotulo: opts.internacao ? match.rotuloInternacao : match.rotulo,
    sensivel: true,
    tema: match.tema,
  }
}

/** Tema sensível revelado pela razão social do prestador, se houver. */
export function temaSensivelPrestador(
  nome: string | null | undefined,
): TemaSensivel | null {
  const t = nome ?? ''
  if (!t) return null
  return PRESTADORES_SENSIVEIS.find((x) => x.re.test(t))?.tema ?? null
}

/**
 * Rótulo seguro de um prestador. A razão social só é suprimida quando revela
 * especialidade sensível E o prestador atendeu menos de K beneficiários no
 * período — um hospital geral com uma vida não revela condição de saúde.
 */
export function rotuloPrestadorSeguro(
  nome: string | null | undefined,
  beneficiarios: number | null | undefined,
  k: number = K_ANONIMATO,
): { rotulo: string; suprimido: boolean } {
  const original = (nome ?? '').replace(/\s+/g, ' ').trim() || 'Prestador não informado'
  const tema = temaSensivelPrestador(original)
  const n = beneficiarios ?? 0
  if (!tema || n >= k) return { rotulo: original, suprimido: false }
  return { rotulo: ROTULO_ESPECIALIDADE[tema], suprimido: true }
}

export type LinhaAgregada = {
  nome: string
  valor: number
  eventos: number
  beneficiarios?: number
}

/**
 * Aplica generalização clínica e k-anonimato a uma lista de linhas agregadas.
 *
 * 1. Cada linha recebe o rótulo seguro e linhas com o mesmo rótulo são somadas
 *    (duas descrições do mesmo capítulo clínico viram uma só).
 * 2. Linhas que continuam abaixo de K beneficiários distintos são somadas no
 *    balde residual, que só aparece se tiver valor.
 *
 * Quando a contagem de beneficiários não está disponível, a linha é preservada
 * — a supressão exige o dado, não a sua ausência.
 */
export function aplicarKAnonimato<T extends LinhaAgregada>(
  linhas: T[],
  opts: {
    k?: number
    rotuloResidual?: string
    /** Mapeia a linha para o rótulo seguro (default: procedimentos). */
    rotuloSeguro?: (linha: T) => string
  } = {},
): { linhas: LinhaAgregada[]; suprimidas: number; valorSuprimido: number } {
  const k = opts.k ?? K_ANONIMATO
  const residual = opts.rotuloResidual ?? ROTULO_RESIDUAL_PROCEDIMENTO
  const rotular =
    opts.rotuloSeguro ?? ((l: T) => rotuloProcedimentoSeguro(l.nome).rotulo)

  // 1) generalização + fusão por rótulo
  const porRotulo = new Map<string, LinhaAgregada>()
  for (const linha of linhas) {
    const nome = rotular(linha)
    const cur = porRotulo.get(nome)
    if (cur) {
      cur.valor += linha.valor
      cur.eventos += linha.eventos
      if (cur.beneficiarios !== undefined && linha.beneficiarios !== undefined) {
        // Soma conservadora: sem os conjuntos originais, assume-se que as
        // descrições fundidas atingiram beneficiários distintos.
        cur.beneficiarios += linha.beneficiarios
      }
    } else {
      porRotulo.set(nome, { ...linha, nome })
    }
  }

  // 2) k-anonimato
  const visiveis: LinhaAgregada[] = []
  const balde: LinhaAgregada = {
    nome: residual,
    valor: 0,
    eventos: 0,
    beneficiarios: 0,
  }
  let suprimidas = 0
  for (const linha of porRotulo.values()) {
    const n = linha.beneficiarios
    if (n !== undefined && n < k) {
      balde.valor += linha.valor
      balde.eventos += linha.eventos
      balde.beneficiarios = (balde.beneficiarios ?? 0) + n
      suprimidas++
      continue
    }
    visiveis.push(linha)
  }
  const resultado = visiveis.sort((a, b) => b.valor - a.valor)
  if (balde.valor > 0 || balde.eventos > 0) resultado.push(balde)
  return { linhas: resultado, suprimidas, valorSuprimido: balde.valor }
}
