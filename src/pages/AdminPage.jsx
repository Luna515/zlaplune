import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import Board from '../components/Board';
import BackgroundEditor from '../components/BackgroundEditor';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSending(false);
    if (err) setError('Nieprawidłowy e-mail lub hasło.');
  }

  return (
    <div className="panel login">
      <h2>Logowanie</h2>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} required autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Hasło</span>
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="msg msg--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={sending}>
          {sending ? 'Loguję…' : 'Zaloguj się'}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState(undefined); // undefined = jeszcze sprawdzam
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data, error }) => setIsAdmin(error ? false : Boolean(data)));
  }, [userId]);

  const logout = () => supabase.auth.signOut();

  if (session === undefined) return <p className="muted">Wczytywanie…</p>;

  if (!session) {
    return (
      <>
        <header className="hero hero--small">
          <h1>Panel</h1>
        </header>
        <Login />
      </>
    );
  }

  if (isAdmin === null) return <p className="muted">Sprawdzam uprawnienia…</p>;

  if (!isAdmin) {
    return (
      <div className="panel login">
        <h2>Brak dostępu</h2>
        <p>To konto nie ma uprawnień admina. Dodaj je w bazie zgodnie z instrukcją w README.</p>
        <button type="button" className="btn btn--ghost" onClick={logout}>
          Wyloguj
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="hero hero--small hero--row">
        <h1>Panel</h1>
        <div className="who">
          <span className="muted">{session.user.email}</span>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Wyloguj
          </button>
        </div>
      </header>
      <BackgroundEditor />
      <Board mode="admin" />
    </>
  );
}
