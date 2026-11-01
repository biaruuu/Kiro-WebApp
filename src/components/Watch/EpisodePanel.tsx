import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaListUl, FaThLarge, FaPlay } from 'react-icons/fa';
import type { StreamEpisode } from '../../hooks/anivexa';

const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  background: var(--global-secondary-bg);
  border: 1px solid var(--global-border);
  border-radius: calc(var(--global-border-radius) * 2);
  overflow: hidden;
  min-height: 0;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--global-border);

  h3 {
    margin: 0;
    font-size: 1rem;
  }
  small {
    color: var(--global-text-muted);
    font-weight: 500;
    margin-left: 0.4rem;
  }
`;

const Tools = styled.div`
  display: flex;
  gap: 0.4rem;
  align-items: center;
`;

const IconBtn = styled.button<{ $active?: boolean }>`
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: var(--global-border-radius);
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--global-text)')};
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-button-bg)'};
`;

const Ranges = styled.div`
  display: flex;
  gap: 0.4rem;
  padding: 0.6rem 1rem 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const RangeBtn = styled.button<{ $active: boolean }>`
  flex: none;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--global-border);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--global-text)')};
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'transparent'};
`;

const Scroll = styled.div`
  overflow-y: auto;
  padding: 0.6rem;
  flex: 1;
  min-height: 0;
  max-height: 38rem;

  @media (max-width: 1100px) {
    max-height: 24rem;
  }
`;

const Row = styled.button<{ $active: boolean; $watched: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.35rem;
  text-align: left;
  border: 1px solid
    ${({ $active }) => ($active ? 'var(--primary-accent)' : 'transparent')};
  border-radius: var(--global-border-radius);
  cursor: pointer;
  color: var(--global-text);
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent-bg)' : 'transparent'};
  opacity: ${({ $watched, $active }) => ($watched && !$active ? 0.6 : 1)};
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--global-tertiary-bg);
  }

  .thumb {
    position: relative;
    flex: none;
    width: 6.5rem;
    aspect-ratio: 16 / 9;
    border-radius: 0.35rem;
    overflow: hidden;
    background: var(--global-tertiary-bg);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb .num {
    position: absolute;
    left: 0.25rem;
    bottom: 0.25rem;
    padding: 0.05rem 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 0.25rem;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
  }
  .thumb .playing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
  }
  .meta {
    min-width: 0;
  }
  .meta strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.85rem;
  }
  .meta span {
    font-size: 0.72rem;
    color: var(--global-text-muted);
  }

  @media (max-width: 500px) {
    .thumb {
      width: 5.25rem;
    }
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.1rem, 1fr));
  gap: 0.4rem;
`;

const Cell = styled.button<{ $active: boolean; $watched: boolean; $filler: boolean }>`
  height: 2.6rem;
  border-radius: var(--global-border-radius);
  border: 1px solid
    ${({ $active, $filler }) =>
      $active ? 'var(--primary-accent)' : $filler ? '#c9a227' : 'var(--global-border)'};
  background: ${({ $active, $watched }) =>
    $active
      ? 'var(--primary-accent)'
      : $watched
        ? 'var(--global-tertiary-bg)'
        : 'var(--global-button-bg)'};
  color: ${({ $active }) => ($active ? '#fff' : 'var(--global-text)')};
  opacity: ${({ $watched, $active }) => ($watched && !$active ? 0.6 : 1)};
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    background: var(--primary-accent);
    color: #fff;
  }
`;

const Empty = styled.p`
  margin: 0;
  padding: 1.5rem 1rem;
  text-align: center;
  color: var(--global-text-muted);
  font-size: 0.9rem;
