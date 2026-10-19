import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';

export default function PublicShell({ children }) {
  return (
    <div className="public-shell">
      <SiteHeader />
      <main className="public-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
