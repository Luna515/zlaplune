import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import PublicPage from './pages/PublicPage';
import AdminPage from './pages/AdminPage';
import CancelPage from './pages/CancelPage';
import { BackgroundProvider } from './components/BackgroundContext';
import SiteBackground from './components/SiteBackground';

function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

function Setup() {
  return (
    <div className="panel login">
      <h2>Brakuje konfiguracji</h2>
      <p>
        Utwórz plik <code>.env</code> na podstawie <code>.env.example</code> i wpisz adres oraz
        klucz z Supabase. Na Vercel dodaj te same dwie zmienne w ustawieniach projektu
        (Environment Variables) i wdróż stronę ponownie.
      </p>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const isAdminRoute = route.startsWith('/admin');
  const cancelMatch = route.match(/^\/anuluj\/(.+)$/);

  let page;
  if (!supabase) page = <Setup />;
  else if (isAdminRoute) page = <AdminPage />;
  else if (cancelMatch) page = <CancelPage token={cancelMatch[1]} />;
  else page = <PublicPage />;

  return (
    <BackgroundProvider>
      <SiteBackground />
      <div className="shell">
      <main>{page}</main>
      <footer className="foot">
        {isAdminRoute ? (
          <a href="#/">Strona publiczna</a>
        ) : (
          <a href="#/admin">Panel admina</a>
        )}
      </footer>
      </div>
    </BackgroundProvider>
  );
}