`;

const RANGE_SIZE = 50;

type Props = {
  episodes: StreamEpisode[];
  currentNumber?: number;
  watched: Set<number>;
  fallbackImage?: string;
  onSelect: (episode: StreamEpisode) => void;
};

export default function EpisodePanel({
  episodes,
  currentNumber,
  watched,
  fallbackImage,
  onSelect,
}: Props) {
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      const saved = localStorage.getItem('episode-view');
      if (saved === 'list' || saved === 'grid') return saved;
    } catch {
      /* ignore */
    }
    return episodes.length > 60 ? 'grid' : 'list';
  });
  const [range, setRange] = useState(0);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const ranges = useMemo(() => {
    const out: { label: string; from: number; to: number }[] = [];
    for (let i = 0; i < episodes.length; i += RANGE_SIZE) {
      const slice = episodes.slice(i, i + RANGE_SIZE);
      out.push({
        label: `${slice[0].number}-${slice[slice.length - 1].number}`,
        from: i,
        to: i + slice.length,
      });
    }
    return out;
  }, [episodes]);

  // Jump to the range holding the current episode.
  useEffect(() => {
    const idx = episodes.findIndex((e) => e.number === currentNumber);
    if (idx >= 0) setRange(Math.floor(idx / RANGE_SIZE));
  }, [currentNumber, episodes]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentNumber, range, view]);

  const changeView = (v: 'list' | 'grid') => {
    setView(v);
    try {
      localStorage.setItem('episode-view', v);
    } catch {
      /* ignore */
    }
  };

  const visible = ranges.length
    ? episodes.slice(ranges[Math.min(range, ranges.length - 1)].from, ranges[Math.min(range, ranges.length - 1)].to)
    : [];

  return (
    <Panel>
      <Header>
        <h3>
          Episodes<small>{episodes.length}</small>
        </h3>
        <Tools>
          <IconBtn
            $active={view === 'list'}
            onClick={() => changeView('list')}
            title='List view'
            aria-label='List view'
          >
            <FaListUl />
          </IconBtn>
          <IconBtn
            $active={view === 'grid'}
            onClick={() => changeView('grid')}
            title='Grid view'
            aria-label='Grid view'
          >
            <FaThLarge />
          </IconBtn>
        </Tools>
      </Header>

      {ranges.length > 1 && (
        <Ranges>
          {ranges.map((r, i) => (
            <RangeBtn key={r.label} $active={i === range} onClick={() => setRange(i)}>
              {r.label}
            </RangeBtn>
          ))}
        </Ranges>
      )}

      <Scroll>
        {visible.length === 0 ? (
          <Empty>No episodes available for this selection.</Empty>
        ) : view === 'grid' ? (
          <Grid>
            {visible.map((ep) => (
              <Cell
                key={ep.id}
                ref={ep.number === currentNumber ? activeRef : undefined}
                $active={ep.number === currentNumber}
                $watched={watched.has(ep.number)}
                $filler={ep.filler}
                title={ep.title || `Episode ${ep.number}`}
                onClick={() => onSelect(ep)}
              >
                {ep.number}
              </Cell>
            ))}
          </Grid>
        ) : (
          visible.map((ep) => {
            const active = ep.number === currentNumber;
            return (
              <Row
                key={ep.id}
                ref={active ? activeRef : undefined}
                $active={active}
                $watched={watched.has(ep.number)}
                onClick={() => onSelect(ep)}
              >
                <div className='thumb'>
                  {(ep.image || fallbackImage) && (
                    <img
                      src={ep.image || fallbackImage}
                      alt=''
                      loading='lazy'
                      onError={(e) => {
                        if (fallbackImage && e.currentTarget.src !== fallbackImage) {
                          e.currentTarget.src = fallbackImage;
                        }
                      }}
                    />
                  )}
                  <span className='num'>EP {ep.number}</span>
                  {active && (
                    <span className='playing'>
                      <FaPlay />
                    </span>
                  )}
                </div>
                <div className='meta'>
                  <strong>{ep.title || `Episode ${ep.number}`}</strong>
                  <span>
                    {[ep.airDate, ep.duration ? `${ep.duration}m` : null, ep.filler ? 'Filler' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </Row>
            );
          })
        )}
      </Scroll>
    </Panel>
  );
}
