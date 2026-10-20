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
  title: 'Kebijakan Refund',
  description:
    'Kebijakan pengembalian dana KartuYogaa untuk Top-Up XP dan Slot Kartu Pajangan Custom, termasuk syarat, proses, dan waktu pemrosesan.',
  alternates: { canonical: '/refund' },
};

const UPDATED = '19 Oktober 2026';

export default function RefundPage() {
  return (
    <LegalPage
      title="Kebijakan Refund"
      updated={UPDATED}
      active="/refund"
      intro={
        <>
          Kebijakan ini menjelaskan kapan pengembalian dana (refund) dapat
          diajukan untuk produk digital KartuYogaa, cara mengajukannya, dan estimasi
          waktu pemrosesan. Kebijakan ini merupakan bagian dari{' '}
          <Link href="/terms">Syarat &amp; Ketentuan</Link>.
        </>
      }
    >
      <LegalSection title="1. Ruang Lingkup">
        <p>
          Kebijakan ini berlaku untuk pembelian produk digital di Shop KartuYogaa,
          yaitu Top-Up XP dan Slot Kartu Pajangan Custom, yang pembayarannya
          diproses melalui Tripay menggunakan QRIS. Seluruh produk bersifat
          digital dan tidak memiliki pengiriman fisik.
        </p>
      </LegalSection>

      <LegalSection title="2. Prinsip Umum">
        <ul className="legal-list">
          <li>Refund diberikan sesuai ketentuan pada halaman ini, bukan untuk setiap permintaan pembatalan.</li>
          <li>Produk yang sudah diterima atau sudah dipakai umumnya tidak dapat direfund.</li>
          <li>Jika terjadi kesalahan sistem atau pembayaran ganda, kami akan memverifikasi dan memberikan solusi berupa pengiriman produk atau refund.</li>
          <li>Pembayaran yang tidak berhasil, kedaluwarsa, atau dibatalkan tidak menimbulkan tagihan.</li>
          <li>Refund dilakukan melalui Tripay ke sumber dana asal sesuai kemampuan penyedia pembayaran.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Top-Up XP">
        <p>
          XP yang sudah masuk ke akun tidak dapat dikembalikan (non-refundable),
          kecuali terdapat kegagalan sistem di pihak KartuYogaa. Contoh kondisi yang
          dapat diajukan:
        </p>
        <ul className="legal-list">
          <li>Pembayaran berstatus sukses, tetapi XP tidak masuk setelah 1x24 jam.</li>
          <li>Terjadi pembayaran ganda untuk pesanan yang sama.</li>
          <li>Terjadi kesalahan teknis lain yang menyebabkan produk tidak diterima sebagaimana mestinya.</li>
        </ul>
        <p>
          Jika XP sudah masuk ke akun yang salah karena pengguna login dengan akun
          yang keliru, pembelian tidak dapat direfund. Kami akan membantu
          memindahkan atau memperbaiki selama masih memungkinkan dan setelah
          verifikasi.
        </p>
      </LegalSection>

      <LegalSection title="4. Slot Kartu Pajangan Custom">
        <p>Ketentuan refund untuk Slot Kartu Pajangan Custom:</p>
        <ul className="legal-list">
          <li>Slot yang belum dipakai (kartu masih bawaan dan jatah ubah masih 3/3) dapat dibatalkan dengan refund penuh.</li>
          <li>Slot yang sudah diubah atau kartunya sudah terpasang tidak dapat direfund.</li>
          <li>Jika kartu custom belum selesai diproses melewati batas 3x24 jam setelah pembayaran terverifikasi, kamu berhak mengajukan refund penuh.</li>
          <li>Permintaan perubahan setelah kartu dipasang mengikuti jatah ubah yang tersedia dan bukan alasan refund.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Pesanan Pending, Kedaluwarsa, atau Gagal">
        <p>
          Pesanan yang belum dibayar akan kedaluwarsa otomatis sesuai batas waktu
          di halaman pembayaran. Pesanan yang gagal atau dibatalkan tidak
          menimbulkan kewajiban pembayaran. Jika dana sudah terpotong tetapi
          status pesanan tidak berubah menjadi sukses, hubungi CS dengan bukti
          pembayaran agar dapat kami periksa.
        </p>
      </LegalSection>

      <LegalSection title="6. Cara Mengajukan Refund">
        <p>
          Ajukan refund melalui Customer Service KartuYogaa dengan menyertakan:
        </p>
        <ul className="legal-list">
          <li>Username Animein.</li>
          <li>Order ID atau referensi pembayaran.</li>
          <li>Tanggal dan nominal pembayaran.</li>
          <li>Bukti pembayaran yang jelas.</li>
          <li>Alasan pengajuan dan penjelasan singkat mengenai kendala.</li>
        </ul>
        <p>
          Ajukan sesegera mungkin setelah masalah diketahui, maksimal 7 hari
          kalender sejak pembayaran, agar kami dapat menelusuri transaksi dengan
          lebih mudah. Permintaan yang datang setelah periode tersebut tetap dapat
          kami tinjau, tetapi penyelesaiannya bergantung pada bukti dan kebijakan
          penyedia pembayaran.
        </p>
      </LegalSection>

      <LegalSection title="7. Proses dan Waktu Penyelesaian">
        <p>
          Kami akan memverifikasi data pesanan dan bukti pembayaran terlebih
          dahulu. Verifikasi umumnya membutuhkan 1–3 hari kerja. Setelah refund
          disetujui, dana dikembalikan melalui Tripay ke sumber dana asal dan
          umumnya diterima dalam maksimal 7 hari kerja, tergantung proses bank
          atau penyedia e-wallet yang digunakan.
        </p>
        <p>
          Jika ada biaya layanan pihak ketiga yang tidak dapat dikembalikan oleh
          penyedia pembayaran, kami akan menginformasikannya sebelum proses
          refund dilanjutkan.
        </p>
      </LegalSection>

      <LegalSection title="8. Hal yang Tidak Dapat Direfund">
        <ul className="legal-list">
          <li>XP yang sudah masuk dan digunakan untuk gacha, battle, atau kebutuhan lain.</li>
          <li>Slot custom yang sudah diubah atau sudah terpasang.</li>
          <li>Pembelian yang gagal karena kesalahan data akun dari pengguna.</li>
          <li>Kerugian tidak langsung, kehilangan keuntungan, atau kerugian lain yang tidak berkaitan langsung dengan nilai pesanan.</li>
          <li>Permintaan yang tidak dapat diverifikasi karena bukti pembayaran tidak memadai.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Kontak Refund">
        <p>
          Kirim pengajuan refund atau pertanyaan lain melalui Customer Service:
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
