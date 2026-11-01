import { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Link } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaClosedCaptioning, FaPlay } from 'react-icons/fa';
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
  margin-bottom: 2.5rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;

  h2 {
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
    font-size: clamp(1.45rem, 4.6vw, 1.9rem);
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: none;
`;

const Segment = styled.div`
  display: inline-flex;
  padding: 0.3rem;
  border-radius: 999px;
  border: 1.5px solid var(--global-border);
  background: transparent;
`;

const SegButton = styled.button<{ $active: boolean }>`
  min-width: 4.4rem;
  padding: 0.7rem 1.2rem;
  border: none;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#0b0b10' : 'var(--global-text)')};
  background: ${({ $active }) => ($active ? '#b7a9ff' : 'transparent')};
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  @media (max-width: 420px) {
    min-width: 3.6rem;
    padding: 0.6rem 0.9rem;
  }
`;

const Pager = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 0.3rem;
  border-radius: 999px;
  border: 1.5px solid var(--global-border);
  font-size: 1rem;
  font-weight: 600;
  color: var(--global-text);

  span {
    min-width: 3rem;
    text-align: center;
  }
`;

const PagerButton = styled.button`
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--global-text-muted);
  font-size: 0.8rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--global-text);
    background: var(--global-secondary-bg);
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4rem 0.9rem;

  @media (min-width: 700px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.8rem 1.2rem;
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
    border-radius: 1rem;
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
    inset: 45% 0 0;
    background: linear-gradient(to top, rgba(8, 8, 12, 0.92), transparent);
    pointer-events: none;
  }
  &:hover .poster img {
    transform: scale(1.06);
    filter: brightness(0.62);
  }
  .play {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 2.4rem;
    opacity: 0;
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
    gap: 0.4rem;
    padding: 0.75rem 0.85rem;
    color: #fff;
    font-weight: 700;
    font-size: 1.15rem;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .overlay small {
    font-size: 1.02rem;
    font-weight: 600;
    opacity: 0.92;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0.85rem 0 0.65rem;
  }
  .name {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
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

  @media (max-width: 700px) {
    .overlay {
      font-size: 1.02rem;
      padding: 0.6rem 0.7rem;
    }
    .overlay small {
      font-size: 0.95rem;
    }
    .name {
      font-size: 1.12rem;
    }
  }
`;

const MetaChip = styled.span<{ $tint?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.7rem;
  border-radius: 0.55rem;
  background: ${({ $tint }) =>
    $tint ? `color-mix(in srgb, ${$tint} 22%, var(--global-secondary-bg))` : 'var(--global-secondary-bg)'};
  color: var(--global-text-muted);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  svg {
    font-size: 1rem;
  }
`;

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`;

const SkeletonCard = styled.div`
  aspect-ratio: 2 / 3.9;
  border-radius: 1rem;
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
          {visible.map((a) => {
            const name = a.title.english || a.title.romaji || 'Untitled';
            return (
              <Card
                key={a.id}
                to={`/watch/${a.id}?ep=${a.episode}&audio=${audio}`}
                $color={a.color || undefined}
                title={`${name} - Episode ${a.episode}`}
              >
                <div className='poster'>
                  <img src={a.image} alt={name} loading='lazy' />
                  <span className='play'>
                    <FaPlay />
                  </span>
                  <div className='overlay'>
                    <span>EP {a.episode}</span>
                    <small>{timeAgo(a.airingAt)}</small>
                  </div>
                </div>
                <div className='meta'>
                  <MetaChip $tint={a.color || undefined}>
                    <FaClosedCaptioning /> {a.episode}
                  </MetaChip>
                  {a.type && <MetaChip>{a.type.replace('_', ' ')}</MetaChip>}
                  {a.releaseDate ? <MetaChip>{a.releaseDate}</MetaChip> : null}
                </div>
                <p className='name'>{name}</p>
              </Card>
            );
          })}
        </Grid>
      )}
    </Section>
  );
};
