import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Link } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaClosedCaptioning, FaMicrophone, FaPlay } from 'react-icons/fa';
import { useAudioCounts } from '../../hooks/extras';
import { ListButton } from './ListButton';
import type { Anime } from '../../hooks/interface';

export type RecentAnime = Anime & { episode: number; airingAt: number };

type Audio = 'sub' | 'dub';

const timeAgo = (unixSeconds: number) => {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  const m = Math.floor(diff / 60);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const readAudio = (): Audio => {
  try {
    return localStorage.getItem('preferred-audio') === 'dub' ? 'dub' : 'sub';
  } catch {
    return 'sub';
  }
};

const perPageFor = (width: number) => (width >= 700 ? 20 : 15);

// ---------------------------------------------------------------------------
const Section = styled.section`
  margin-bottom: 1.75rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.9rem;

  h2 {
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.005em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (min-width: 700px) {
    h2 {
      font-size: 1.45rem;
    }
  }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: none;
`;

const Segment = styled.div`
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 999px;
  border: 1px solid var(--global-border);
`;

const SegButton = styled.button<{ $active: boolean }>`
  min-width: 2.7rem;
  padding: 0.32rem 0.7rem;
  border: none;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#0b0b10' : 'var(--global-text)')};
  background: ${({ $active }) => ($active ? '#b7a9ff' : 'transparent')};
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  @media (min-width: 700px) {
    min-width: 3.4rem;
    padding: 0.45rem 0.95rem;
    font-size: 0.86rem;
  }
`;

const Pager = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem;
  border-radius: 999px;
  border: 1px solid var(--global-border);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--global-text);

  span {
    min-width: 1.8rem;
    text-align: center;
  }
  @media (min-width: 700px) {
    font-size: 0.86rem;
    span {
      min-width: 2.4rem;
    }
  }
