// Normalização e consolidação de prestadores.
//
// O TXT da operadora traz a razão social digitada de formas diferentes entre
// competências e entre linhas da mesma competência ("GLORIA D OR" e
// "GLORIA DOR", "HOSPITAL SAO LUIZ   SAO BERNARDO" com espaços múltiplos).
// Sem normalização, o mesmo prestador aparece em duas posições do ranking e o
// custo real fica subestimado em ambas.
//
// Regra de agrupamento: CNPJ quando disponível; nome normalizado como chave
// alternativa. Ao final, grupos com o mesmo nome normalizado são fundidos, o
// que cobre o caso (comum) de parte dos eventos vir sem CNPJ.

/** Remove acentos, pontuação e colapsa espaços. Não altera a identidade. */
function limparTexto(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Sufixos societários que não distinguem prestadores.
const RE_SUFIXO_SOCIETARIO =
  /\b(LTDA|EIRELI|EPP|ME|MEI|S\s?A|SA|SS|CIA|COMPANHIA|SOCIEDADE\s+EMPRESARIA(\s+LIMITADA)?|EM\s+RECUPERACAO\s+JUDICIAL)\b/g

// Canonicalização de marcas cujo nome aparece grafado de várias formas.
// Atua apenas sobre o TOKEN da marca — unidades distintas da mesma rede
// (ex.: GLORIA DOR e COPA DOR) continuam sendo prestadores diferentes.
const ALIASES: { re: RegExp; canonico: string }[] = [
  { re: /\bD\s+OR\b/g, canonico: 'DOR' }, // D'Or / D OR / D'OR → DOR
  { re: /\bREDE\s+DOR\b/g, canonico: 'DOR' },
  { re: /\bSAO\s+LUIS\b/g, canonico: 'SAO LUIZ' },
  { re: /\bDELBONI\s+AURIEMO\b/g, canonico: 'DELBONI' },
  { re: /\bSERGIO\s+FRANCO\s+MEDICINA\s+DIAGNOSTICA\b/g, canonico: 'SERGIO FRANCO' },
  { re: /\bFLEURY\s+MEDICINA\s+E\s+SAUDE\b/g, canonico: 'FLEURY' },
  { re: /\bAMIL\s+ASSISTENCIA\s+MEDICA\s+INTERNACIONAL\b/g, canonico: 'AMIL' },
  { re: /\bHAPVIDA\s+ASSISTENCIA\s+MEDICA\b/g, canonico: 'HAPVIDA' },
  { re: /\bNOTRE\s+DAME\s+INTERMEDICA\b/g, canonico: 'NOTREDAME INTERMEDICA' },
  { re: /\bSANTA\s+CASA\s+DE\s+MISERICORDIA\b/g, canonico: 'SANTA CASA' },
  { re: /\bSANTA\s+CASA\s+DE\b/g, canonico: 'SANTA CASA' },
]

/** Chave de agrupamento por nome: canônica, estável e comparável. */
export function normalizarNomePrestador(nome: string | null | undefined): string {
  let t = limparTexto(nome ?? '')
  if (!t) return ''
  for (const { re, canonico } of ALIASES) t = t.replace(re, canonico)
  t = t.replace(RE_SUFIXO_SOCIETARIO, ' ').replace(/\s+/g, ' ').trim()
  return t
}

/** Rótulo de exibição: preserva o nome do arquivo, sem espaços duplicados. */
export function rotuloPrestador(nome: string | null | undefined): string {
  const t = (nome ?? '').replace(/\s+/g, ' ').trim()
  return t || 'Prestador não informado'
}

/** Só os dígitos do CNPJ; vazio quando ausente ou inválido. */
function cnpjDigitos(cnpj: string | null | undefined): string {
  const d = (cnpj ?? '').replace(/\D+/g, '')
  return d.length >= 8 ? d : ''
}

/**
 * Chave de agrupamento de um evento: CNPJ quando houver, senão o nome
 * normalizado. Grupos com o mesmo nome normalizado são fundidos depois por
 * `consolidarPrestadores`.
 */
export function chavePrestador(
  cnpj: string | null | undefined,
  nome: string | null | undefined,
): string {
  const doc = cnpjDigitos(cnpj)
  if (doc) return `cnpj:${doc}`
  const n = normalizarNomePrestador(nome)
  return n ? `nome:${n}` : 'nome:NAO INFORMADO'
}

export type PrestadorAgregado = {
  nome: string
  eventos: number
  valor: number
  /** Beneficiários distintos atendidos — usado para k-anonimato na exibição. */
  benef?: Set<string>
}

/**
 * Funde linhas que representam o mesmo prestador (mesmo nome normalizado),
 * somando eventos e valor. Mantém como rótulo a grafia mais frequente — em
 * empate, a mais longa, que costuma ser a razão social completa.
 */
export function consolidarPrestadores<T extends PrestadorAgregado>(
  linhas: T[],
): T[] {
  const grupos = new Map<string, { base: T; rotulos: Map<string, number> }>()
  for (const linha of linhas) {
    const chave = normalizarNomePrestador(linha.nome) || rotuloPrestador(linha.nome)
    const g = grupos.get(chave)
    if (!g) {
      grupos.set(chave, {
        base: {
          ...linha,
          nome: rotuloPrestador(linha.nome),
          ...(linha.benef ? { benef: new Set(linha.benef) } : {}),
        },
        rotulos: new Map([[rotuloPrestador(linha.nome), linha.eventos]]),
      })
      continue
    }
    g.base.eventos += linha.eventos
    g.base.valor += linha.valor
    if (linha.benef) {
      if (!g.base.benef) g.base.benef = new Set(linha.benef)
      else for (const b of linha.benef) g.base.benef.add(b)
    }
    const rot = rotuloPrestador(linha.nome)
    g.rotulos.set(rot, (g.rotulos.get(rot) ?? 0) + linha.eventos)
  }
  return [...grupos.values()].map(({ base, rotulos }) => {
    const melhor = [...rotulos.entries()].sort(
      (a, b) => b[1] - a[1] || b[0].length - a[0].length,
    )[0]
    return { ...base, nome: melhor ? melhor[0] : base.nome }
  })
}
