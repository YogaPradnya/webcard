import Link from 'next/link';
import LegalPage, { LegalSection } from '@/components/LegalPage';
import {
  CS_EMAIL,
  CS_EMAIL_URL,
  CS_HOURS,
  CS_WHATSAPP,
  CS_WHATSAPP_URL,
} from '@/lib/contact';
import { MAX_EDITS_PER_SLOT, MAX_SLOTS_PER_USER, SLOT_PRICE_IDR } from '@/lib/products';
import { SITE_DESCRIPTION } from '@/lib/site';

export const metadata = {
  title: 'Syarat & Ketentuan',
  description: `Syarat dan ketentuan penggunaan KartuYogaa, termasuk produk digital, pembayaran QRIS via Tripay, dan aturan akun. ${SITE_DESCRIPTION}`,
  alternates: { canonical: '/terms' },
};

const UPDATED = '22 Oktober 2026';

export default function TermsPage() {
  return (
    <LegalPage
      title="Syarat & Ketentuan"
      updated={UPDATED}
      active="/terms"
      intro={
        <>
          Halaman ini mengatur penggunaan Situs KartuYogaa
          (<strong>https://kartu.yogaa.web.id</strong>) beserta pembelian produk
          digital Top-Up XP dan Slot Kartu Pajangan Custom. Dengan mengakses atau
          menggunakan Situs, kamu dianggap telah membaca dan menyetujui seluruh
          ketentuan di halaman ini.
        </>
      }
    >
      <LegalSection title="1. Ketentuan Penggunaan">
        <p>
          Situs KartuYogaa (&quot;Situs&quot;) disediakan untuk pengguna
          dengan syarat menyetujui seluruh syarat, ketentuan, dan pemberitahuan
          yang tercantum di halaman ini beserta ketentuan tambahan yang berlaku
          pada bagian mana pun dari Situs. Jika kamu tidak menyetujuinya, hentikan
          penggunaan Situs dan layanan KartuYogaa.
        </p>
      </LegalSection>

      <LegalSection title="2. Gambaran Layanan">
        <p>
          KartuYogaa adalah web book kartu anime yang terhubung dengan layanan bot
          dan platform digital, menyediakan koleksi kartu, gacha, trade, battle
          kartu anime, dan shop digital di <strong>https://kartu.yogaa.web.id</strong>.
        </p>
        <p>
          Seluruh produk yang dijual di Situs adalah produk digital. Tidak ada
          barang fisik dan tidak ada pengiriman fisik. Produk yang tersedia saat
          ini adalah Top-Up XP dan Slot Kartu Pajangan Custom.
        </p>
      </LegalSection>

      <LegalSection title="3. Perubahan Situs dan Syarat & Ketentuan">
        <p>
          KartuYogaa berhak mengubah, memodifikasi, memperbarui, atau menghentikan
          syarat, ketentuan, konten, informasi, harga, dan materi lain di Situs
          kapan pun tanpa pemberitahuan terlebih dahulu, kecuali diwajibkan lain
          oleh ketentuan yang berlaku. Kami berhak menyesuaikan harga dari waktu
          ke waktu. Apabila terjadi kesalahan harga, KartuYogaa berhak menolak
          pesanan tersebut. Dengan tetap menggunakan Situs setelah perubahan,
          kamu dianggap menyetujui perubahan tersebut.
        </p>
      </LegalSection>

      <LegalSection title="4. Lisensi Penggunaan">
        <p>
          KartuYogaa memberikan hak non-eksklusif dan tidak dapat dialihkan untuk
          mengakses dan menggunakan Situs semata-mata untuk keperluan pribadi
          selama perjanjian ini berlaku. Kamu dilarang memodifikasi, mengadaptasi,
          membongkar, atau melakukan rekayasa balik terhadap bagian mana pun dari
          Situs; membuat karya turunan berdasarkan komponen Situs; atau memberikan
          akses kepada pihak ketiga atas komponen Situs tanpa izin tertulis.
        </p>
      </LegalSection>

      <LegalSection title="5. Hak Milik">
        <p>
          Situs, sistem, kartu, data, dan dokumentasinya adalah milik KartuYogaa atau
          pemberi lisensinya. Seluruh materi, merek, dan logo di Situs dilindungi
          hukum hak cipta Indonesia dan hukum yang berlaku. Tidak ada materi yang
          boleh disalin, direproduksi, dimodifikasi, diterbitkan ulang, diunggah,
          dipasang, ditransmisikan, atau didistribusikan tanpa izin tertulis dari
          KartuYogaa.
        </p>
      </LegalSection>

      <LegalSection title="6. Deskripsi Produk">
        <p>Produk digital yang dijual di Situs:</p>
        <h3>Top-Up XP</h3>
        <p>
          XP adalah saldo digital untuk aktivitas di KartuYogaa, termasuk gacha
          kartu, battle, dan kebutuhan lain di chatbot maupun web. Pilihan paket
          di halaman Shop:
        </p>
        <ul className="legal-list">
          <li>Rp5.000 → 6.000 XP</li>
          <li>Rp10.000 → 11.500 XP</li>
          <li>Rp50.000 → 55.000 XP</li>
          <li>Rp100.000 → 125.000 XP</li>
          <li>Rp500.000 → 650.000 XP</li>
        </ul>
        <p>
          Bonus Top-Up Bulanan dihitung dari total nominal Top-Up XP yang
          berhasil dibayar dalam satu bulan kalender (WIB), bukan per paket.
          Tersedia 3 bar bonus: total Rp50.000 = 1 Epic; Rp100.000 = 1
          Legendary; Rp500.000 = 1 Mythic + 2 Legendary. Bonus diambil manual
          lewat tombol Klaim di halaman Shop. Progres direset setiap tanggal 1;
          bar yang sudah penuh tetapi belum diklaim masih bisa diklaim sampai
          tanggal 3 bulan berikutnya. Bonus mengikuti stok; bila stok tier yang
          diminta habis, sistem memberikan kartu dari tier di bawahnya. Khusus
          kartu Mythic, tidak ada batas pemilik — kartu Mythic bisa dimiliki
          banyak pengguna dan tetap bisa didapatkan pengguna lain.
        </p>
        <p>
          Setelah pembayaran terverifikasi sukses, XP otomatis masuk ke akun yang
          digunakan saat melakukan pembelian.
        </p>

        <h3>Slot Kartu Pajangan Custom</h3>
        <p>
          Slot Kartu Pajangan Custom dijual seharga <strong>Rp{SLOT_PRICE_IDR.toLocaleString('id-ID')}/slot</strong>,
          maksimal <strong>{MAX_SLOTS_PER_USER} slot per pengguna</strong>. Satu slot
          berisi satu kartu pajangan custom sesuai permintaan (nama, gambar, dan
          border). Kartu bersifat display-only: tampil di profil dan koleksi Book,
          tidak dapat dipakai untuk battle atau trade, dan tidak dapat diuangkan
          kembali menjadi XP.
        </p>
        <p>
          Setiap slot memiliki <strong>{MAX_EDITS_PER_SLOT}x jatah ubah</strong>.
          Setiap kali kamu menekan Simpan (untuk nama, gambar, maupun border),
          satu jatah terpakai. Setelah jatah habis, kartu pada slot tersebut
          dikunci dan tidak bisa diubah lagi. Pengerjaan kartu awal maksimal
          3x24 jam setelah pembayaran terverifikasi.
        </p>
      </LegalSection>

      <LegalSection title="7. Harga dan Pembayaran">
        <p>
          Seluruh harga produk tercantum dalam Rupiah (IDR) di halaman Shop.
          Pembayaran diproses melalui Tripay dan hanya tersedia melalui QRIS.
          Biaya layanan pembayaran mengikuti ketentuan Tripay; apabila ada biaya
          tambahan, total pembayaran ditampilkan pada halaman pembayaran sebelum
          transaksi diselesaikan.
        </p>
        <p>
          Dengan melanjutkan pembayaran, kamu juga tunduk pada syarat dan kebijakan
          Tripay. Pesanan yang tidak dibayar hingga batas waktu yang ditentukan
          akan otomatis dibatalkan dan tidak ada dana yang ditarik.
        </p>
      </LegalSection>

      <LegalSection title="8. Pengiriman dan Penyelesaian Pesanan">
        <p>
          Karena seluruh produk bersifat digital, tidak ada pengiriman fisik.
          Top-Up XP dikirim otomatis ke akun setelah pembayaran berstatus sukses.
          Kartu Pajangan Custom dikerjakan maksimal 3x24 jam setelah pembayaran
          terverifikasi. Kabar pemasangan kartu disampaikan melalui chat atau web.
        </p>
        <p>
          Pastikan kamu login ke akun yang benar sebelum membayar. XP atau kartu
          yang sudah masuk ke akun yang salah karena kelalaian pengguna bukan
          tanggung jawab KartuYogaa, tetapi kami akan membantu memperbaiki selama
          masih memungkinkan.
        </p>
      </LegalSection>

      <LegalSection title="9. Pengembalian Dana (Refund)">
        <p>
          Ketentuan refund secara lengkap diatur pada halaman{' '}
          <Link href="/refund">Kebijakan Refund</Link>. Ringkasnya:
        </p>
        <ul className="legal-list">
          <li>XP yang sudah masuk ke akun tidak dapat dikembalikan, kecuali terbukti ada kegagalan sistem di pihak KartuYogaa.</li>
          <li>Slot custom yang belum dipakai dapat dibatalkan dengan refund penuh.</li>
          <li>Slot yang sudah diubah atau kartunya sudah terpasang tidak dapat direfund.</li>
          <li>Refund diproses melalui Tripay ke sumber dana asal, maksimal 7 hari kerja setelah disetujui.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Pendaftaran Akun">
        <p>
          Untuk membeli, kamu perlu masuk dengan akun yang sudah terdaftar di
          KartuYogaa menggunakan username atau email dan password. Password hanya
          diproses sementara untuk verifikasi ke penyedia layanan autentikasi dan
          tidak disimpan oleh KartuYogaa. Kamu wajib memberikan informasi yang
          akurat dan bertanggung jawab menjaga kerahasiaan password serta seluruh
          aktivitas pada akun. Kamu dilarang menyalahgunakan atau membagikan akses
          akun, menyamar sebagai pihak lain, atau memalsukan identitas maupun
          afiliasi.
        </p>
        <p>
          Akun yang belum memiliki data di KartuYogaa tidak dapat langsung
          menggunakan login web. Pengguna perlu berinteraksi dengan bot terlebih
          dahulu agar data akunnya tercatat.
        </p>
      </LegalSection>

      <LegalSection title="11. Komunikasi Elektronik">
        <p>
          Kamu menyetujui bahwa KartuYogaa dapat mengirim pesan elektronik untuk
          pemberitahuan perubahan Situs, informasi produk atau layanan, status
          pesanan, atau keperluan lain yang dianggap perlu.
        </p>
      </LegalSection>

      <LegalSection title="12. Kebijakan Privasi">
        <p>
          Kami menghormati privasi pengguna. Data yang kamu berikan digunakan
          untuk memverifikasi login, menyelesaikan pesanan, memberikan dukungan,
          dan menjaga keamanan layanan. Data pembayaran diproses oleh Tripay dan
          tidak kami simpan secara langsung. Penjelasan lengkap mengenai data yang dikumpulkan,
          tujuan penggunaan, penyimpanan, dan hak pengguna tersedia di halaman{' '}
          <Link href="/privacy">Kebijakan Privasi</Link>.
        </p>
      </LegalSection>

      <LegalSection title="13. Ganti Rugi">
        <p>
          Kamu setuju untuk mengganti rugi, membela, dan membebaskan KartuYogaa dari
          segala klaim, kewajiban, kerusakan, kerugian, atau biaya pihak ketiga
          (termasuk biaya pengacara yang wajar) yang timbul dari akses atau
          penggunaan Situs oleh kamu, termasuk pelanggaran atas Syarat & Ketentuan
          ini.
        </p>
      </LegalSection>

      <LegalSection title="14. Batasan Tanggung Jawab">
        <p>
          KartuYogaa tidak bertanggung jawab atas keakuratan, kebenaran, ketepatan
          waktu, atau isi materi yang disediakan di Situs. Kamu tidak boleh
          berasumsi bahwa materi di Situs selalu diperbarui atau memuat informasi
          terkini. Dalam batas maksimum yang diizinkan hukum, total tanggung jawab
          kami atas suatu pesanan tidak melebihi nilai pesanan tersebut.
        </p>
      </LegalSection>

      <LegalSection title="15. Hukum yang Berlaku">
        <p>
          Syarat & Ketentuan ini diatur oleh dan ditafsirkan menurut hukum yang
          berlaku di Indonesia. Setiap perselisihan diselesaikan terlebih dahulu
          secara musyawarah; apabila tidak tercapai, diselesaikan melalui jalur
          hukum sesuai peraturan perundang-undangan Indonesia.
        </p>
      </LegalSection>

      <LegalSection title="16. Pertanyaan, Masukan, dan Customer Service">
        <p>
          Untuk bantuan pesanan, pembayaran, akun, refund, atau kendala lainnya,
          hubungi Customer Service KartuYogaa. Sertakan username, Order ID, dan bukti
          pembayaran agar keluhan dapat diproses lebih cepat.
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
