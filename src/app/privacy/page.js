import Link from 'next/link';
import LegalPage, { LegalSection } from '@/components/LegalPage';
import {
  CS_EMAIL,
  CS_EMAIL_URL,
  CS_HOURS,
  CS_WHATSAPP,
  CS_WHATSAPP_URL,
} from '@/lib/contact';

export const metadata = {
  title: 'Kebijakan Privasi',
  description:
    'Kebijakan privasi KARTU: data yang dikumpulkan, tujuan penggunaan, penyimpanan, pihak ketiga, dan hak pengguna.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = '19 Oktober 2026';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Kebijakan Privasi"
      updated={UPDATED}
      active="/privacy"
      intro={
        <>
          Kebijakan ini menjelaskan bagaimana KARTU mengumpulkan, menggunakan,
          menyimpan, dan melindungi data pengguna saat mengakses Situs KARTU serta
          menggunakan layanan dan produk digitalnya. Kebijakan ini berlaku untuk
          situs <strong>https://kartu.yogaa.web.id</strong> dan layanan Animein
          yang terhubung dengannya.
        </>
      }
    >
      <LegalSection title="1. Data yang Kami Kumpulkan">
        <p>Kami dapat mengumpulkan data berikut:</p>
        <ul className="legal-list">
          <li>
            <strong>Data akun:</strong> username, user ID Animein, status login,
            dan cookie sesi yang diperlukan untuk menjaga sesi masuk.
          </li>
          <li>
            <strong>Data transaksi:</strong> Order ID, jenis produk, jumlah,
            nominal, status pembayaran, metode pembayaran, referensi pembayaran
            dari Tripay, serta waktu transaksi.
          </li>
          <li>
            <strong>Data komunikasi:</strong> username, alamat email atau nomor
            WhatsApp, isi pesan, dan bukti pembayaran yang kamu kirim kepada
            Customer Service.
          </li>
          <li>
            <strong>Konten kartu custom:</strong> nama kartu, gambar, border, dan
            deskripsi yang kamu unggah atau minta untuk Slot Kartu Pajangan
            Custom.
          </li>
          <li>
            <strong>Data teknis:</strong> alamat IP, jenis perangkat/browser,
            halaman yang diakses, waktu akses, dan catatan kesalahan yang dapat
            tercatat otomatis oleh server demi keamanan dan stabilitas layanan.
          </li>
          <li>
            <strong>Preferensi lokal:</strong> tema tampilan, status persetujuan
            Syarat & Ketentuan, dan preferensi lain yang disimpan di browser
            (localStorage).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Tujuan Penggunaan Data">
        <p>Data digunakan untuk:</p>
        <ul className="legal-list">
          <li>Membuat dan menjaga sesi login serta memberikan akses ke akun.</li>
          <li>Memproses pesanan, pembayaran, pengiriman XP, dan pengerjaan kartu custom.</li>
          <li>Menjawab pertanyaan, keluhan, permintaan refund, dan dukungan pengguna.</li>
          <li>Mencegah penyalahgunaan, penipuan, spam, dan aktivitas yang merugikan layanan.</li>
          <li>Menjaga keamanan, memperbaiki kesalahan, dan meningkatkan kualitas Situs.</li>
          <li>Memenuhi kewajiban hukum, akuntansi, atau permintaan otoritas yang berwenang.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Dasar Pemrosesan">
        <p>
          Kami memproses data berdasarkan persetujuan pengguna, pelaksanaan
          perjanjian layanan (termasuk pemrosesan pesanan), kewajiban hukum yang
          berlaku, dan kepentingan sah KARTU untuk menjaga keamanan serta
          keberlangsungan layanan. Kamu dapat menghubungi kami jika ingin
          mengetahui atau menarik persetujuan sesuai ketentuan yang berlaku.
        </p>
      </LegalSection>

      <LegalSection title="4. Pembayaran dan Pihak Ketiga">
        <p>
          Pembayaran diproses melalui <strong>Tripay</strong> dengan metode QRIS.
          Data instrumen pembayaran seperti kartu, rekening, atau akun e-wallet
          diproses oleh Tripay dan/atau penyedia kanal pembayaran yang dipilih.
          KARTU tidak menyimpan nomor kartu, PIN, password, atau kredensial
          perbankan pengguna.
        </p>
        <p>
          Kami juga menggunakan penyedia layanan teknis untuk hosting, database,
          penyimpanan gambar (misalnya Cloudinary), dan komunikasi. Penyedia
          tersebut hanya menerima data yang diperlukan untuk menjalankan
          layanannya. Tautan ke situs pihak ketiga, termasuk Tripay, memiliki
          kebijakan privasi masing-masing.
        </p>
      </LegalSection>

      <LegalSection title="5. Penyimpanan dan Keamanan">
        <p>
          Data disimpan pada sistem yang kami kelola dan/atau penyedia layanan
          yang bekerja sama dengan KARTU. Kami menggunakan pembatasan akses,
          koneksi terenkripsi (HTTPS), dan langkah teknis lain yang wajar untuk
          melindungi data. Namun, tidak ada sistem yang dapat menjamin keamanan
          seratus persen. Jangan pernah mengirim PIN, OTP, password, atau kode
          rahasia kepada siapa pun, termasuk kepada CS.
        </p>
      </LegalSection>

      <LegalSection title="6. Retensi Data">
        <p>
          Data akun disimpan selama akun masih digunakan atau selama diperlukan
          untuk menyediakan layanan. Data transaksi dapat disimpan lebih lama
          untuk keperluan akuntansi, audit, penanganan sengketa, dan kepatuhan
          hukum. Data komunikasi support disimpan selama diperlukan untuk
          menyelesaikan permintaan. Setelah tidak diperlukan, data akan dihapus
          atau dianonimkan sesuai kemampuan sistem dan ketentuan yang berlaku.
        </p>
      </LegalSection>

      <LegalSection title="7. Pembagian Data">
        <p>
          Kami tidak menjual data pribadi pengguna. Data dapat dibagikan kepada
          penyedia pembayaran, hosting, database, penyimpanan gambar, atau
          layanan komunikasi yang diperlukan untuk mengoperasikan Situs; kepada
          penegak hukum atau otoritas berwenang jika diwajibkan oleh hukum; dan
          kepada pihak lain dengan persetujuan pengguna. Pembagian data dibatasi
          pada informasi yang relevan dengan tujuan tersebut.
        </p>
      </LegalSection>

      <LegalSection title="8. Hak Pengguna">
        <p>
          Kamu dapat meminta akses, koreksi, atau penghapusan data pribadi yang
          kami simpan, serta menyampaikan keberatan atau pertanyaan terkait
          pemrosesan data. Permintaan dapat dikirim melalui kontak CS dengan
          menyertakan username dan bukti kepemilikan akun yang memadai. Kami
          dapat meminta verifikasi tambahan untuk melindungi akun. Permintaan
          akan diproses sesuai ketentuan yang berlaku dan kemampuan teknis
          layanan.
        </p>
      </LegalSection>

      <LegalSection title="9. Cookie dan Penyimpanan Lokal">
        <p>
          Situs menggunakan cookie sesi untuk menjaga status login dan
          localStorage untuk menyimpan preferensi seperti tema, status
          persetujuan Syarat & Ketentuan, dan pengaturan tampilan. Kami tidak
          menggunakan cookie iklan pihak ketiga untuk profil perilaku pengguna.
          Kamu dapat menghapus cookie/localStorage melalui pengaturan browser,
          tetapi beberapa fitur mungkin tidak berfungsi sebagaimana mestinya.
        </p>
      </LegalSection>

      <LegalSection title="10. Pengguna di Bawah Umur">
        <p>
          Jika kamu belum dewasa menurut hukum yang berlaku, gunakan layanan ini
          dengan izin dan pengawasan orang tua atau wali. Orang tua atau wali
          yang mengetahui adanya data anak yang diberikan tanpa izin dapat
          menghubungi CS untuk meminta tindakan yang diperlukan.
        </p>
      </LegalSection>

      <LegalSection title="11. Perubahan Kebijakan">
        <p>
          KARTU dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu.
          Versi terbaru akan dipublikasikan di halaman ini dengan tanggal
          pembaruan. Perubahan material dapat diberitahukan melalui Situs atau
          kanal komunikasi yang tersedia. Penggunaan Situs setelah pembaruan
          berarti kamu menyetujui kebijakan yang berlaku.
        </p>
      </LegalSection>

      <LegalSection title="12. Hubungi Kami">
        <p>
          Untuk pertanyaan tentang privasi atau permintaan terkait data pribadi,
          hubungi Customer Service KARTU:
        </p>
        <div className="legal-contact-inline">
          <a href={CS_EMAIL_URL}>{CS_EMAIL}</a>
          <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            WhatsApp {CS_WHATSAPP}
          </a>
        </div>
        <p className="legal-muted">
          Jam operasional CS: {CS_HOURS}. Informasi lengkap ada di halaman{' '}
          <Link href="/contact">Kontak Support</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
