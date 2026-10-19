import Link from 'next/link';
import PublicShell from '@/components/PublicShell';
import cardArt from '@/data/cardArtCloud.json';
import { optImg } from '@/lib/images';
import {
  CS_EMAIL,
  CS_EMAIL_URL,
  CS_HOURS,
  CS_RESPONSE_NOTE,
  CS_WHATSAPP,
  CS_WHATSAPP_URL,
} from '@/lib/contact';
import { LEGAL_LINKS } from '@/lib/legal';
import { idr } from '@/lib/money';
import {
  MAX_EDITS_PER_SLOT,
  MAX_SLOTS_PER_USER,
  PRODUCT_NOTES,
  SLOT_PRICE_IDR,
  XP_PACKS,
} from '@/lib/products';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

export const metadata = {
  title: 'Animein — Book Kartu Anime, Gacha, Trade & Battle',
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Animein — Book Kartu Anime',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'id_ID',
  },
};

const FEATURED_CARDS = [
  {
    name: 'Sung Jinwoo',
    anime: 'Solo Leveling',
    tier: 'Mythic',
    imageUrl: cardArt['sung jinwoo'],
    className: 'hero-card-a',
  },
  {
    name: 'Gojo Satoru',
    anime: 'Jujutsu Kaisen',
    tier: 'Legendary',
    imageUrl: cardArt['gojo satoru'],
    className: 'hero-card-b',
  },
];

const HOW_TO = [
  {
    step: '01',
    title: 'Masuk dengan akun Animein',
    body: 'Buka halaman login, tekan Dapatkan Kode, lalu kirim .login KODE lewat chat bot Animein. Tidak perlu password.',
  },
  {
    step: '02',
    title: 'Pilih produk digital',
    body: 'Buka Shop untuk memilih paket Top-Up XP atau slot Kartu Pajangan Custom. Harga dan isi produk tampil jelas sebelum checkout.',
  },
  {
    step: '03',
    title: 'Bayar QRIS, pesanan diproses',
    body: 'Pembayaran QRIS diproses melalui Tripay. XP masuk otomatis setelah pembayaran sukses; kartu custom dikerjakan maksimal 3x24 jam.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: CS_EMAIL,
    telephone: CS_WHATSAPP,
    availableLanguage: ['id'],
  },
};

