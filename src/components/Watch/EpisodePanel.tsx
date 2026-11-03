import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaClosedCaptioning, FaMicrophone, FaPlay } from 'react-icons/fa';
import { FiEye, FiEyeOff, FiGrid, FiList, FiRepeat, FiX } from 'react-icons/fi';
import type { StreamEpisode } from '../../hooks/anivexa';

// ---------------------------------------------------------------------------
// Miruro-style episode sheet: handle, title + position, sort / spoiler / layout
// buttons, then either rich rows (thumbnail, title, synopsis, audio, date) or a
// compact grid of number pills.
// ---------------------------------------------------------------------------
const ACCENT = '#b7a9ff';
const LINE = 'color-mix(in srgb, var(--global-text) 18%, transparent)';

const Panel = styled.aside<{ $sheet?: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(30, 30, 34, 0.98);
  overflow: hidden;

  ${({ $sheet }) =>
    $sheet
      ? `
    /* bottom sheet: fills the space under the player */
    height: 100%;
    border-radius: 1.4rem 1.4rem 0 0;
    border: 1.5px solid ${LINE};
    border-bottom: none;
  `
      : `
    max-height: min(36rem, 74vh);
    border-radius: 1.4rem;
    border: 1.5px solid ${LINE};
    @media (min-width: 1000px) {
      max-height: calc(100vh - 6rem);
      border-radius: 1rem;
    }
  `}
`;

const Handle = styled.div<{ $always?: boolean }>`
  flex: none;
  display: grid;
  place-items: center;
  height: 1.9rem;
  &::before {
    content: '';
    width: 2.6rem;
    height: 0.28rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.28);
  }
  @media (min-width: 1000px) {
    display: ${({ $always }) => ($always ? 'grid' : 'none')};
  }
`;

const Header = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.2rem 0.8rem 0.7rem;
  border-bottom: 1.5px solid ${LINE};

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  h3 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .pos {
    flex: none;
    color: var(--global-text-muted);
    font-size: 0.78rem;
    font-weight: 500;
  }
  @media (min-width: 1000px) {
    padding-top: 0.8rem;
  }
`;

const Tools = styled.div`
  flex: none;
  display: flex;
  gap: 0.4rem;
`;

const ToolBtn = styled.button<{ $active?: boolean }>`
  display: grid;
  place-items: center;
  width: 2.05rem;
  height: 2.05rem;
  padding: 0;
  border-radius: 0.6rem;
  border: 1.5px solid ${({ $active }) => ($active ? ACCENT : LINE)};
  background: transparent;
  color: ${({ $active }) => ($active ? ACCENT : 'var(--global-text)')};
  font-size: 0.92rem;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  svg {
    flex: none;
  }
`;

const Ranges = styled.div`
  flex: none;
  display: flex;
  gap: 0.4rem;
  padding: 0.6rem 0.9rem 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const RangeBtn = styled.button<{ $active: boolean }>`
  flex: none;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1.5px solid ${({ $active }) => ($active ? ACCENT : LINE)};
  background: ${({ $active }) => ($active ? 'rgba(183,169,255,0.16)' : 'transparent')};
  color: ${({ $active }) => ($active ? ACCENT : 'var(--global-text)')};
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
`;

const Scroll = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem 0.5rem 0.8rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
  overscroll-behavior: contain;
`;

