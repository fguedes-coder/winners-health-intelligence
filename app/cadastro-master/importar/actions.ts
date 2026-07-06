'use server'

import { revalidatePath } from 'next/cache'
import {
  importarCadastroMaster,
  type ImportarMasterResult,
} from '@/lib/cadastro-master/import'

export async function importarMaster(
  formData: FormData,
): Promise<ImportarMasterResult> {
  const file = formData.get('arquivo')
  if (!(file instanceof File)) {
    return { error: 'Selecione um arquivo CSV ou XLSX.' }
  }

  const res = await importarCadastroMaster(file)

  if (!res.error) {
    // O Cadastro Mestre alimenta as telas de beneficiários/diagnóstico.
    revalidatePath('/cadastro-master/importar')
    revalidatePath('/colaboradores')
    revalidatePath('/colaboradores/diagnostico')
  }

  return res
}
