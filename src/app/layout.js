import './globals.css';

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
  themeColor: '#000000',
};

// Set tema sebelum render agar tidak kedip saat dark mode aktif.
const themeInitScript = `(function(){try{var t=localStorage.getItem('cards-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
