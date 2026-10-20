import './tokens.css';
import './book.css';
import './shell.css';
import './battle.css';
import './components.css';
import './deco.css';
import './public.css';
import { Plus_Jakarta_Sans, Sora } from 'next/font/google';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site';
import DecoLayer from '@/components/DecoLayer';
import ScrollReveal from '@/components/ScrollReveal';
import Splash from '@/components/Splash';
import RouteProgress from '@/components/RouteProgress';

/* Tema musiman hiasan: biarkan '' untuk otomatis dari tanggal,
   atau isi 'sakura' | 'halloween' | 'natal' untuk memaksa (buat testing). */
const SEASON_OVERRIDE = '';

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
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ['kartu', 'book kartu', 'animein', 'kartu anime', 'gacha', 'trade kartu', 'battle kartu', 'top up xp', 'kartu pajangan'],
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
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
  themeColor: '#8ce4f0',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='animein-theme';var s=localStorage.getItem(k);if(s!=='light'&&s!=='dark'){s=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',s);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!('IntersectionObserver' in window))return;if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.classList.add('js-reveal');}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ov=${JSON.stringify(SEASON_OVERRIDE)};var s=ov;if(!s){var d=new Date();var m=d.getMonth()+1;var day=d.getDate();if((m===3&&day>=21)||(m===4&&day<=20))s='sakura';else if(m===10)s='halloween';else if(m===12)s='natal';}document.documentElement.setAttribute('data-season',s||'none');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <RouteProgress />
        <Splash />
        {children}
        <ScrollReveal />
        <DecoLayer />
      </body>
    </html>
  );
}