const Row = styled.button<{ $active: boolean; $watched: boolean }>`
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 4.9rem;
  margin: 0 0 0.4rem;
  padding: 0;
  text-align: left;
  border-radius: 1rem;
  border: 1.5px solid ${({ $active }) => ($active ? ACCENT : LINE)};
  background: ${({ $active }) => ($active ? 'rgba(183,169,255,0.26)' : 'rgba(255,255,255,0.045)')};
  color: var(--global-text);
  cursor: pointer;
  overflow: hidden;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${({ $active }) => ($active ? 'rgba(183,169,255,0.32)' : 'rgba(255,255,255,0.08)')};
  }

  .thumb {
    position: relative;
    flex: none;
    width: 7.2rem;
    background: var(--global-tertiary-bg);
    overflow: hidden;
  }
  .thumb img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: ${({ $watched, $active }) => ($watched && !$active ? 0.6 : 1)};
  }
  .thumb img.blur {
    filter: blur(14px) brightness(0.55) saturate(1.2);
    transform: scale(1.25);
  }
  .thumb .hidden {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0 0.5rem 1rem;
    text-align: center;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    line-height: 1.5;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.85);
  }
  .thumb .num {
    position: absolute;
    left: 0.4rem;
    bottom: 0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.28rem 0.55rem;
    border-radius: 999px;
    background: rgba(8, 8, 10, 0.72);
    font-size: 0.68rem;
    font-weight: 700;
    color: #fff;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.25rem;
    padding: 0.45rem 0.7rem 0.4rem 0.65rem;
  }
  .name {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.25;
    color: ${({ $active }) => ($active ? ACCENT : 'var(--global-text)')};
  }
  .desc {
    margin: 0.15rem 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--global-text-muted);
    font-size: 0.68rem;
    line-height: 1.2;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--global-text-muted);
    font-size: 0.68rem;
  }
  .foot svg {
    font-size: 0.74rem;
  }
  .foot .off {
    opacity: 0.28;
  }
  .foot .date {
    margin-left: auto;
    white-space: nowrap;
  }

  @media (min-width: 700px) {
    .thumb {
      width: 8.2rem;
    }
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.1rem 0.1rem 0;

  @media (min-width: 700px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  @media (min-width: 1000px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const Pill = styled.button<{ $active: boolean; $watched: boolean; $filler: boolean }>`
  display: grid;
  place-items: center;
  height: 2rem;
  padding: 0;
  border-radius: 999px;
  border: 1.5px solid
    ${({ $active, $filler }) => ($active ? 'transparent' : $filler ? '#c9a227' : LINE)};
  background: ${({ $active }) => ($active ? ACCENT : 'transparent')};
  color: ${({ $active }) => ($active ? '#0b0b10' : 'var(--global-text)')};
  opacity: ${({ $watched, $active }) => ($watched && !$active ? 0.55 : 1)};
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  &:hover {
    background: ${({ $active }) => ($active ? ACCENT : 'rgba(255,255,255,0.09)')};
  }
`;

const Empty = styled.p`
  margin: 0;
  padding: 1.5rem 1rem;
  text-align: center;
  color: var(--global-text-muted);
  font-size: 0.9rem;
