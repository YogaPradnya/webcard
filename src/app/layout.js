import './globals.css';
import { Plus_Jakarta_Sans, Sora } from 'next/font/google';

const bodyFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});

const displayFont = Sora({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'Book Kartu Animein',
  description: 'Galeri book 200 kartu Animein — trade, battle PvP, grup chat. Login tanpa password via kode pairing.',
  keywords: ['animein', 'kartu anime', 'gacha', 'trade kartu', 'battle kartu'],
  openGraph: {
    title: 'Book Kartu Animein',
    description: 'Kumpulkan 200 kartu, trade dengan teman, battle PvP interaktif.',
    type: 'website',
    locale: 'id_ID',
  },
  robots: 'index, follow',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1f2b',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="dark" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
