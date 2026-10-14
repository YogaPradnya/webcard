/** @type {import('next').NextConfig} */
const nextConfig = {
  // Anti data basi (pelajaran dari insiden SW): API tidak boleh di-cache
  // browser/proxy dalam kondisi apa pun; sw.js sisa penonaktifan juga no-cache.
  // Aset /_next/static/* sudah ber-hash per build (aman di-cache lama, default Next).
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
