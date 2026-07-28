import { config } from '../config'

export function packageAccessUrl(id: string, token?: string): string {
  const base = `${config.publicBaseUrl}/pub/${id}`
  return token ? `${base}?token=${token}` : base
}