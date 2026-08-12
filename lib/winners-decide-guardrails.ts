// Validação da análise generativa antes de ela entrar no relatório.
//
// Motivação (relatório DMS Julho/2026): a seção 13 afirmava "internações =
// R$ 285.107 (73,1% do custo)", "51 ocorrências de pronto-socorro" e
// "tendência projetada de 84,8%" num mês cujo custo total foi R$ 23.195, com
// 15 passagens de PS e uma única competência apurada. A capa dizia "patamar
// saudável" e a página 16 dizia "necessidade urgente": o documento se
// contradizia para o mesmo leitor.
//
// Regras aplicadas ao TEXTO gerado, sempre contra os fatos apurados:
//   1. Nenhum valor monetário citado pode superar o teto do período.
//   2. Nenhuma contagem citada pode superar a contagem real do indicador.
//   3. Sem série histórica mínima, não se projeta sinistralidade nem reajuste.

/** Competências mínimas para que projeção/tendência seja admissível. */
export const MIN_COMPETENCIAS_PROJECAO = 3

export type FatosCarteira = {
  /** Valor utilizado no período (soma dos eventos). */
  custoTotal: number
  /** Teto para valores citados: custo utilizado ou fatura, o que for maior. */
  tetoMonetario: number
  internacoes: number
  prontoSocorro: number
  saudeMentalUtilizacoes: number
  vidasRiscoCritico: number
  /** Competências distintas no recorte analisado. */
  competencias: number
}

/** "285.107" / "2.910,50" → número. */
function parseNumeroBR(bruto: string): number {
  const limpo = bruto.replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/** Todos os valores em R$ citados no texto. */
export function extrairValoresMonetarios(texto: string): number[] {
  const out: number[] = []
  const re = /R\$\s?(\d[\d.]*(?:,\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) out.push(parseNumeroBR(m[1]))
  return out
}

// Cada indicador tem padrões "número antes do termo" e "termo antes do
// número", porque o modelo alterna as duas construções.
const PADROES_CONTAGEM: {
  chave: keyof Pick<
    FatosCarteira,
    'internacoes' | 'prontoSocorro' | 'saudeMentalUtilizacoes' | 'vidasRiscoCritico'
  >
  rotulo: string
  res: RegExp[]
}[] = [
  {
    chave: 'internacoes',
    rotulo: 'internações',
    res: [/(\d[\d.]*)\s*interna[çc](?:[õo]es|[ãa]o)\b/gi],
  },
  {
    chave: 'prontoSocorro',
    rotulo: 'atendimentos de pronto-socorro',
    res: [
      /(\d[\d.]*)\s*(?:ocorr[êe]ncias?|atendimentos?|eventos?|idas?|visitas?|passagens?|acessos?)[^.\n]{0,24}?pronto.?socorro/gi,
      /pronto.?socorro[^.\n]{0,24}?(\d[\d.]*)\s*(?:ocorr[êe]ncias?|atendimentos?|eventos?|passagens?)/gi,
    ],
  },
  {
    chave: 'saudeMentalUtilizacoes',
    rotulo: 'utilizações de saúde mental',
    res: [
      /(\d[\d.]*)\s*(?:utiliza[çc][õo]es|atendimentos?|eventos?|sess[õo]es|consultas?)[^.\n]{0,24}?sa[úu]de mental/gi,
      /sa[úu]de mental[^.\n]{0,24}?(\d[\d.]*)\s*(?:utiliza[çc][õo]es|atendimentos?|eventos?|sess[õo]es|consultas?)/gi,
    ],
  },
  {
    chave: 'vidasRiscoCritico',
    rotulo: 'vidas em risco crítico',
    res: [
      /(\d[\d.]*)\s*(?:vidas?|benefici[áa]rios?)[^.\n]{0,30}?cr[íi]tic/gi,
      /risco\s+cr[íi]tico[^.\n]{0,24}?(\d[\d.]*)\s*(?:vidas?|benefici[áa]rios?)/gi,
    ],
  },
]

// Projeção/tendência quantificada e faixa de reajuste — proibidas sem série.
const RE_PROJECAO =
  /(?:proje[çc][ãa]o|projetad[ao]s?|tend[êe]ncia\s+(?:projetada|estimada)|cen[áa]rio\s+projetado|estimativa\s+para\s+os?\s+pr[óo]ximos)[^.\n]{0,70}?\d+(?:[.,]\d+)?\s*%/i
const RE_REAJUSTE = /reajuste[^.\n]{0,60}?\d+(?:[.,]\d+)?\s*%/i

export type ResultadoValidacao = {
  ok: boolean
  violacoes: string[]
}

/**
 * Confere o texto gerado contra os fatos do período.
 *
 * Só acusa números MAIORES que o fato: "3 das 4 internações" é recorte
 * legítimo, "51 ocorrências de PS" quando houve 15 é dado de outra carteira.
 */
export function validarAnaliseIA(
  texto: string,
  fatos: FatosCarteira,
): ResultadoValidacao {
  const violacoes: string[] = []

  // 1) valores monetários acima do teto do período
  const teto = Math.max(fatos.tetoMonetario, fatos.custoTotal)
  const excedentes = extrairValoresMonetarios(texto).filter(
    (v) => teto > 0 && v > teto * 1.01,
  )
  if (excedentes.length > 0) {
    const maior = Math.max(...excedentes)
    violacoes.push(
      `valor de R$ ${Math.round(maior).toLocaleString('pt-BR')} citado no texto supera o teto do período (R$ ${Math.round(teto).toLocaleString('pt-BR')})`,
    )
  }

  // 2) contagens acima do apurado
  for (const padrao of PADROES_CONTAGEM) {
    const real = fatos[padrao.chave]
    for (const re of padrao.res) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(texto)) !== null) {
        const citado = parseNumeroBR(m[1])
        if (citado > real) {
          violacoes.push(
            `texto cita ${citado} ${padrao.rotulo}; o período registrou ${real}`,
          )
        }
      }
    }
  }

  // 3) projeção sem série histórica suficiente
  if (fatos.competencias < MIN_COMPETENCIAS_PROJECAO) {
    if (RE_PROJECAO.test(texto)) {
      violacoes.push(
        `projeção quantificada com apenas ${fatos.competencias} competência(s) apurada(s)`,
      )
    }
    if (RE_REAJUSTE.test(texto)) {
      violacoes.push(
        `faixa de reajuste citada com apenas ${fatos.competencias} competência(s) apurada(s)`,
      )
    }
  }

  return { ok: violacoes.length === 0, violacoes: [...new Set(violacoes)] }
}

/** Regra adicional injetada no prompt quando não há série para projetar. */
export function regraSerieInsuficiente(competencias: number): string {
  return [
    `ATENÇÃO — SÉRIE HISTÓRICA INSUFICIENTE: o recorte analisado tem apenas ${competencias} competência(s).`,
    'É PROIBIDO projetar sinistralidade, estimar tendência quantificada ou citar faixas de reajuste.',
    'Onde a projeção seria esperada, escreva explicitamente "série histórica insuficiente para projeção" e trate o período como uma fotografia, não como tendência.',
  ].join(' ')
}

/** Instrução de correção enviada na segunda tentativa. */
export function instrucaoCorrecao(violacoes: string[]): string {
  return [
    'A resposta anterior foi REJEITADA pela validação automática do relatório:',
    ...violacoes.map((v) => `- ${v}`),
    'Reescreva a análise inteira usando EXCLUSIVAMENTE os números do JSON enviado.',
    'Não invente, não extrapole e não some valores de outros períodos ou de outras carteiras.',
  ].join('\n')
}
