import Link from 'next/link';
import LegalPage, { LegalSection } from '@/components/LegalPage';
import {
  CS_EMAIL,
  CS_EMAIL_URL,
  CS_HOURS,
  CS_RESPONSE_NOTE,
  CS_WHATSAPP,
  CS_WHATSAPP_URL,
} from '@/lib/contact';

export const metadata = {
  title: 'Kontak Support',
  description:
    'Hubungi Customer Service Animein melalui email atau WhatsApp. Jam operasional 08.00–23.00 WIB untuk bantuan akun, pembayaran, pesanan, dan refund.',
  alternates: { canonical: '/contact' },
};

const UPDATED = '19 Oktober 2026';

const COMMUNITY = [
  {
    label: 'Grup WhatsApp',
    value: 'Gabung grup komunitas Animein',
    href: 'https://chat.whatsapp.com/FpIkzQ28o8o88vJudiN4SK',
    icon: '◉',
  },
  {
    label: 'Discord',
    value: 'Gabung server Discord Animein',
    href: 'https://discord.gg/22EtRJCvfC',
    icon: '◈',
  },
  {
    label: 'Instagram',
    value: '@animein.aja',
    href: 'https://www.instagram.com/animein.aja',
    icon: '★',
  },
];

export default function ContactPage() {
  return (
    <LegalPage
      title="Kontak Support"
      updated={UPDATED}
      active="/contact"
      intro={
        <>
          Customer Service Animein membantu pertanyaan mengenai akun, pembayaran,
          pesanan, kartu custom, dan refund. Gunakan kanal resmi di halaman ini
          agar permintaanmu tercatat dan diproses dengan benar.
        </>
      }
    >
      <LegalSection title="1. Kanal Resmi Customer Service">
        <div className="contact-grid legal-contact-grid">
          <a className="contact-link" href={CS_EMAIL_URL}>
            <span className="contact-ico" aria-hidden="true">✉</span>
            <span className="contact-copy">
              <span className="contact-label">Email CS</span>
              <span className="contact-value">{CS_EMAIL}</span>
            </span>
          </a>
          <a
            className="contact-link"
            href={CS_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="contact-ico" aria-hidden="true">☎</span>
            <span className="contact-copy">
              <span className="contact-label">WhatsApp CS</span>
              <span className="contact-value">{CS_WHATSAPP}</span>
            </span>
          </a>
        </div>
        <p className="legal-muted">
          Jam operasional: <strong>{CS_HOURS}</strong>. {CS_RESPONSE_NOTE}
        </p>
      </LegalSection>

      <LegalSection title="2. Informasi yang Perlu Disertakan">
        <p>
          Agar kendala dapat diperiksa lebih cepat, sertakan informasi berikut
          saat menghubungi CS:
        </p>
        <ul className="legal-list">
          <li>Username Animein yang digunakan.</li>
          <li>Order ID atau referensi pembayaran.</li>
          <li>Tanggal, nominal, dan metode pembayaran.</li>
          <li>Bukti pembayaran atau tangkapan layar status pesanan.</li>
          <li>Penjelasan singkat mengenai kendala yang dialami.</li>
        </ul>
        <p>
          Jangan mengirim PIN, OTP, password, atau kode rahasia apa pun. CS
          Animein tidak akan meminta data tersebut.
        </p>
      </LegalSection>

      <LegalSection title="3. Bantuan Berdasarkan Kendala">
        <h3>XP belum masuk</h3>
        <p>
          Tunggu beberapa saat setelah pembayaran sukses, lalu cek kembali status
          pesanan di halaman Shop. Jika XP belum masuk setelah 1x24 jam, hubungi
          CS dengan Order ID dan bukti pembayaran.
        </p>
        <h3>Kartu custom belum selesai</h3>
        <p>
          Kartu custom diproses maksimal 3x24 jam setelah pembayaran terverifikasi.
          Jika melewati batas tersebut, hubungi CS dengan detail slot dan bukti
          pembayaran.
        </p>
        <h3>Pembayaran atau refund</h3>
        <p>
          Untuk pembayaran ganda, pembayaran terpotong tetapi pesanan tidak
          berubah, atau pengajuan refund, sertakan bukti pembayaran dan ikuti
          ketentuan pada halaman <Link href="/refund">Kebijakan Refund</Link>.
        </p>
      </LegalSection>

      <LegalSection title="4. Komunitas Animein">
        <p>
          Selain CS, kamu dapat bergabung dengan komunitas untuk informasi,
          diskusi, dan pengumuman:
        </p>
        <div className="contact-grid legal-contact-grid">
          {COMMUNITY.map((item) => (
            <a
              className="contact-link"
              href={item.href}
              key={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="contact-ico" aria-hidden="true">{item.icon}</span>
              <span className="contact-copy">
                <span className="contact-label">{item.label}</span>
                <span className="contact-value">{item.value}</span>
              </span>
            </a>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="5. Dokumen Terkait">
        <p>
          Sebelum menghubungi CS, kamu juga dapat membaca{' '}
          <Link href="/terms">Syarat &amp; Ketentuan</Link>,{' '}
          <Link href="/privacy">Kebijakan Privasi</Link>, dan{' '}
          <Link href="/refund">Kebijakan Refund</Link> untuk informasi mengenai
          aturan layanan, data pribadi, dan pengembalian dana.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
