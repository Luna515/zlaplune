import { SITE_TITLE, SITE_LEDE } from '../config';
import Board from '../components/Board';

export default function PublicPage() {
  return (
    <>
      <header className="hero">
        <h1>{SITE_TITLE}</h1>
        <p className="lede">{SITE_LEDE}</p>
      </header>
      <Board mode="public" />
    </>
  );
}
