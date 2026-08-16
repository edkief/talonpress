import LandingHero from '@/components/LandingHero'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

/**
 * Public root. The management dashboard lives under `/admin`, which the proxy
 * gates as a single prefix — so nothing here is a security boundary. `getAccess`
 * is read only to choose the wording and whether to offer a dashboard link;
 * showing that link to a non-admin reveals nothing, since `/admin` is gated.
 */
export default async function HomePage() {
  const access = await getAccess()

  return (
    <LandingHero
      authenticated={access.authenticated}
      username={access.username}
      isAdmin={access.isAdmin}
    />
  )
}
