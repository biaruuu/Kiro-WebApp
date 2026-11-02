import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { FaChevronRight, FaTimes, FaPlay } from 'react-icons/fa';

// Reads the same localStorage keys the Watch page writes (see hooks/watchStorage.ts).
const WATCHED = 'watched-episodes';
const VISITED = 'last-anime-visited';
const TIMES = 'all_episode_times';

interface HistoryItem {
  animeId: string;
  title: string;
  image: string;
  number: number;
  total: number | null;
  percent: number;
  timestamp: number;
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

function loadHistory(): HistoryItem[] {
  const watched = readJson<Record<string, any[]>>(WATCHED, {});
  const visited = readJson<Record<string, any>>(VISITED, {});
  const times = readJson<Record<string, any>>(TIMES, {});

  return Object.entries(watched)
    .map(([animeId, episodes]) => {
      const last = Array.isArray(episodes) ? episodes[episodes.length - 1] : null;
      if (!last) return null;
      const meta = visited[animeId] ?? {};
      return {
        animeId,
        title: meta.titleEnglish || meta.titleRomaji || last.title || 'Anime',
        image: last.image || '',
        number: Number(last.number),
        total: meta.totalEpisodes ? Number(meta.totalEpisodes) : null,
        percent: Number(times[last.id]?.playbackPercentage ?? 0),
        timestamp: Number(meta.timestamp ?? 0),
      } as HistoryItem;
    })
    .filter((x): x is HistoryItem => !!x)
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ---------------------------------------------------------------------------
const Section = styled.section`
  margin-bottom: 1.75rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;

  h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  @media (min-width: 700px) {
    h2 {
      font-size: 1.45rem;
    }
  }
`;

export const ViewAll = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border: none;
  background: none;
  color: var(--global-text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;

  svg {
    font-size: 0.65rem;
  }
  &:hover {
    color: var(--global-text);
  }
`;

const Row = styled.div<{ $wrap: boolean }>`
  display: ${({ $wrap }) => ($wrap ? 'grid' : 'flex')};
  ${({ $wrap }) =>
    $wrap
      ? 'grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));'
      : 'overflow-x: auto; scroll-snap-type: x mandatory;'}
  gap: 0.75rem;
  padding-bottom: 0.2rem;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Card = styled(Link)<{ $wrap: boolean }>`
  position: relative;
  flex: 0 0 ${({ $wrap }) => ($wrap ? 'auto' : 'min(68vw, 18rem)')};
  scroll-snap-align: start;
  display: block;
  text-decoration: none;
  color: var(--global-text);

  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 22%;
    display: block;
    transition:
      transform 0.35s ease,
      filter 0.25s ease;
  }
  &:hover .thumb img {
    transform: scale(1.05);
    filter: brightness(0.7);
  }
  .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 2.2rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  &:hover .play {
    opacity: 1;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0.22rem;
    background: rgba(255, 255, 255, 0.28);
  }
  .bar {
    height: 100%;
    background: #ff3b30;
    border-radius: 0 0.2rem 0.2rem 0;
  }
  .title {
    margin: 0.6rem 0 0.15rem;
    font-size: 0.92rem;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ep {
    margin: 0;
    font-size: 0.82rem;
    color: var(--global-text-muted);
  }
`;

const Remove = styled.button`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(30, 30, 38, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.7rem;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    background: rgba(229, 72, 77, 0.9);
    color: #fff;
  }
`;

// ---------------------------------------------------------------------------
export const EpisodeCard = () => {
  const [items, setItems] = useState<HistoryItem[]>(() => loadHistory());
  const [showAll, setShowAll] = useState(false);

  const remove = useCallback((animeId: string) => {
    const watched = readJson<Record<string, any[]>>(WATCHED, {});
    delete watched[animeId];
    try {
      localStorage.setItem(WATCHED, JSON.stringify(watched));
    } catch {
      /* ignore */
    }
    setItems((prev) => prev.filter((i) => i.animeId !== animeId));
  }, []);

  const visible = useMemo(() => items.slice(0, showAll ? 60 : 20), [items, showAll]);

  if (!items.length) return null;

  return (
    <Section>
      <Header>
        <h2>Continue Watching</h2>
        {items.length > 1 && (
          <ViewAll onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : 'View all'} <FaChevronRight />
          </ViewAll>
        )}
      </Header>
      <Row $wrap={showAll}>
        {visible.map((item) => (
          <Card
            key={item.animeId}
            $wrap={showAll}
            to={`/watch/${item.animeId}?ep=${item.number}`}
            title={`Continue ${item.title} - Episode ${item.number}`}
          >
            <div className='thumb'>
              {item.image && <img src={item.image} alt='' loading='lazy' />}
              <span className='play'>
                <FaPlay />
              </span>
              <div className='track'>
                <div className='bar' style={{ width: `${Math.min(100, Math.max(item.percent, 5))}%` }} />
              </div>
            </div>
            <Remove
              aria-label={`Remove ${item.title} from Continue Watching`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                remove(item.animeId);
              }}
            >
              <FaTimes />
            </Remove>
            <p className='title'>{item.title}</p>
            <p className='ep'>
              Episode {item.number}
              {item.total ? ` / ${item.total}` : ''}
            </p>
          </Card>
        ))}
      </Row>
    </Section>
  );
};
