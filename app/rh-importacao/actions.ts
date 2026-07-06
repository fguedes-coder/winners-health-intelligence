'use server'

import * as XLSX from 'xlsx'
import { loadMasterIndex } from '@/lib/cadastro-master/read'
import { mapearLinhaRh, normalizarLinhaRh, type LinhaRh } from '@/lib/rh-importacao/parse'
import {
  conferirBeneficiarios,
  type ConferenciaRhResult,
} from '@/lib/rh-importacao/matching'

// Escolhe a planilha com dados de RH (cabeçalho com nome/cpf/matricula/carteirinha).
function escolherLinhas(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const temChaves = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return false
    const headers = Object.keys(rows[0]).map((h) =>
      h
        .normalize('NFD')
        .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
        .toLowerCase(),
    )
    return headers.some(
      (h) =>
        h.includes('nome') ||
        h.includes('cpf') ||
        h.includes('carteir') ||
        h.includes('matricula'),
    )
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
      defval: null,
      raw: false,
    })
    if (temChaves(rows)) return rows
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
      defval: null,
      raw: false,
    })
    if (rows.length > 0) return rows
  }
  return []
}

// Só leitura: parseia o arquivo, carrega o Cadastro Mestre (SELECT) e cruza
// em memória. Não grava nada no Supabase — gera apenas o relatório de
// conferência (encontrados / não encontrados / conflitos).
export async function conferirImportacaoRh(
  formData: FormData,
): Promise<ConferenciaRhResult> {
  const file = formData.get('arquivo')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo XLSX ou CSV.' }
  }

  let linhas: LinhaRh[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = escolherLinhas(wb)
    linhas = rows
      .map((r) => normalizarLinhaRh(mapearLinhaRh(r)))
      .filter((l): l is LinhaRh => l !== null)
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }
  if (linhas.length === 0) {
    return {
      error:
        'Nenhuma linha reconhecida. Confira se há colunas como Nome, CPF, Carteirinha ou Matrícula.',
    }
  }

  const masterIndex = await loadMasterIndex()
  const beneficiarios = masterIndex.list.map((m) => ({
    id: m.id,
    carteirinha: m.carteirinha,
    cpf: m.cpf,
    matricula: m.matricula,
    nome: m.nome,
  }))

  const relatorio = conferirBeneficiarios(linhas, beneficiarios)

  return { arquivoNome: file.name, relatorio }
}
