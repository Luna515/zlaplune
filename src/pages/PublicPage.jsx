import { SITE_TITLE, SITE_LEDE } from '../config';
import Board from '../components/Board';

export default function PublicPage() {
  return (
    <>
      <header className="hero">
        <h1 aria-label={SITE_TITLE}>
          {[...SITE_TITLE].map((ch, i) => (
            <span key={i} className="ch" aria-hidden="true" style={{ '--i': i }}>
              {ch === ' ' ? '\u00a0' : ch}
            </span>
          ))}
        </h1>
        <p className="lede">{SITE_LEDE}</p>
      </header>
      <Board mode="public" />
    </>
  );
}
