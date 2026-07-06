import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import {
  CadastroMasterClient,
  type ImportacaoHistorico,
} from './cadastro-master-client'

export const metadata = {
  title: 'Cadastro Mestre | Winners Health Intelligence',
  description:
    'Importe e enriqueça o Cadastro Mestre de beneficiários e acompanhe a evolução da qualidade cadastral.',
}

type QualidadeSnapshot = ImportacaoHistorico['qualidadeAntes']

export default async function CadastroMasterPage() {
  const supabase = await createClient()

  const [{ count }, { data: imps }] = await Promise.all([
    supabase
      .from('beneficiarios_master')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('cadastro_master_importacoes')
      .select(
        'id, arquivo_nome, total_linhas, atualizados, novos, nao_encontrados, duplicidades, qualidade_antes, qualidade_depois, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const historico: ImportacaoHistorico[] = (
    (imps ?? []) as Record<string, unknown>[]
  ).map((i) => ({
    id: i.id as string,
    arquivo: (i.arquivo_nome as string) ?? 'arquivo',
    total: Number(i.total_linhas ?? 0),
    atualizados: Number(i.atualizados ?? 0),
    novos: Number(i.novos ?? 0),
    naoEncontrados: Number(i.nao_encontrados ?? 0),
    duplicidades: Number(i.duplicidades ?? 0),
    qualidadeAntes: (i.qualidade_antes as QualidadeSnapshot) ?? null,
    qualidadeDepois: (i.qualidade_depois as QualidadeSnapshot) ?? null,
    criadoEm: i.created_at as string,
  }))

  return (
    <DashboardShell title="Cadastro Mestre">
      <CadastroMasterClient historico={historico} totalMaster={count ?? 0} />
    </DashboardShell>
  )
}
