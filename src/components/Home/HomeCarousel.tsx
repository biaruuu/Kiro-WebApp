import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Link } from 'react-router-dom';
import { FaPlay } from 'react-icons/fa';
import { FiInfo } from 'react-icons/fi';
import { useAudioCounts, useTmdbArtMap, type TmdbArt } from '../../hooks/extras';
import { ListButton } from './ListButton';
import type { Anime } from '../../hooks/interface';

const AUTO_MS = 8000;
const ART_WAIT_MS = 1600; // how long we wait for TMDB art before using the AniList banner

const titleOf = (a: Anime) => a.title?.english || a.title?.romaji || 'Untitled';
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// The hero section is full-bleed (it cancels the body padding) and sits under
// the transparent navbar. Its artwork lives in a *fixed* layer behind the whole
// page: it stays visible, blurring and dimming as you scroll, then fades out.
// ---------------------------------------------------------------------------
const Hero = styled.section`
  position: relative;
  width: 100vw;
  margin: -4rem 0 0 calc(50% - 50vw);
  height: min(80vh, 44rem);
  height: min(80svh, 44rem);
  min-height: 26rem;
  color: #fff;
  touch-action: pan-y;
  user-select: none;

  @media (max-width: 500px) {
    margin-top: -3.5rem;
    height: min(76svh, 40rem);
  }
  @media (min-width: 1000px) {
    height: min(78vh, 42rem);
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(0.4rem); }
  to { opacity: 1; transform: none; }
`;

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`;

const Layer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100vh;
  height: 100svh;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: var(--hero-o, 1);
  will-change: opacity;
`;

const LayerImg = styled.img<{ $on: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 22%;
  opacity: ${({ $on }) => ($on ? 1 : 0)};
  transition: opacity 0.9s ease;
  filter: blur(var(--hero-b, 0px));
  transform: scale(var(--hero-s, 1));
  will-change: filter, transform;

  @media (max-width: 700px) {
    object-position: 60% center;
  }
`;

const LayerDim = styled.div`
  position: absolute;
  inset: 0;
  background: var(--global-primary-bg);
  opacity: var(--hero-d, 0);
`;

// All gradients live in the fixed layer (nothing scrolls with an edge), so there
// is no visible seam where the hero ends: the art simply darkens toward the
// bottom and keeps showing, dimmed, behind the page content.
const LayerFade = styled.div`
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom, rgba(11, 11, 16, 0.6) 0%, transparent 16%),
    linear-gradient(
      to bottom,
      transparent 24%,
      rgba(11, 11, 16, 0.5) 46%,
      rgba(11, 11, 16, 0.84) 68%,
      var(--global-primary-bg) 96%
    );

  @media (min-width: 900px) {
    background:
      linear-gradient(to bottom, rgba(11, 11, 16, 0.6) 0%, transparent 16%),
      linear-gradient(to right, rgba(11, 11, 16, 0.65) 0%, transparent 62%),
      linear-gradient(
        to bottom,
        transparent 30%,
        rgba(11, 11, 16, 0.55) 56%,
        rgba(11, 11, 16, 0.86) 76%,
        var(--global-primary-bg) 98%
      );
  }
`;

const Slide = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: ${({ $active }) => ($active ? 1 : 0)};
  visibility: ${({ $active }) => ($active ? 'visible' : 'hidden')};
  transition:
    opacity 0.6s ease,
    visibility 0.6s;
  pointer-events: ${({ $active }) => ($active ? 'auto' : 'none')};
`;

const Content = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 105rem;
  margin: 0 auto;
  padding: 0 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;

  @media (min-width: 700px) {
    padding: 0 2rem 2.75rem;
  }
`;

const Logo = styled.img`
  display: block;
  width: auto;
  height: auto;
  max-width: min(66%, 19rem);
  max-height: 6.5rem;
  object-fit: contain;
  object-position: left bottom;
  filter: drop-shadow(0 0.15rem 0.8rem rgba(0, 0, 0, 0.55));
  animation: ${fadeIn} 0.6s ease both;

  @media (min-width: 700px) {
    max-width: 26rem;
    max-height: 9rem;
  }
