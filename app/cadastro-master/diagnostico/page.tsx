import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { normalizarNome } from '@/lib/people-analytics/rh'

export const metadata = {
  title: 'Diagnóstico de Duplicidades | Winners Health Intelligence',
  description:
    'Ferramenta temporária de investigação (somente leitura) — lista duplicidades em beneficiarios_master e o histórico de importações do Cadastro Mestre.',
}

type LinhaMaster = Record<string, unknown> & { id: string; nome?: string | null }

const COLS = '*'
const PAGE = 1000

async function carregarTudo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LinhaMaster[]> {
  const out: LinhaMaster[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('beneficiarios_master')
      .select(COLS)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    out.push(...(data as LinhaMaster[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

export default async function DiagnosticoDuplicidadesPage() {
  const supabase = await createClient()

  const [todos, { data: importacoes }] = await Promise.all([
    carregarTudo(supabase),
    supabase
      .from('cadastro_master_importacoes')
      .select(
        'id, arquivo_nome, total_linhas, atualizados, novos, nao_encontrados, duplicidades, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const porNome = new Map<string, LinhaMaster[]>()
  for (const r of todos) {
    const nome = typeof r.nome === 'string' ? r.nome : ''
    const chave = normalizarNome(nome)
    if (!chave) continue
    const arr = porNome.get(chave) ?? []
    arr.push(r)
    porNome.set(chave, arr)
  }
  const duplicados = [...porNome.entries()].filter(([, rows]) => rows.length > 1)

  const colunas =
    todos.length > 0
      ? Object.keys(todos[0]).filter((c) => c !== 'id')
      : []

  return (
    <DashboardShell title="Diagnóstico de Duplicidades (temporário)">
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Ferramenta temporária de investigação — 100% somente leitura, nenhuma escrita é feita
            nesta página.
          </p>
          <p className="mt-1">
            Total em <code>beneficiarios_master</code>: <strong>{todos.length}</strong>. Nomes
            normalizados com mais de um registro: <strong>{duplicados.length}</strong>.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            Histórico de importações do Cadastro Mestre (últimas 20)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Arquivo</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Atualizados</th>
                  <th className="p-2">Novos</th>
                  <th className="p-2">Não encontrados</th>
                  <th className="p-2">Duplicidades</th>
                  <th className="p-2">Criado em</th>
                  <th className="p-2">ID</th>
                </tr>
              </thead>
              <tbody>
                {(importacoes ?? []).map((i) => (
                  <tr key={i.id as string} className="border-b border-border/50">
                    <td className="p-2">{i.arquivo_nome as string}</td>
                    <td className="p-2">{i.total_linhas as number}</td>
                    <td className="p-2">{i.atualizados as number}</td>
                    <td className="p-2">{i.novos as number}</td>
                    <td className="p-2">{i.nao_encontrados as number}</td>
                    <td className="p-2">{i.duplicidades as number}</td>
                    <td className="p-2">
                      {new Date(i.created_at as string).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2 font-mono text-xs">{i.id as string}</td>
                  </tr>
                ))}
                {(!importacoes || importacoes.length === 0) && (
                  <tr>
                    <td colSpan={8} className="p-2 text-muted-foreground">
                      Nenhuma importação registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            Nomes com mais de um registro em beneficiarios_master ({duplicados.length})
          </h2>
          {duplicados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma duplicidade encontrada por nome normalizado.
            </p>
          )}
          <div className="flex flex-col gap-4">
            {duplicados.map(([nomeNorm, rows]) => (
              <div
                key={nomeNorm}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <p className="mb-2 text-sm font-medium text-foreground">
                  {nomeNorm} — {rows.length} registros
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="p-1">id</th>
                        {colunas.map((c) => (
                          <th key={c} className="p-1">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="p-1 font-mono">{r.id}</td>
                          {colunas.map((c) => (
                            <td key={c} className="p-1">
                              {r[c] == null || r[c] === '' ? '—' : String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            O que esta página NÃO consegue verificar (precisa ser checado direto no painel do
            Supabase):
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              Triggers na tabela: Supabase Dashboard → Database → Triggers (ou{' '}
              <code>
                select * from information_schema.triggers where event_object_table =
                &apos;beneficiarios_master&apos;;
              </code>{' '}
              no SQL Editor).
            </li>
            <li>
              Funções/RPC que gravam na tabela: Database → Functions.
            </li>
            <li>
              Se <code>beneficiarios_master</code> é view em vez de tabela real: Table Editor →
              conferir o tipo.
            </li>
            <li>
              Regras de UPSERT/constraint (ex.: falta de unique constraint em carteirinha/cpf
              permitindo duplicidade): Database → Tables → beneficiarios_master → Constraints.
            </li>
          </ul>
        </div>
      </div>
    </DashboardShell>
  )
}
