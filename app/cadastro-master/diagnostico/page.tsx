import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { normalizarNome } from '@/lib/people-analytics/rh'
import { variantesCarteirinha } from '@/lib/cadastro-master/preview'

export const metadata = {
  title: 'Diagnóstico de Duplicidades | Winners Health Intelligence',
  description:
    'Ferramenta temporária de investigação (somente leitura) — lista duplicidades em beneficiarios_master e o histórico de importações do Cadastro Mestre.',
}

type LinhaMaster = Record<string, unknown> & { id: string; nome?: string | null }
type LinhaVidas = Record<string, unknown>

const PAGE = 1000

async function carregarTudo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabela: string,
  colunas = '*',
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// Heurística: carteirinha "crua" no formato do MECSAS (prefixo "567" +
// 16 dígitos + 1 dígito verificador, 20 caracteres) — é exatamente o que
// o INSERT antigo (já removido do código) gravava para "não encontrados".
// Uma carteirinha nesse formato exato, coexistindo com outra mais curta
// para o mesmo nome, é o sinal mais forte de duplicata criada pelo bug.
function pareceCarteirinhaMecsasBruta(carteirinha: unknown): boolean {
  if (typeof carteirinha !== 'string') return false
  return /^567\d{17}$/.test(carteirinha)
}

