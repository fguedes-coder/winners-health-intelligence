import * as XLSX from 'xlsx'
import type { ColaboradorRow } from '@/lib/queries'

// Filtros de exportação, alinhados com os do menu Beneficiários.
export type ExportFiltro =
  | 'todos'
  | 'titulares'
  | 'dependentes'
  | 'com'
  | 'sem'

export const EXPORT_FILTROS: { value: ExportFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'titulares', label: 'Titulares' },
  { value: 'dependentes', label: 'Dependentes' },
  { value: 'com', label: 'Com utilização' },
  { value: 'sem', label: 'Sem utilização' },
]

function tipoLabel(c: ColaboradorRow): string {
  if (c.vinculo === 'TITULAR') return 'Titular'
  if (c.vinculo === 'DEPENDENTE') return 'Dependente'
  // Mantém o rótulo bruto quando não classificado, ou vazio.
  return c.tipoBeneficiario ?? 'Não classificado'
}

function nascimentoLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

// Aplica o filtro de exportação sobre a lista de beneficiários (a mesma base
// exibida na tela). Não altera dados: apenas seleciona um subconjunto.
export function filtrarParaExport(
  rows: ColaboradorRow[],
  filtro: ExportFiltro,
): ColaboradorRow[] {
  switch (filtro) {
    case 'titulares':
      return rows.filter((c) => c.vinculo === 'TITULAR')
    case 'dependentes':
      return rows.filter((c) => c.vinculo === 'DEPENDENTE')
    case 'com':
      return rows.filter((c) => c.utilizou)
    case 'sem':
      return rows.filter((c) => !c.utilizou)
    case 'todos':
    default:
      return rows
  }
}

// Gera e faz o download de um arquivo .xlsx com as vidas informadas.
// Os dados já vêm consolidados da tela (competência ativa) — esta função é
// puramente client-side e NÃO faz qualquer escrita no banco.
export function exportarBeneficiarios(
  rows: ColaboradorRow[],
  filtro: ExportFiltro,
): number {
  const selecionadas = filtrarParaExport(rows, filtro)

  const linhas = selecionadas.map((c) => ({
    Nome: c.nome ?? '',
    CPF: c.cpf ?? '',
    Carteirinha: c.carteirinha,
    Tipo: tipoLabel(c),
    'Data de nascimento': nascimentoLabel(c.dataNascimento),
    Idade: c.idade ?? '',
    Sexo: c.sexo ?? '',
    Plano: c.plano ?? '',
    'Empresa / Filial': c.empresa ?? '',
    Status: c.status ?? '',
    'Valor utilizado': Number(c.valorUtilizado.toFixed(2)),
    'Quantidade de eventos': c.eventos,
  }))

  const ws = XLSX.utils.json_to_sheet(linhas)
  // Larguras aproximadas para leitura confortável no Excel.
  ws['!cols'] = [
    { wch: 32 }, // Nome
    { wch: 16 }, // CPF
    { wch: 20 }, // Carteirinha
    { wch: 12 }, // Tipo
    { wch: 16 }, // Data de nascimento
    { wch: 7 }, // Idade
    { wch: 6 }, // Sexo
    { wch: 22 }, // Plano
    { wch: 28 }, // Empresa / Filial
    { wch: 10 }, // Status
    { wch: 16 }, // Valor utilizado
    { wch: 20 }, // Quantidade de eventos
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Beneficiários')

  const hoje = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  XLSX.writeFile(wb, `beneficiarios_${hoje}.xlsx`)

  return selecionadas.length
}
