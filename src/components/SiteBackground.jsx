import { useEffect, useState } from 'react';
import { useBackground } from './BackgroundContext';
import { isAnimated, isSafeUrl } from '../lib/background';

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq?.addEventListener) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

// Tło całej strony: obraz, GIF albo wideo za treścią, z ustawianą widocznością.
export default function SiteBackground() {
  const { bg } = useBackground();
  const reduce = useReducedMotion();
  const [readyUrl, setReadyUrl] = useState(null);

  if (!bg?.url || !isSafeUrl(bg.url)) return null;
  if (reduce && isAnimated(bg)) return null;

  const ready = readyUrl === bg.url;
  const common = {
    className: `bg-media${ready ? ' is-ready' : ''}`,
    style: { '--bg-opacity': bg.opacity },
    'aria-hidden': true,
  };

  if (bg.kind === 'video') {
    return (
      <video
        key={bg.url}
        {...common}
        src={bg.url}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        ref={(el) => {
          if (el) el.muted = true; // bez tego część przeglądarek blokuje autoodtwarzanie
        }}
        onCanPlay={() => setReadyUrl(bg.url)}
      />
    );
  }
  return <img key={bg.url} {...common} src={bg.url} alt="" decoding="async" onLoad={() => setReadyUrl(bg.url)} />;
}
