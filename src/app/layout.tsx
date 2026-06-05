import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TalonPress',
  description: 'OpenTalon Web Publisher',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