export default async function DiagnosticoDuplicidadesPage() {
  const supabase = await createClient()

  const [todos, vidas, { data: importacoes }] = await Promise.all([
    carregarTudo(supabase, 'beneficiarios_master') as Promise<LinhaMaster[]>,
    carregarTudo(
      supabase,
      'beneficiario_vidas',
      'carteirinha, nome, cpf, tipo, plano, empresa, status, competencia',
    ) as Promise<LinhaVidas[]>,
    supabase
      .from('cadastro_master_importacoes')
      .select(
        'id, arquivo_nome, total_linhas, atualizados, novos, nao_encontrados, duplicidades, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Índice de beneficiario_vidas por carteirinha, pegando a competência mais
  // recente por chave — esta tabela NUNCA foi escrita pela tela Atualizar
  // Cadastro, então serve de referência do valor original.
  const vidasPorCarteirinha = new Map<string, LinhaVidas>()
  for (const v of vidas) {
    const cart = typeof v.carteirinha === 'string' ? v.carteirinha.trim() : ''
    if (!cart) continue
    const existente = vidasPorCarteirinha.get(cart)
    if (!existente || String(v.competencia ?? '') > String(existente.competencia ?? '')) {
      vidasPorCarteirinha.set(cart, v)
    }
  }

  // Verifica TODOS os registros do master (não só os duplicados por nome):
  // quantos têm carteirinha no formato bruto do MECSAS (candidatos a estarem
  // "desalinhados" da população real em beneficiario_vidas/eventos), e para
  // esses, se a versão reduzida (mesma lógica usada no matching real) bate
  // com um registro existente em beneficiario_vidas.
  const analiseCarteirinhas = todos.map((r) => {
    const cart = typeof r.carteirinha === 'string' ? r.carteirinha : ''
    const bruta = pareceCarteirinhaMecsasBruta(cart)
    if (!bruta) return { registro: r, bruta: false as const }
    const variantes = variantesCarteirinha(cart)
    const reduzidaComMatch = variantes.find((v) => vidasPorCarteirinha.has(v))
    return {
      registro: r,
      bruta: true as const,
      reduzidaSugerida: reduzidaComMatch ?? variantes[variantes.length - 1] ?? null,
      temCorrespondencia: Boolean(reduzidaComMatch),
    }
  })
  const comCarteirinhaBruta = analiseCarteirinhas.filter((a) => a.bruta) as Extract<
    (typeof analiseCarteirinhas)[number],
    { bruta: true }
  >[]
  const comCorrespondencia = comCarteirinhaBruta.filter((a) => a.temCorrespondencia)
  const semCorrespondencia = comCarteirinhaBruta.filter((a) => !a.temCorrespondencia)

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

  // Plano de correção sugerido: para cada grupo duplicado, separa a(s) linha(s)
  // com carteirinha no formato cru do MECSAS (candidata a remover) das demais
  // (registro original), e compara plano/empresa/tipo/status do original
  // contra beneficiario_vidas (nunca escrita por esta tela) para sinalizar
  // divergência introduzida.
  const CAMPOS_COMPARAR = ['plano', 'empresa', 'tipo', 'status'] as const
  const planoSugerido = duplicados.map(([nomeNorm, rows]) => {
    const candidatasRemover = rows.filter((r) => pareceCarteirinhaMecsasBruta(r.carteirinha))
    const originais = rows.filter((r) => !pareceCarteirinhaMecsasBruta(r.carteirinha))
    const referencias = originais.map((original) => {
      const cart = typeof original.carteirinha === 'string' ? original.carteirinha.trim() : ''
      const vida = vidasPorCarteirinha.get(cart)
      const divergencias = CAMPOS_COMPARAR.filter((campo) => {
        if (!vida) return false
        const atual = original[campo]
        const referencia = vida[campo]
        if (referencia == null || referencia === '') return false
        return String(atual ?? '').trim() !== String(referencia).trim()
      }).map((campo) => ({
        campo,
        atual: original[campo] as string | null,
        referencia: vida?.[campo] as string | null,
      }))
      return { original, vida, divergencias }
    })
    return { nomeNorm, candidatasRemover, referencias }
  })
  const totalRemover = planoSugerido.reduce((s, p) => s + p.candidatasRemover.length, 0)
  const totalComDivergencia = planoSugerido.filter((p) =>
    p.referencias.some((r) => r.divergencias.length > 0),
  ).length

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

        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Achado principal: carteirinha em formato errado, não duplicidade interna
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            De <strong>{todos.length}</strong> registros em <code>beneficiarios_master</code>,{' '}
            <strong>{comCarteirinhaBruta.length}</strong> têm a carteirinha no formato bruto do
            MECSAS (prefixo &quot;567&quot; + dígito verificador) em vez do formato reduzido usado
            em <code>beneficiario_vidas</code>/<code>eventos_utilizacao</code>. Isso faz cada um
            desses registros aparecer como uma pessoa diferente do beneficiário real na tela
            Beneficiários (é o caso da Amanda).
          </p>
          <p className="mb-3 text-sm">
            Destes, <strong className="text-success">{comCorrespondencia.length}</strong> têm uma
            carteirinha reduzida que bate exatamente com um registro em{' '}
            <code>beneficiario_vidas</code> (candidatos seguros a corrigir só a carteirinha, sem
            perder o CPF/data de nascimento já preenchidos) e{' '}
            <strong className="text-warning">{semCorrespondencia.length}</strong> não têm
            correspondência encontrada (precisam de revisão manual antes de qualquer correção).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1">id</th>
                  <th className="p-1">nome</th>
                  <th className="p-1">carteirinha atual (bruta)</th>
                  <th className="p-1">carteirinha reduzida sugerida</th>
                  <th className="p-1">bate com beneficiario_vidas?</th>
                </tr>
              </thead>
              <tbody>
                {comCarteirinhaBruta.map((a) => (
                  <tr key={a.registro.id} className="border-t border-border/40">
                    <td className="p-1 font-mono">{a.registro.id}</td>
                    <td className="p-1">{String(a.registro.nome ?? '—')}</td>
                    <td className="p-1">{String(a.registro.carteirinha)}</td>
                    <td className="p-1">{a.reduzidaSugerida ?? '—'}</td>
                    <td className="p-1">
                      {a.temCorrespondencia ? (
                        <span className="text-success">sim</span>
                      ) : (
                        <span className="text-warning">não</span>
                      )}
                    </td>
                  </tr>
                ))}
                {comCarteirinhaBruta.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-1 text-muted-foreground">
                      Nenhum registro com carteirinha no formato bruto do MECSAS.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Plano de correção sugerido (nenhuma ação foi executada)
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Critério: candidata a remover = carteirinha no formato cru do MECSAS (prefixo
            &quot;567&quot; + 17 dígitos, 20 no total) coexistindo com outra carteirinha mais curta
            para o mesmo nome. Divergência = plano/empresa/tipo/status do registro original
            diferente do que está em <code>beneficiario_vidas</code> (tabela nunca escrita por
            esta tela, usada como referência).
          </p>
          <p className="mb-3 text-sm">
            <strong>{totalRemover}</strong> registro(s) candidato(s) a remoção,{' '}
            <strong>{totalComDivergencia}</strong> nome(s) com possível divergência de
            plano/empresa/tipo/status a reverter.
          </p>
          {planoSugerido.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma duplicidade detectada.</p>
          )}
          <div className="flex flex-col gap-3">
            {planoSugerido.map(({ nomeNorm, candidatasRemover, referencias }) => (
              <div key={nomeNorm} className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-sm font-medium text-foreground">{nomeNorm}</p>
                {candidatasRemover.map((r) => (
                  <p key={r.id} className="text-xs text-destructive">
                    Remover: id <span className="font-mono">{r.id}</span> — carteirinha{' '}
                    {String(r.carteirinha)} (formato cru MECSAS, sem vínculo/utilização esperados)
                  </p>
                ))}
                {referencias.map(({ original, vida, divergencias }) => (
                  <div key={original.id} className="mt-1">
                    <p className="text-xs text-success">
                      Manter (original): id <span className="font-mono">{original.id}</span> —
                      carteirinha {String(original.carteirinha)}
                    </p>
                    {!vida && (
                      <p className="text-xs text-muted-foreground">
                        Sem registro correspondente em beneficiario_vidas para comparar.
                      </p>
                    )}
                    {divergencias.length > 0 && (
                      <ul className="ml-4 list-disc text-xs text-warning">
                        {divergencias.map((d) => (
                          <li key={d.campo}>
                            {d.campo}: atual &quot;{d.atual ?? '—'}&quot; → referência (vidas)
                            &quot;{d.referencia ?? '—'}&quot;
                          </li>
                        ))}
                      </ul>
                    )}
                    {vida && divergencias.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Sem divergência detectada contra beneficiario_vidas.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
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
