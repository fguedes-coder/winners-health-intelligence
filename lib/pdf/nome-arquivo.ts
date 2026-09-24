// Nome com que o relatório executivo é salvo pelo usuário.

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** "2026-08" → { mes: 'Agosto', ano: '2026' }. */
function partesCompetencia(c: string): { mes: string; ano: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(c)
  return m ? { mes: MESES_NOME[Number(m[2]) - 1], ano: m[1] } : null
}

/**
 * Período por extenso para o nome do arquivo:
 *   ago/26            → "Agosto de 2026"
 *   mar/26 a ago/26   → "Março a Agosto de 2026"
 *   nov/25 a ago/26   → "Novembro de 2025 a Agosto de 2026"
 */
export function periodoPorExtenso(ini: string | null, fim: string | null): string {
  const a = ini ? partesCompetencia(ini) : null
  const b = fim ? partesCompetencia(fim) : null
  if (!a && !b) return 'Período Atual'
  if (!a || !b || ini === fim) {
    const u = (b ?? a)!
    return `${u.mes} de ${u.ano}`
  }
  return a.ano === b.ano
    ? `${a.mes} a ${b.mes} de ${b.ano}`
    : `${a.mes} de ${a.ano} a ${b.mes} de ${b.ano}`
}

/**
 * Nome com que o PDF é salvo: "Relatório Executivo - DMS LOG (Agosto de 2026)".
 * A versão identificada leva o sufixo " - Identificado": é a que contém nomes,
 * e não pode sair com o mesmo nome da versão que vai para o cliente.
 */
export function nomeRelatorio(cliente: string, periodo: string, identificado: boolean): string {
  const limpo = cliente.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Cliente'
  return `Relatório Executivo - ${limpo} (${periodo})${identificado ? ' - Identificado' : ''}`
}

/**
 * Content-Disposition com o nome acentuado (RFC 5987) e fallback ASCII para
 * navegadores antigos. É desse cabeçalho que o "Salvar" do visualizador de
 * PDF do Chrome/Edge tira o nome sugerido.
 */
export function contentDisposition(nomeArquivo: string): string {
  const ascii = nomeArquivo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '')
  const utf8 = encodeURIComponent(nomeArquivo).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`
}