`;

const Title = styled.h2<{ $hidden?: boolean }>`
  margin: 0;
  max-width: 34rem;
  font-size: clamp(1.5rem, 5.6vw, 2.6rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-shadow: 0 0.15rem 1.2rem rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-width: 36rem;
`;

// frosted-glass pill
const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.16),
    rgba(255, 255, 255, 0.05)
  );
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 0.2rem 0.8rem rgba(0, 0, 0, 0.18);
  font-size: 0.72rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
`;

const Description = styled.p`
  margin: 0;
  max-width: 36rem;
  font-size: 0.84rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (min-width: 700px) {
    font-size: 0.95rem;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.45rem;
  margin-top: 0.2rem;
`;

const HeroButton = styled(Link)<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  height: 2.5rem;
  padding: 0 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 600;
  text-decoration: none;
  color: ${({ $primary }) => ($primary ? '#0b0b10' : '#fff')};
  background: ${({ $primary }) =>
    $primary ? '#f5f5f5' : 'rgba(52, 52, 60, 0.62)'};
  box-shadow: ${({ $primary }) =>
    $primary ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'};
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  transition:
    transform 0.15s ease,
    background-color 0.2s ease;

  svg {
    font-size: 0.95rem;
  }
  &:hover {
    background: ${({ $primary }) => ($primary ? '#fff' : 'rgba(86, 86, 96, 0.8)')};
  }
  &:active {
    transform: scale(0.97);
  }
`;

const SkeletonHero = styled(Hero)`
  background: linear-gradient(90deg, #14141b, #1c1c26, #14141b);
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
`;

// ---------------------------------------------------------------------------
const HeroTitle = ({
  anime,
  art,
  waiting,
}: {
  anime: Anime;
  art: TmdbArt | null | undefined;
  waiting: boolean;
}) => {
  const [broken, setBroken] = useState(false);
  const name = titleOf(anime);
  if (art?.logo && !broken) {
    return <Logo src={art.logo} alt={name} onError={() => setBroken(true)} />;
  }
  // keep the layout but don't flash the text title while TMDB is still answering
  return <Title $hidden={waiting}>{name}</Title>;
};

const HeroChips = ({ anime, active }: { anime: Anime; active: boolean }) => {
  const counts = useAudioCounts(anime.id, active && anime.status !== 'Not yet aired');
  const eps = counts?.sub || anime.totalEpisodes || anime.currentEpisode || 0;
  const chips = [
    eps
      ? `${eps} Episode${eps === 1 ? '' : 's'}`
      : anime.type
        ? anime.type.replace('_', ' ')
        : null,
    anime.releaseDate ? String(anime.releaseDate) : null,
    ...(anime.genres ?? []).slice(0, 3),
  ].filter(Boolean) as string[];
  return (
    <Chips>
      {chips.map((c) => (
        <Chip key={c}>{c}</Chip>
      ))}
    </Chips>
  );
};

interface HomeCarouselProps {
  data: Anime[];
  loading: boolean;
  error?: string | null;
}

export const HomeCarousel: FC<HomeCarouselProps> = ({ data = [], loading }) => {
  const [pos, setPos] = useState({ cur: 0, prev: -1 });
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const touchX = useRef<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // Prefer slides with real banner art; fall back to posters if none have it.
  const slides = useMemo(() => {
    const withText = data.filter((a) => a.title && a.description);
    const withBanner = withText.filter((a) => a.cover && a.cover !== a.image);
    return (withBanner.length ? withBanner : withText).slice(0, 8);
  }, [data]);

  const arts = useTmdbArtMap(
    slides.map((a) => ({ id: a.id, type: a.type, title: titleOf(a) })),
  );

  useEffect(() => {
    if (!slides.length) return;
    setSettled(false);
    const id = window.setTimeout(() => setSettled(true), ART_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [slides]);

  const go = useCallback(
    (dir: number) => {
      if (!slides.length) return;
      setPos((p) => ({ cur: (p.cur + dir + slides.length) % slides.length, prev: p.cur }));
    },
    [slides.length],
  );

  // Auto-advance; restarts whenever the slide changes (including manual swipes).
  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setTimeout(() => go(1), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [pos.cur, slides.length, go]);

  useEffect(() => {
    if (pos.cur >= slides.length && slides.length) setPos({ cur: 0, prev: -1 });
  }, [slides.length, pos.cur]);

  // Scroll: blur + dim the backdrop, then fade it out completely.
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const vh = window.innerHeight || 800;
      const blurP = clamp(y / (vh * 0.9));
      const fadeP = clamp((y - vh * 0.2) / (vh * 1.1));
      const eased = fadeP * fadeP * (3 - 2 * fadeP);
      el.style.setProperty('--hero-b', `${(blurP * 14).toFixed(1)}px`);
      el.style.setProperty('--hero-s', (1 + blurP * 0.06).toFixed(3));
      el.style.setProperty('--hero-d', (clamp(y / (vh * 0.7)) * 0.5).toFixed(3));
      el.style.setProperty('--hero-o', (1 - eased).toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loading, slides.length]);

  if (loading || !slides.length) return <SkeletonHero aria-busy='true' />;

  const srcFor = (a: Anime): string | null => {
    const art = arts[a.id];
    if (art === undefined && !settled) return null; // still waiting for TMDB
    if (art?.backdrop && !failed[a.id]) return art.backdrop;
    // No HD backdrop: a wide 1900x400 banner would be zoomed ~4x on a portrait
    // phone, so use the (taller) poster there instead.
    const portrait =
      typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    return (portrait ? a.image || a.cover : a.cover || a.image) || null;
  };

  return (
    <Hero
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <Layer ref={layerRef} aria-hidden>
        {slides.map((a, i) => {
          if (i !== pos.cur && i !== pos.prev) return null;
          const src = srcFor(a);
          if (!src) return null;
          return (
            <LayerImg
              key={`${a.id}:${src}`}
              src={src}
              alt=''
              $on={i === pos.cur}
              decoding='async'
              onError={() => setFailed((f) => ({ ...f, [a.id]: true }))}
            />
          );
        })}
        <LayerDim />
        <LayerFade />
      </Layer>
      {slides.map((anime, i) => {
        const active = i === pos.cur;
        const art = arts[anime.id];
        return (
          <Slide key={anime.id} $active={active} aria-hidden={!active}>
            <Content>
              <HeroTitle anime={anime} art={art} waiting={art === undefined && !settled} />
              <HeroChips anime={anime} active={active} />
              <Description>{anime.description}</Description>
              <Actions>
                <HeroButton to={`/watch/${anime.id}`} $primary tabIndex={active ? 0 : -1}>
                  <FaPlay /> Watch Now
                </HeroButton>
                <HeroButton to={`/anime/${anime.id}`} tabIndex={active ? 0 : -1}>
                  <FiInfo /> Details
                </HeroButton>
                <ListButton anime={anime} variant='hero' />
              </Actions>
            </Content>
          </Slide>
        );
      })}
    </Hero>
  );
};