export default function HomePage() {
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="public-page">
        <section className="public-hero">
          <div className="public-hero-copy">
            <div className="public-eyebrow">Komunitas anime digital</div>
            <h1>Koleksi kartu anime. Gacha, trade, dan battle.</h1>
            <p className="public-lead">
              {SITE_TAGLINE} Login tanpa password, kumpulkan kartu, tantang pemain lain,
              dan lengkapi koleksimu di Book Kartu Animein.
            </p>
            <div className="public-actions">
              <Link className="btn" href="/login">Masuk / Buka Book</Link>
              <Link className="btn btn-ghost" href="/shop">Lihat Shop</Link>
            </div>
            <div className="public-trust">
              <span>Login tanpa password</span>
              <span>QRIS via Tripay</span>
              <span>Produk digital</span>
            </div>
          </div>

          <div className="public-hero-art">
            {FEATURED_CARDS.map((card) => (
              <div className={`public-hero-card ${card.className}`} key={card.name}>
                {card.imageUrl ? (
                  <img
                    className="hero-card-img"
                    src={optImg(card.imageUrl, 500)}
                    alt={`Kartu ${card.name} dari ${card.anime}`}
                    loading="eager"
                    decoding="async"
                  />
                ) : null}
                <div className="hero-card-body">
                  <span className="hero-card-tier">{card.tier.toUpperCase()}</span>
                  <span className="hero-card-name">{card.name}</span>
                  <span className="hero-card-meta">{card.anime}</span>
                </div>
              </div>
            ))}
            <div className="public-hero-badge">Animein</div>
          </div>
        </section>

        <section className="public-section" id="produk">
          <div className="public-section-head">
            <div className="public-eyebrow">Produk</div>
            <h2>Produk digital yang dijual</h2>
            <p>
              Semua produk digunakan di platform Animein. Tidak ada barang fisik dan
              tidak ada pengiriman fisik. Pembelian memerlukan akun Animein.
            </p>
          </div>

          <div className="public-product-grid">
            <article className="card public-product">
              <div className="public-product-top">
                <div>
                  <div className="public-product-kicker">Top-Up</div>
                  <h3>XP Animein</h3>
                </div>
                <span className="public-badge">Instan</span>
              </div>
              <p className="public-product-desc">
                XP untuk gacha kartu, battle, dan kebutuhan lain di web maupun chat bot.
                XP otomatis masuk setelah pembayaran terverifikasi sukses.
              </p>
              <div className="public-price-list">
                {XP_PACKS.map((pack) => (
                  <div className="public-price-row" key={pack.id}>
                    <span>{pack.xp.toLocaleString('id-ID')} XP</span>
                    <strong>{idr(pack.priceIdr)}</strong>
                  </div>
                ))}
              </div>
              <div className="public-product-foot">
                <span>Pilih paket di halaman Shop.</span>
                <Link href="/shop">Beli XP →</Link>
              </div>
            </article>

            <article className="card public-product">
              <div className="public-product-top">
                <div>
                  <div className="public-product-kicker">Custom</div>
                  <h3>Slot Kartu Pajangan</h3>
                </div>
                <span className="public-badge">Display-only</span>
              </div>
              <div className="public-price-highlight">
                {idr(SLOT_PRICE_IDR)}<span>/slot</span>
              </div>
              <ul className="public-list">
                <li>1 slot = 1 kartu pajangan custom (nama, gambar, border).</li>
                <li>Maksimal {MAX_SLOTS_PER_USER} slot per pengguna.</li>
                <li>{MAX_EDITS_PER_SLOT}x jatah ubah per slot; setiap Simpan memakai 1 jatah.</li>
                <li>Hanya untuk pajangan profil dan koleksi, tidak untuk battle/trade.</li>
                <li>Pengerjaan kartu awal maksimal 3x24 jam setelah pembayaran.</li>
              </ul>
              <div className="public-product-foot">
                <span>Atur kartu di tab Pajangan Book.</span>
                <Link href="/shop">Beli slot →</Link>
              </div>
            </article>
          </div>

          <div className="card public-note">
            <strong>Catatan pembelian:</strong>
            <ul>
              {PRODUCT_NOTES.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <p>
              Dengan membeli, kamu menyetujui{' '}
              <Link href="/terms">Syarat &amp; Ketentuan</Link>,{' '}
              <Link href="/privacy">Kebijakan Privasi</Link>, dan{' '}
              <Link href="/refund">Kebijakan Refund</Link>.
            </p>
          </div>
        </section>

        <section className="public-section" id="cara">
          <div className="public-section-head">
            <div className="public-eyebrow">Cara kerja</div>
            <h2>Mulai dalam tiga langkah</h2>
          </div>
          <div className="public-step-grid">
            {HOW_TO.map((item) => (
              <div className="card public-step" key={item.step}>
                <div className="public-step-num">{item.step}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section" id="legal">
          <div className="public-section-head">
            <div className="public-eyebrow">Transparansi</div>
            <h2>Legal dan kebijakan</h2>
            <p>
              Informasi mengenai aturan penggunaan, data pribadi, pengembalian dana,
              dan bantuan tersedia di halaman terpisah.
            </p>
          </div>
          <div className="public-legal-grid">
            {LEGAL_LINKS.map((link) => (
              <Link className="card public-legal-card" href={link.href} key={link.href}>
                <strong>{link.label}</strong>
                <span>{link.description}</span>
                <span className="public-legal-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="public-section public-contact" id="kontak">
          <div className="card public-contact-card">
            <div>
              <div className="public-eyebrow">Customer Service</div>
              <h2>Butuh bantuan?</h2>
              <p>
                Hubungi CS Animein untuk kendala akun, pembayaran, pesanan, atau refund.
                Sertakan username, Order ID, dan bukti pembayaran agar lebih cepat diproses.
              </p>
              <div className="public-contact-hours">{CS_HOURS}</div>
              <div className="public-contact-note">{CS_RESPONSE_NOTE}</div>
            </div>
            <div className="public-contact-links">
              <a href={CS_EMAIL_URL}>
                <span className="contact-ico" aria-hidden="true">✉</span>
                <span>
                  <span className="contact-label">Email CS</span>
                  <span className="contact-value">{CS_EMAIL}</span>
                </span>
              </a>
              <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <span className="contact-ico" aria-hidden="true">☎</span>
                <span>
                  <span className="contact-label">WhatsApp CS</span>
                  <span className="contact-value">{CS_WHATSAPP}</span>
                </span>
              </a>
              <Link href="/contact" className="btn btn-ghost">Buka halaman kontak</Link>
            </div>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
