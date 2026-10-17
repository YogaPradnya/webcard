'use client';

import Sidebar from '@/components/Sidebar';

const SECTIONS = [
  {
    title: '1. Ketentuan Penggunaan',
    body: 'Situs Book Kartu Animein ("Situs") ini disediakan untuk Anda, pengguna, dengan syarat Anda menyetujui seluruh syarat, ketentuan, dan pemberitahuan yang tercantum di halaman ini beserta ketentuan tambahan lain yang berlaku pada setiap bagian Situs. Dengan mengakses atau menggunakan Situs ini, Anda dianggap telah membaca, memahami, dan menyetujui Syarat & Ketentuan ini. Jika Anda tidak menyetujuinya, harap segera keluar dari Situs dan hentikan penggunaan layanan maupun produk dari Situs ini.',
  },
  {
    title: '2. Gambaran Layanan',
    body: 'Animein adalah platform komunitas anime yang menyediakan chatbot interaktif serta web book, gacha, trade, dan battle kartu anime di https://kartu.yogaa.web.id. Seluruh produk yang dijual di Situs ini adalah produk digital (tidak ada barang fisik dan tidak ada pengiriman fisik). Penggunaan Situs ini berarti Anda menyetujui Syarat & Ketentuan ini beserta aturan, panduan, atau ketentuan lain yang berlaku pada bagian mana pun dari Situs, tanpa pengecualian. Jika tidak setuju, Anda wajib segera keluar dari Situs dan menghentikan penggunaan informasi maupun produk dari Situs ini.',
  },
  {
    title: '3. Perubahan Situs dan Syarat & Ketentuan Ini',
    body: 'Animein berhak mengubah, memodifikasi, memperbarui, atau menghentikan syarat, ketentuan, pemberitahuan, tautan, konten, informasi, harga, dan materi lain yang ditawarkan melalui Situs ini kapan pun tanpa pemberitahuan terlebih dahulu, kecuali diwajibkan lain oleh ketentuan yang berlaku. Kami berhak menyesuaikan harga dari waktu ke waktu. Apabila terjadi kesalahan harga, Animein berhak menolak pesanan tersebut. Dengan tetap menggunakan Situs setelah adanya perubahan, Anda dianggap terikat dan tunduk pada perubahan tersebut.',
  },
  {
    title: '4. Lisensi Penggunaan',
    body: 'Animein memberikan Anda hak non-eksklusif dan tidak dapat dialihkan untuk mengakses dan menggunakan Situs ini semata-mata untuk keperluan pribadi selama Perjanjian ini berlaku. Anda dilarang: (a) memodifikasi, mengadaptasi, membongkar (decompile/disassemble), atau melakukan rekayasa balik (reverse engineering) terhadap bagian mana pun dari Situs; (b) membuat karya turunan berdasarkan komponen Situs; (c) memberikan akses kepada pihak ketiga atas komponen Situs atau dokumentasinya tanpa izin tertulis dari kami.',
  },
  {
    title: '5. Hak Milik',
    body: 'Anda mengakui dan menyetujui bahwa: (a) Situs, sistem, kartu, data, dan dokumentasinya adalah milik Animein atau pemberi lisensinya, bukan milik Anda; dan (b) Anda hanya boleh menggunakan Situs beserta dokumentasinya sesuai dengan syarat dan ketentuan yang diuraikan di sini. Seluruh materi, merek dagang, merek layanan, dan logo di Situs ini dilindungi undang-undang hak cipta Indonesia dan hukum yang berlaku di seluruh dunia. Tidak ada materi yang dipublikasikan di Situs ini, baik sebagian maupun seluruhnya, yang boleh disalin, direproduksi, dimodifikasi, diterbitkan ulang, diunggah, dipasang, ditransmisikan, atau didistribusikan dalam bentuk atau cara apa pun tanpa izin tertulis terlebih dahulu dari Animein.',
  },
  {
    title: '6. Deskripsi Produk',
    body: 'Kami selalu berusaha menampilkan informasi produk di Situs seakurat mungkin. Produk digital yang dijual:\n\n• Top-Up XP — saldo XP untuk dipakai gacha kartu, battle, dan belanja item di chatbot dan web Animein. Pilihan paket di halaman Shop: Rp5.000 → 6.000 XP, Rp10.000 → 11.500 XP, Rp50.000 → 55.000 XP, Rp100.000 → 125.000 XP. Setelah pembayaran terverifikasi sukses, XP otomatis masuk ke akun Anda.\n\n• Slot Kartu Pajangan (Rp10.000/slot, maks 50 slot per user) — 1 slot = 1 kartu pajangan custom sesuai permintaan Anda (nama, gambar, dan border). Kartu bersifat display-only: tampil di profil dan book koleksi Anda, tidak dapat dipakai untuk battle maupun trade, dan tidak dapat diuangkan kembali menjadi XP. Tiap slot memiliki 3x jatah ubah: setiap kali Anda menekan Simpan (untuk nama, gambar, maupun border) memakai 1 jatah. Setelah 3 jatah habis, kartu di slot tersebut dikunci dan tidak bisa diubah lagi — untuk kartu berikutnya, beli slot baru. Pengerjaan kartu awal maksimal 3x24 jam setelah pembayaran terverifikasi. Anda akan dikabari melalui chat/web saat kartunya terpasang.',
  },
  {
    title: '7. Harga dan Pembayaran',
    body: 'Seluruh harga tercantum dalam Rupiah (IDR) di halaman Shop dan sudah termasuk biaya layanan pembayaran. Pembayaran diproses aman melalui PayDisini dan hanya tersedia via QRIS. Pesanan yang tidak dibayar hingga batas waktu yang ditentukan akan otomatis dibatalkan oleh sistem dan tidak ada dana yang ditarik.',
  },
  {
    title: '8. Pengiriman dan Penyelesaian Pesanan',
    body: 'Karena seluruh produk bersifat digital, tidak ada pengiriman fisik. Top-Up XP dikirim otomatis ke akun Anda segera setelah pembayaran berstatus sukses. Custom Kartu Pajangan dikerjakan maksimal 3x24 jam setelah pembayaran terverifikasi; jatah ubah tiap slot 3x (tiap Simpan memakai 1 jatah); apabila melewati batas tersebut tanpa kabar, Anda berhak meminta refund penuh. Pastikan Anda login ke akun yang benar sebelum membayar — XP atau kartu yang sudah masuk ke akun yang salah karena kelalaian pengguna bukan tanggung jawab kami, namun akan kami bantu perbaiki selama masih memungkinkan.',
  },
  {
    title: '9. Pengembalian Dana (Refund)',
    body: 'Top-Up XP yang sudah masuk ke akun tidak dapat dikembalikan (non-refundable), kecuali terbukti ada kegagalan sistem di pihak kami (misalnya bayar sukses tapi XP tidak masuk setelah 1x24 jam) — dalam hal ini kami akan mengirimkan XP-nya atau mengembalikan dana penuh. Slot Kartu Pajangan yang belum dipakai (kartu masih bawaan dan jatah ubah masih 3/3) dapat dibatalkan dengan refund penuh; slot yang sudah diubah atau kartunya sudah terpasang tidak dapat direfund. Pengajuan refund dilakukan melalui kontak kami di bawah dengan menyertakan bukti pembayaran, dan diproses maksimal 7 hari kerja ke sumber dana asal.',
  },
  {
    title: '10. Pendaftaran Akun',
    body: 'Untuk membeli, Anda perlu masuk ke Situs ini dengan akun Animein Anda (login tanpa password melalui kode .login di chat). Anda wajib memberikan informasi yang akurat dan terkini. Anda bertanggung jawab penuh menjaga kerahasiaan kode login dan akun Anda beserta seluruh aktivitas yang terjadi di dalamnya. Anda dilarang menyalahgunakan atau membagikan akses akun Anda, menyamar sebagai orang atau pihak lain, atau memalsukan identitas maupun afiliasi Anda.',
  },
  {
    title: '11. Komunikasi Elektronik',
    body: 'Anda menyetujui bahwa Animein dapat mengirimi Anda pesan elektronik untuk keperluan pemberitahuan perubahan Situs, informasi produk atau layanan, status pesanan, atau keperluan lain yang kami anggap perlu.',
  },
  {
    title: '12. Kebijakan Privasi',
    body: 'Informasi Anda aman bersama kami. Animein memahami bahwa privasi sangat penting bagi pelanggan. Data yang Anda berikan (username, riwayat pesanan, dan bukti pembayaran) tidak akan disalahgunakan, disalahgunakan, atau dijual kepada pihak lain mana pun. Kami hanya menggunakan informasi pribadi Anda untuk menyelesaikan pesanan Anda. Data pembayaran kartu/bank Anda diproses langsung oleh PayDisini dan tidak kami simpan.',
  },
  {
    title: '13. Ganti Rugi',
    body: 'Anda setuju untuk mengganti rugi, membela, dan membebaskan Animein dari segala klaim, kewajiban, kerusakan, kerugian, atau biaya pihak ketiga (termasuk biaya pengacara yang wajar) yang timbul dari, berdasarkan, atau sehubungan dengan akses dan/atau penggunaan Situs ini oleh Anda, termasuk pelanggaran Anda atas Syarat & Ketentuan ini.',
  },
  {
    title: '14. Batasan Tanggung Jawab',
    body: 'Animein tidak bertanggung jawab atas keakuratan, kebenaran, ketepatan waktu, atau isi materi yang disediakan di Situs ini. Anda tidak boleh berasumsi bahwa materi di Situs ini selalu diperbarui atau memuat informasi terkini. Animein tidak bertanggung jawab atas konten atau materi Situs yang sudah kedaluwarsa atau telah dihapus. Dalam batas maksimum yang diizinkan hukum, total tanggung jawab kami atas suatu pesanan tidak melebihi nilai pesanan tersebut.',
  },
  {
    title: '15. Hukum yang Berlaku',
    body: 'Syarat & Ketentuan ini diatur oleh dan ditafsirkan menurut hukum yang berlaku di Indonesia. Setiap perselisihan diselesaikan terlebih dahulu secara musyawarah; apabila tidak tercapai, diselesaikan melalui jalur hukum sesuai peraturan perundang-undangan Indonesia.',
  },
  {
    title: '16. Pertanyaan dan Masukan',
    body: 'Kami menyambut pertanyaan, komentar, dan masukan Anda seputar privasi maupun informasi yang kami kumpulkan dari atau tentang Anda. Hubungi kami melalui: Grup WhatsApp https://chat.whatsapp.com/FpIkzQ28o8o88vJudiN4SK, Discord https://discord.gg/22EtRJCvfC, atau Instagram https://www.instagram.com/animein.aja. Keluhan terkait pesanan harap menyertakan username dan bukti pembayaran agar dapat kami proses cepat.',
  },
];

export default function TermsPage() {
  return (
    <div className="layout">
      <Sidebar username={null} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Syarat & Ketentuan</h1></div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--body)' }}>
              Terakhir diperbarui: 17 Oktober 2026. Halaman ini mengatur penggunaan Situs Book Kartu Animein
              (<strong>https://kartu.yogaa.web.id</strong>) beserta pembelian produk digital
              Top-Up XP dan Custom Kartu Pajangan. Dengan menggunakan Situs ini, Anda menyetujui seluruh ketentuan di bawah ini.
            </div>
          </div>
          {SECTIONS.map((s) => (
            <div className="card" key={s.title} style={{ marginBottom: 12 }}>
              <div className="section-title">{s.title}</div>
              <div style={{ fontSize: 13, color: 'var(--body)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {s.body}
              </div>
            </div>
          ))}
          <div className="card">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Pemberitahuan Hukum: Book Kartu Animein adalah layanan komunitas Animein. Hak cipta © 2026 dilindungi undang-undang.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
