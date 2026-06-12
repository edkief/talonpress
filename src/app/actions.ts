'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { disablePackage, enablePackage, deletePackage, updateDefaultPage } from '@/lib/storage/deployments'

export async function disablePackageAction(id: string): Promise<void> {
  await disablePackage(id)
  revalidatePath('/')
  revalidatePath('/packages')
  revalidatePath(`/packages/${id}`)
}

export async function enablePackageAction(id: string): Promise<void> {
  await enablePackage(id)
  revalidatePath('/')
  revalidatePath('/packages')
  revalidatePath(`/packages/${id}`)
}

export async function deletePackageAction(id: string): Promise<void> {
  await deletePackage(id)
  revalidatePath('/')
  revalidatePath('/packages')
  redirect('/packages')
}

export async function updateDefaultPageAction(id: string, defaultPage: string): Promise<void> {
  await updateDefaultPage(id, defaultPage.trim())
  revalidatePath(`/packages/${id}`)
}
