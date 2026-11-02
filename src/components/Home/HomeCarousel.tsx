import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Link } from 'react-router-dom';
import { FaPlay, FaInfoCircle } from 'react-icons/fa';
import { useTitleLogo } from '../../hooks/extras';
import { ListButton } from './ListButton';
import type { Anime } from '../../hooks/interface';

const AUTO_MS = 8000;
const titleOf = (a: Anime) => a.title?.english || a.title?.romaji || 'Untitled';

// The hero is full-bleed: it cancels the body's padding (and max-width) so the
// artwork reaches the screen edges and sits underneath the transparent navbar.
const Hero = styled.section`
  position: relative;
  width: 100vw;
  margin: -4rem 0 0 calc(50% - 50vw);
  height: min(80vh, 44rem);
  height: min(80svh, 44rem);
  min-height: 28rem;
  overflow: hidden;
  background: #0b0b10;
  color: #fff;
  touch-action: pan-y;
  user-select: none;

  @media (max-width: 500px) {
    margin-top: -3.5rem;
    height: min(76svh, 40rem);
    min-height: 26rem;
  }
  @media (min-width: 1000px) {
    height: min(78vh, 42rem);
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: scale(1.04); }
  to { opacity: 1; transform: scale(1); }
`;

const Slide = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  opacity: ${({ $active }) => ($active ? 1 : 0)};
  visibility: ${({ $active }) => ($active ? 'visible' : 'hidden')};
  transition:
    opacity 0.6s ease,
    visibility 0.6s;
  pointer-events: ${({ $active }) => ($active ? 'auto' : 'none')};
`;

const Backdrop = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  animation: ${fadeIn} 1.2s ease both;

  @media (max-width: 700px) {
    object-position: 62% center;
  }
`;

const Shade = styled.div`
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to top,
      var(--global-primary-bg) 0%,
      rgba(11, 11, 16, 0.78) 26%,
      rgba(11, 11, 16, 0.12) 62%,
      rgba(11, 11, 16, 0.5) 100%
    ),
    linear-gradient(to right, rgba(11, 11, 16, 0.7) 0%, transparent 62%);

  @media (max-width: 700px) {
    background: linear-gradient(
      to top,
      var(--global-primary-bg) 0%,
      rgba(11, 11, 16, 0.85) 30%,
      rgba(11, 11, 16, 0.1) 65%,
      rgba(11, 11, 16, 0.45) 100%
    );
  }
`;

const Content = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 105rem;
  margin: 0 auto;
  padding: 0 1.25rem 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.7rem;

  @media (min-width: 700px) {
    padding: 0 2rem 3rem;
    max-width: 105rem;
  }
  @media (min-width: 1000px) {
    padding-bottom: 4rem;
  }
`;

const Logo = styled.img`
  display: block;
  width: auto;
  height: auto;
  max-width: min(82%, 24rem);
  max-height: 8.5rem;
  object-fit: contain;
  object-position: left bottom;
  filter: drop-shadow(0 0.2rem 1rem rgba(0, 0, 0, 0.6));
  animation: ${fadeIn} 0.6s ease both;

  @media (min-width: 700px) {
    max-width: 30rem;
    max-height: 11rem;
  }
`;

const Title = styled.h2<{ $hidden?: boolean }>`
  margin: 0;
  max-width: 36rem;
  font-size: clamp(1.7rem, 6.4vw, 3rem);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.02em;
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
  text-shadow: 0 0.2rem 1.5rem rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  max-width: 42rem;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.38rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;

