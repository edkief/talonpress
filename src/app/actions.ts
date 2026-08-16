'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  disablePackage,
  enablePackage,
  deletePackage,
  updateDefaultPage,
  updateVisibility,
  renewPackageToken,
} from '@/lib/storage/deployments'
import type { Visibility } from '@/lib/storage/types'

export async function disablePackageAction(id: string): Promise<void> {
  await disablePackage(id)
  revalidatePath('/admin')
  revalidatePath('/admin/packages')
  revalidatePath(`/admin/packages/${id}`)
}

export async function enablePackageAction(id: string): Promise<void> {
  await enablePackage(id)
  revalidatePath('/admin')
  revalidatePath('/admin/packages')
  revalidatePath(`/admin/packages/${id}`)
}

export async function setVisibilityAction(id: string, visibility: Visibility): Promise<void> {
  await updateVisibility(id, visibility)
  revalidatePath('/admin')
  revalidatePath('/admin/packages')
  revalidatePath(`/admin/packages/${id}`)
}

export async function renewTokenAction(id: string): Promise<void> {
  await renewPackageToken(id)
  revalidatePath('/admin')
  revalidatePath('/admin/packages')
  revalidatePath(`/admin/packages/${id}`)
}

export async function deletePackageAction(id: string): Promise<void> {
  await deletePackage(id)
  revalidatePath('/admin')
  revalidatePath('/admin/packages')
  redirect('/admin/packages')
}

export async function updateDefaultPageAction(id: string, defaultPage: string): Promise<void> {
  await updateDefaultPage(id, defaultPage.trim())
  revalidatePath(`/admin/packages/${id}`)
}
