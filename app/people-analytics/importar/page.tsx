import { DashboardShell } from '@/components/dashboard-shell'
import { PeopleNav } from '@/components/people/people-nav'
import { listarImportacoes, getVidasSaude } from '@/lib/people-analytics/data'
import { ImportarClient } from './importar-client'

export const metadata = {
  title: 'Importar Arquivo RH | People Analytics & Saúde',
  description:
    'Importe a base de RH/OKR (XLSX ou CSV) e cruze automaticamente com a base assistencial.',
}

export default async function ImportarRhPage() {
  const [importacoes, vidas] = await Promise.all([
    listarImportacoes(),
    getVidasSaude(),
  ])

  return (
    <DashboardShell title="People Analytics & Saúde">
      <div className="flex flex-col gap-6">
        <PeopleNav />
        <ImportarClient
          historico={importacoes.map((i) => ({
            id: i.id,
            arquivo: i.arquivo_nome,
            total: i.total_colaboradores,
            aptos: i.total_aptos,
            okrMedio: Number(i.okr_medio),
            ativo: i.ativo,
            criadoEm: i.created_at,
          }))}
          totalVidasSaude={vidas.length}
        />
      </div>
    </DashboardShell>
  )
}