`;

const Description = styled.p`
  margin: 0;
  max-width: 40rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (min-width: 700px) {
    font-size: 1rem;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.2rem;
`;

const HeroButton = styled(Link)<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.5rem;
  padding: 0 1.4rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  color: ${({ $primary }) => ($primary ? '#0b0b10' : '#fff')};
  background: ${({ $primary }) =>
    $primary ? '#f5f5f5' : 'rgba(58, 58, 66, 0.72)'};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    transform 0.15s ease,
    background-color 0.2s ease;

  svg {
    font-size: 0.95rem;
  }
  &:hover {
    background: ${({ $primary }) => ($primary ? '#fff' : 'rgba(86, 86, 96, 0.85)')};
    transform: translateY(-1px);
  }
  &:active {
    transform: scale(0.97);
  }

  @media (max-width: 380px) {
    padding: 0 1.05rem;
  }
`;

const Dots = styled.div`
  position: absolute;
  top: 4.4rem;
  right: 1.25rem;
  z-index: 3;
  display: flex;
  gap: 0.35rem;

  @media (min-width: 700px) {
    top: auto;
    bottom: 1.5rem;
    right: 2rem;
  }
`;

const Dot = styled.button<{ $active: boolean }>`
  width: ${({ $active }) => ($active ? '1.6rem' : '0.45rem')};
  height: 0.45rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? '#fff' : 'rgba(255,255,255,0.35)')};
  transition:
    width 0.3s ease,
    background-color 0.3s ease;
`;

const SkeletonHero = styled(Hero)`
  background: linear-gradient(90deg, #14141b, #1c1c26, #14141b);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const HeroTitle = ({ anime, active }: { anime: Anime; active: boolean }) => {
  const logo = useTitleLogo(anime.id);
  const [broken, setBroken] = useState(false);
  const name = titleOf(anime);
  if (logo && !broken) {
    return <Logo src={logo} alt={name} onError={() => setBroken(true)} />;
  }
  // while the lookup is pending keep the layout but don't flash the text title
  return <Title $hidden={active && logo === undefined}>{name}</Title>;
};

interface HomeCarouselProps {
  data: Anime[];
  loading: boolean;
  error?: string | null;
}


export const HomeCarousel: FC<HomeCarouselProps> = ({ data = [], loading }) => {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  // Prefer slides with real banner art; fall back to posters if none have it.
  const slides = useMemo(() => {
    const withText = data.filter((a) => a.title && a.description);
    const withBanner = withText.filter((a) => a.cover && a.cover !== a.image);
    return (withBanner.length ? withBanner : withText).slice(0, 8);
  }, [data]);

  const go = useCallback(
    (dir: number) => {
      if (!slides.length) return;
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Auto-advance; restarts whenever the slide changes (including manual swipes).
  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setTimeout(() => go(1), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [index, slides.length, go]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  if (loading || !slides.length) return <SkeletonHero aria-busy='true' />;

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
      {slides.map((anime, i) => {
        const active = i === index;
        const chips = [
          anime.totalEpisodes
            ? `${anime.totalEpisodes} Episode${anime.totalEpisodes === 1 ? '' : 's'}`
            : anime.type
              ? anime.type.replace('_', ' ')
              : null,
          anime.releaseDate ? String(anime.releaseDate) : null,
          ...(anime.genres ?? []).slice(0, 3),
        ].filter(Boolean) as string[];

        return (
          <Slide key={anime.id} $active={active} aria-hidden={!active}>
            {active && (
              <Backdrop
                src={anime.cover || anime.image}
                alt=''
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            )}
            <Shade />
            <Content>
              <HeroTitle anime={anime} active={active} />
              <Chips>
                {chips.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </Chips>
              <Description>{anime.description}</Description>
              <Actions>
                <HeroButton to={`/watch/${anime.id}`} $primary tabIndex={active ? 0 : -1}>
                  <FaPlay /> Watch Now
                </HeroButton>
                <HeroButton to={`/anime/${anime.id}`} tabIndex={active ? 0 : -1}>
                  <FaInfoCircle /> Details
                </HeroButton>
                <ListButton anime={anime} variant='hero' />
              </Actions>
            </Content>
          </Slide>
        );
      })}

      {slides.length > 1 && (
        <Dots>
          {slides.map((a, i) => (
            <Dot
              key={a.id}
              $active={i === index}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </Dots>
      )}
    </Hero>
  );
};