`;

const PagerButton = styled.button`
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--global-text-muted);
  font-size: 0.6rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--global-text);
    background: var(--global-secondary-bg);
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
  @media (min-width: 700px) {
    width: 2rem;
    height: 2rem;
    font-size: 0.75rem;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.1rem 0.6rem;

  @media (min-width: 700px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.5rem 0.9rem;
  }
  @media (min-width: 1500px) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  @media (min-width: 2000px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
`;

const Card = styled(Link)<{ $color?: string }>`
  display: block;
  min-width: 0;
  text-decoration: none;
  color: var(--global-text);

  .poster {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition:
      transform 0.35s ease,
      filter 0.25s ease;
  }
  .poster::after {
    content: '';
    position: absolute;
    inset: 55% 0 0;
    background: linear-gradient(to top, rgba(8, 8, 12, 0.88), transparent);
    pointer-events: none;
  }
  &:hover .poster img {
    transform: scale(1.05);
    filter: brightness(0.65);
  }
  .play {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 1.8rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  &:hover .play {
    opacity: 1;
  }
  .overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.45rem 0.5rem;
    color: #fff;
    font-weight: 500;
    font-size: 0.68rem;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
    white-space: nowrap;
  }
  .overlay small {
    font-size: 0.66rem;
    font-weight: 400;
    opacity: 0.85;
  }
  .meta {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.2rem;
    margin: 0.5rem 0 0.35rem;
    min-width: 0;
  }
  .name {
    margin: 0;
    font-size: 0.76rem;
    font-weight: 500;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 0.2s ease;
  }
  &:hover .name {
    color: ${({ $color }) => $color || 'var(--primary-accent)'};
  }

  /* no text selection / image menu while long-pressing */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  .poster img {
    -webkit-user-drag: none;
    pointer-events: none;
  }

  /* + button: hidden until hover (mouse) or long-press (touch); always visible once added */
  .poster > button {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.8);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease,
      background-color 0.25s ease,
      color 0.25s ease;
  }
  .poster > button[aria-pressed='true'],
  .poster > button[data-show='true'] {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
  @media (hover: hover) {
    &:hover .poster > button,
    .poster > button:focus-visible {
      opacity: 1;
      pointer-events: auto;
      transform: none;
    }
  }

  @media (min-width: 700px) {
    .overlay {
      font-size: 0.85rem;
      padding: 0.6rem 0.7rem;
    }
    .overlay small {
      font-size: 0.78rem;
    }
    .name {
      font-size: 0.9rem;
    }
  }
`;

const MetaChip = styled.span<{ $tint?: string }>`
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  gap: 0.2rem;
  padding: 0.22rem 0.32rem;
  border-radius: 0.4rem;
  background: ${({ $tint }) =>
    $tint ? `color-mix(in srgb, ${$tint} 22%, var(--global-secondary-bg))` : 'var(--global-secondary-bg)'};
  color: var(--global-text-muted);
  font-size: 0.62rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  svg {
    flex: none;
    font-size: 0.68rem;
  }
  @media (min-width: 700px) {
    padding: 0.28rem 0.45rem;
    font-size: 0.72rem;
    svg {
      font-size: 0.78rem;
    }
  }
`;

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`;

const SkeletonCard = styled.div`
  aspect-ratio: 2 / 3.6;
  border-radius: 0.8rem;
  background: linear-gradient(
    90deg,
    var(--global-secondary-bg),
    var(--global-tertiary-bg),
    var(--global-secondary-bg)
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
`;

const Empty = styled.p`
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--global-text-muted);
`;

const typeLabel = (t?: string) => {
  switch (t) {
    case 'TV_SHORT':
      return 'SHORT';
    case 'SPECIAL':
      return 'SP';
    case 'MUSIC':
      return 'MV';
    default:
      return (t || '').replace('_', ' ');
  }
};

const EpisodeTile = ({ a, audio }: { a: RecentAnime; audio: Audio }) => {
  const name = a.title.english || a.title.romaji || 'Untitled';
  const counts = useAudioCounts(a.id);
  const ref = useRef<HTMLAnchorElement>(null);
  const [reveal, setReveal] = useState(false);
  const timer = useRef<number>();
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setReveal(true);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
    }, 420);
  };
  const endPress = () => window.clearTimeout(timer.current);

  // hide again after a few seconds, or when touching anywhere else
  useEffect(() => {
    if (!reveal) return;
    const hide = window.setTimeout(() => setReveal(false), 4500);
    const onOutside = (e: TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setReveal(false);
    };
    document.addEventListener('touchstart', onOutside, { passive: true });
    return () => {
      window.clearTimeout(hide);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [reveal]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Dub tab: only shows that do have a dub (once we know).
  if (audio === 'dub' && counts && counts.dub === 0) return null;

  const sub = counts?.sub || a.episode;
  const dub = counts?.dub || 0;
  return (
    <Card
      ref={ref}
      to={`/watch/${a.id}?ep=${a.episode}&audio=${audio}`}
      $color={a.color || undefined}
      title={`${name} - Episode ${a.episode}`}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
      onTouchCancel={endPress}
      onContextMenu={(e) => {
        if (longPressed.current) e.preventDefault();
      }}
      onClick={(e) => {
        // a long-press only reveals the + button, it must not open the episode
        if (longPressed.current) {
          e.preventDefault();
          longPressed.current = false;
        }
      }}
    >
      <div className='poster'>
        <img src={a.image} alt={name} loading='lazy' decoding='async' />
        <span className='play'>
          <FaPlay />
        </span>
        <ListButton anime={a} show={reveal} />
        <div className='overlay'>
          <span>EP {a.episode}</span>
          <small>{timeAgo(a.airingAt)}</small>
        </div>
      </div>
      <div className='meta'>
        {audio === 'sub' ? (
          <MetaChip $tint={a.color || undefined}>
            <FaClosedCaptioning /> {sub}
          </MetaChip>
        ) : dub > 0 ? (
          <MetaChip $tint={a.color || undefined}>
            <FaMicrophone /> {dub}
          </MetaChip>
        ) : null}
        {a.type && <MetaChip>{typeLabel(a.type)}</MetaChip>}
        {a.releaseDate ? <MetaChip>{a.releaseDate}</MetaChip> : null}
      </div>
      <p className='name'>{name}</p>
    </Card>
  );
};

// ---------------------------------------------------------------------------
export const LatestEpisodes = ({
  items,
  loading,
}: {
  items: RecentAnime[];
  loading: boolean;
}) => {
  const [audio, setAudio] = useState<Audio>(readAudio);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() => perPageFor(window.innerWidth));

  useEffect(() => {
    const onResize = () => setPerPage(perPageFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pages);
  const visible = useMemo(
    () => items.slice((current - 1) * perPage, current * perPage),
    [items, current, perPage],
  );

  const chooseAudio = (a: Audio) => {
    setAudio(a);
    try {
      localStorage.setItem('preferred-audio', a);
    } catch {
      /* ignore */
    }
  };

  return (
    <Section>
      <Header>
        <h2>Latest Episodes</h2>
        <Controls>
          <Segment role='group' aria-label='Audio'>
            <SegButton $active={audio === 'sub'} onClick={() => chooseAudio('sub')}>
              Sub
            </SegButton>
            <SegButton $active={audio === 'dub'} onClick={() => chooseAudio('dub')}>
              Dub
            </SegButton>
          </Segment>
          <Pager>
            <PagerButton
              aria-label='Previous page'
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              <FaChevronLeft />
            </PagerButton>
            <span>
              {current}/{pages}
            </span>
            <PagerButton
              aria-label='Next page'
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              <FaChevronRight />
            </PagerButton>
          </Pager>
        </Controls>
      </Header>

      {loading ? (
        <Grid>
          {Array.from({ length: perPage }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </Grid>
      ) : visible.length === 0 ? (
        <Empty>No recent episodes right now.</Empty>
      ) : (
        <Grid>
          {visible.map((a) => (
            <EpisodeTile key={a.id} a={a} audio={audio} />
          ))}
        </Grid>
      )}
    </Section>
  );
};