`;

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const RANGE_SIZE = 100;

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

type Props = {
  title?: string;
  episodes: StreamEpisode[];
  currentNumber?: number;
  watched: Set<number>;
  fallbackImage?: string;
  /** episode numbers that exist with subtitles / with a dub (any source) */
  subNumbers?: Set<number>;
  dubNumbers?: Set<number>;
  onSelect: (episode: StreamEpisode) => void;
  /** render as a bottom sheet (phones / tablets) with a close button */
  sheet?: boolean;
  onClose?: () => void;
};

export default function EpisodePanel({
  title,
  episodes,
  currentNumber,
  watched,
  fallbackImage,
  subNumbers,
  dubNumbers,
  onSelect,
  sheet,
  onClose,
}: Props) {
  const [grid, setGrid] = useState(() => read('episode-view', 'list') === 'grid');
  const [desc, setDesc] = useState(() => read('episode-newest-first', '0') === '1');
  const [hidden, setHidden] = useState(() => read('episode-hide-spoilers', '0') === '1');
  const [range, setRange] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const ordered = useMemo(() => (desc ? [...episodes].reverse() : episodes), [episodes, desc]);

  const ranges = useMemo(() => {
    const out: { label: string; from: number; to: number }[] = [];
    for (let i = 0; i < ordered.length; i += RANGE_SIZE) {
      const slice = ordered.slice(i, i + RANGE_SIZE);
      out.push({
        label: `${slice[0].number}-${slice[slice.length - 1].number}`,
        from: i,
        to: i + slice.length,
      });
    }
    return out;
  }, [ordered]);

  // Jump to the range holding the current episode.
  useEffect(() => {
    const idx = ordered.findIndex((e) => e.number === currentNumber);
    if (idx >= 0) setRange(Math.floor(idx / RANGE_SIZE));
  }, [currentNumber, ordered]);

  // Keep the playing episode in view inside the panel (never scrolls the page).
  useEffect(() => {
    const box = scrollRef.current;
    const el = activeRef.current;
    if (!box || !el) return;
    box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2);
  }, [currentNumber, range, grid, desc]);

  const current = ranges[Math.min(range, Math.max(0, ranges.length - 1))];
  const visible = current ? ordered.slice(current.from, current.to) : [];
  const position = episodes.findIndex((e) => e.number === currentNumber) + 1;

  return (
    <Panel $sheet={sheet}>
      <Handle $always={sheet} />
      <Header>
        <div className='title'>
          <h3>{title || 'Episodes'}</h3>
          <span className='pos'>
            {position || '–'} / {episodes.length}
          </span>
        </div>
        <Tools>
          <ToolBtn
            $active={desc}
            title={desc ? 'Newest first' : 'Oldest first'}
            aria-label='Reverse order'
            aria-pressed={desc}
            onClick={() => {
              setDesc(!desc);
              write('episode-newest-first', desc ? '0' : '1');
            }}
          >
            <FiRepeat style={{ transform: 'rotate(90deg)' }} />
          </ToolBtn>
          <ToolBtn
            title={hidden ? 'Show spoilers' : 'Hide spoilers'}
            aria-label='Toggle spoilers'
            aria-pressed={hidden}
            onClick={() => {
              setHidden(!hidden);
              write('episode-hide-spoilers', hidden ? '0' : '1');
            }}
          >
            {hidden ? <FiEyeOff /> : <FiEye />}
          </ToolBtn>
          <ToolBtn
            title={grid ? 'List view' : 'Grid view'}
            aria-label='Toggle layout'
            onClick={() => {
              setGrid(!grid);
              write('episode-view', grid ? 'list' : 'grid');
            }}
          >
            {grid ? <FiList /> : <FiGrid />}
          </ToolBtn>
          {onClose && (
            <ToolBtn title='Close' aria-label='Close episodes' onClick={onClose}>
              <FiX />
            </ToolBtn>
          )}
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

      <Scroll ref={scrollRef}>
        {visible.length === 0 ? (
          <Empty>No episodes available for this selection.</Empty>
        ) : grid ? (
          <Grid>
            {visible.map((ep) => {
              const on = ep.number === currentNumber;
              return (
                <Pill
                  key={ep.id}
                  ref={on ? activeRef : undefined}
                  $active={on}
                  $watched={watched.has(ep.number)}
                  $filler={ep.filler}
                  title={ep.title || `Episode ${ep.number}`}
                  onClick={() => onSelect(ep)}
                >
                  {on ? <FaPlay style={{ fontSize: '0.8rem' }} /> : ep.number}
                </Pill>
              );
            })}
          </Grid>
        ) : (
          visible.map((ep) => {
            const on = ep.number === currentNumber;
            const img = ep.image || fallbackImage;
            const hasSub = subNumbers ? subNumbers.has(ep.number) : true;
            const hasDub = dubNumbers ? dubNumbers.has(ep.number) : false;
            const generic = !ep.title || /^episode\s*\d+$/i.test(ep.title.trim());
            const text = ep.description?.trim();
            return (
              <Row
                key={ep.id}
                ref={on ? activeRef : undefined}
                $active={on}
                $watched={watched.has(ep.number)}
                onClick={() => onSelect(ep)}
              >
                <div className='thumb'>
                  {img && (
                    <img
                      className={hidden ? 'blur' : undefined}
                      src={img}
                      alt=''
                      loading='lazy'
                      decoding='async'
                      onError={(e) => {
                        if (fallbackImage && e.currentTarget.src !== fallbackImage) {
                          e.currentTarget.src = fallbackImage;
                        }
                      }}
                    />
                  )}
                  {hidden && <span className='hidden'>Hidden spoiler</span>}
                  <span className='num'>EP {ep.number}</span>
                </div>
                <div className='info'>
                  <div>
                    <p className='name'>{generic ? `Episode ${ep.number}` : ep.title}</p>
                    {text && <p className='desc'>{hidden ? 'Hidden description' : text}</p>}
                  </div>
                  <div className='foot'>
                    <FaClosedCaptioning className={hasSub ? undefined : 'off'} />
                    <FaMicrophone className={hasDub ? undefined : 'off'} />
                    <span className='date'>{fmtDate(ep.airDate)}</span>
                  </div>
                </div>
              </Row>
            );
          })
        )}
      </Scroll>
    </Panel>
  );
}
