import './globals.css';

export const metadata = {
  title: 'Book Kartu Animein',
  description: 'Galeri book kartu Animein — login dengan kode pairing',
};

// Set tema sebelum render agar tidak kedip saat dark mode aktif.
const themeInitScript = `(function(){try{var t=localStorage.getItem('cards-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
