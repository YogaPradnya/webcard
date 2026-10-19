import { SITE_URL } from '@/lib/site';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/shop', '/terms', '/privacy', '/refund', '/contact', '/login'],
        disallow: ['/api/', '/book', '/profile', '/gacha', '/battle', '/trade', '/convert', '/missions'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
