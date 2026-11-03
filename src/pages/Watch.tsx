import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { FaClosedCaptioning, FaMicrophone, FaPlay } from 'react-icons/fa';
import {
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiList,
  FiMoreVertical,
  FiStar,
  FiZap,
} from 'react-icons/fi';
import StreamPlayer from '../components/Watch/Video/StreamPlayer';
import EpisodePanel from '../components/Watch/EpisodePanel';
import { ListButton } from '../components/Home/ListButton';
import { fetchAnimeData } from '../hooks/useApi';
import {
  fetchProviderEpisodes,
  fetchWatch,
  providerLabel,
  type Audio,
  type ProviderEpisodes,
  type StreamEpisode,
  type WatchData,
} from '../hooks/anivexa';
import { fetchSeasons, useAudioCounts, type SeasonEntry } from '../hooks/extras';
import {
  getLastWatchedNumber,
  getProgress,
  getWatchedNumbers,
  markWatched,
  readFlag,
  saveProgress,
  writeFlag,
} from '../hooks/watchStorage';
import type { Anime } from '../hooks/interface';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const dateLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const seasonLabel = (season?: string, year?: number | null) => {
  const s = season ? season.charAt(0) + season.slice(1).toLowerCase() : '';
  return [s, year].filter(Boolean).join(' ');
};

const RELATION: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Parent story',
  ALTERNATIVE: 'Alternative',
  SUMMARY: 'Summary',
  CHARACTER: 'Character',
  OTHER: 'Other',
  COMPILATION: 'Compilation',
  CONTAINS: 'Contains',
};

const STATUS_DOT: Record<string, string> = {
  Ongoing: '#22c55e',
  Completed: '#0ea5e9',
  'Not yet aired': '#fbbf24',
  Cancelled: '#f87171',
  Hiatus: '#fb923c',
};

const nameOf = (t?: { english?: string | null; romaji?: string | null; userPreferred?: string }) =>
  t?.english || t?.romaji || t?.userPreferred || 'Untitled';

const isGenericTitle = (t?: string | null) => !t || /^episode\s*\d+$/i.test(t.trim());

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const Page = styled.div`
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  max-width: 120rem;
  margin: 0 auto;

  @media (min-width: 1000px) {
    grid-template-columns: minmax(0, 1fr) 22rem;
    gap: 1.25rem;
  }
  @media (min-width: 1300px) {
    grid-template-columns: minmax(0, 1fr) 25rem;
  }
`;

const Main = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
`;

const Side = styled.div`
  display: none;
  min-width: 0;
  @media (min-width: 1000px) {
    display: block;
    position: sticky;
    top: 4.25rem;
  }
`;

// soft blurred poster glow behind the info area, like miruro
const Ambient = styled.div<{ $img?: string }>`
  position: absolute;
  z-index: -1;
  left: -1rem;
  right: -1rem;
  top: 0;
  height: 34rem;
  pointer-events: none;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);

  &::before {
    content: '';
    position: absolute;
    inset: -3rem;
    background: ${({ $img }) => ($img ? `url(${$img}) center / cover no-repeat` : 'none')};
    filter: blur(46px) saturate(1.2);
    opacity: 0.32;
    transform: translateZ(0);
  }
`;

const PlayerBox = styled.div`
  /* full-bleed under the navbar on phones */
  margin: 0 -0.5rem;
  @media (min-width: 700px) {
    margin: 0;
  }
`;

const Pad = styled.div`
  padding: 0 0.4rem;
  min-width: 0;
  @media (min-width: 700px) {
    padding: 0;
  }
`;

const EpHead = styled.div`
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    color: var(--global-text-muted);
    font-size: 0.78rem;
  }
  h1 {
    margin: 0.4rem 0 0;
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.005em;
  }
  @media (min-width: 700px) {
    .meta {
      font-size: 0.85rem;
    }
    h1 {
      font-size: 1.5rem;
    }
  }
`;

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.6rem;
  @media (min-width: 700px) {
    grid-template-columns: 11rem 12rem auto;
  }
`;

const PopWrap = styled.div`
  position: relative;
  min-width: 0;
`;

const PopBtn = styled.button<{ $icon?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.5rem;
  padding: ${({ $icon }) => ($icon ? '0' : '0 0.8rem')};
  min-width: ${({ $icon }) => ($icon ? '2.5rem' : '0')};
  border-radius: 0.7rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  background: rgba(16, 16, 20, 0.55);
  color: var(--global-text);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s ease;
  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    flex: none;
    color: var(--global-text-muted);
    transition: transform 0.2s ease;
  }
  &[aria-expanded='true'] .chev {
    transform: rotate(180deg);
  }
  svg {
    flex: none;
  }
`;

const pop = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: none; }
`;

const PopMenu = styled.div<{ $right?: boolean }>`
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.4rem);
  ${({ $right }) => ($right ? 'right: 0;' : 'left: 0;')}
  min-width: max(100%, 14rem);
  max-width: min(22rem, calc(100vw - 1.5rem));
  padding: 0.35rem;
  border-radius: 0.8rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  background: rgba(22, 22, 28, 0.97);
  box-shadow: 0 1rem 2.4rem rgba(0, 0, 0, 0.55);
  animation: ${pop} 0.16s ease;

  .title {
    padding: 0.55rem 0.7rem 0.4rem;
    color: var(--global-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
`;

const MenuItem = styled.button<{ $on?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.7rem;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: ${({ $on }) => ($on ? '#b7a9ff' : 'var(--global-text)')};
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.07);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .grow {
    flex: 1;
  }
  .tag {
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--global-text) 25%, transparent);
    background: rgba(255, 255, 255, 0.05);
    color: var(--global-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
  }
`;

const Switch = styled.span<{ $on: boolean }>`
  position: relative;
  flex: none;
  width: 2.2rem;
  height: 1.25rem;
  border-radius: 999px;
  background: ${({ $on }) => ($on ? '#b7a9ff' : 'rgba(255,255,255,0.16)')};
  transition: background-color 0.2s ease;
  &::after {
    content: '';
    position: absolute;
    top: 0.15rem;
    left: ${({ $on }) => ($on ? '1.05rem' : '0.15rem')};
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    background: #fff;
    transition: left 0.2s ease;
  }
`;

const EpBar = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  border-radius: 0.8rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  background: rgba(16, 16, 20, 0.55);
  overflow: hidden;

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    height: 2.7rem;
    border: none;
    background: transparent;
    color: var(--global-text);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  button + button {
    border-left: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  }
  button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.07);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .muted {
    color: var(--global-text-muted);
  }
  button.on {
    background: rgba(183, 169, 255, 0.12);
    color: #cfc6ff;
  }
  @media (min-width: 1000px) {
    display: none;
  }
`;

const EpDrawer = styled.div`
  @media (min-width: 1000px) {
    display: none;
  }
`;

const Card = styled.section`
  padding: 1rem;
  border-radius: 1rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 14%, transparent);
  background: color-mix(in srgb, var(--global-secondary-bg) 92%, transparent);
  min-width: 0;
`;

const AnimeHead = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;

  .poster {
    flex: none;
    width: 3.4rem;
    aspect-ratio: 2 / 3;
    border-radius: 0.6rem;
    overflow: hidden;
    border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
    background: var(--global-tertiary-bg);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  .txt a {
    color: var(--global-text);
    text-decoration: none;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.45rem;
    margin-top: 0.4rem;
    color: var(--global-text-muted);
    font-size: 0.8rem;
  }
  .sub span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .sub svg {
    font-size: 0.8rem;
  }
  @media (min-width: 700px) {
    .poster {
      width: 4.2rem;
    }
    h2 {
      font-size: 1.2rem;
    }
  }
`;

const Synopsis = styled.div<{ $open: boolean }>`
  margin-top: 0.85rem;
  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.86rem;
    line-height: 1.7;
    white-space: pre-line;
    ${({ $open }) =>
      $open ? '' : 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'}
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.55rem;
    color: var(--global-text-muted);
    font-size: 0.8rem;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0;
    border: none;
    background: none;
    color: var(--global-text);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
  }
  button svg {
    transition: transform 0.25s ease;
  }
  button[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
`;

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
  font-size: 1.05rem;
  font-weight: 600;
  svg {
    font-size: 1.2rem;
  }
`;

const SeasonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.6rem, 1fr));
  gap: 0.6rem;
`;

const SeasonTile = styled(Link)<{ $img?: string; $current?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-height: 5rem;
  padding: 0.6rem;
  border-radius: 0.8rem;
  overflow: hidden;
  text-decoration: none;
  color: var(--global-text);
  border: 1.5px solid
    ${({ $current }) =>
      $current ? 'rgba(255,255,255,0.55)' : 'color-mix(in srgb, var(--global-text) 22%, transparent)'};
  background:
    linear-gradient(rgba(10, 10, 14, 0.55), rgba(10, 10, 14, 0.7)),
    ${({ $img }) => ($img ? `url(${$img}) center / cover no-repeat` : 'var(--global-tertiary-bg)')};
  transition: transform 0.2s ease;
  &:hover {
    transform: translateY(-2px);
  }
  strong {
    font-size: 1.05rem;
    font-weight: 600;
    text-shadow: 0 0.1rem 0.6rem rgba(0, 0, 0, 0.6);
  }
  small {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.82rem;
  }
  .cur {
    position: absolute;
    top: 0.4rem;
    left: 0.4rem;
    padding: 0.18rem 0.5rem;
    border-radius: 0.45rem;
    background: rgba(10, 10, 14, 0.85);
    font-size: 0.68rem;
    font-weight: 600;
  }
`;

const ListCard = styled.section`
  padding: 0.9rem;
  border-radius: 1rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  min-width: 0;

  > header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3rem 0.2rem 0.8rem;
    border: none;
    background: none;
    color: var(--global-text);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
  }
  > header svg {
    transition: transform 0.2s ease;
  }
  > header[aria-expanded='true'] svg {
    transform: rotate(90deg);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
`;

const ShowMore = styled.button`
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.7rem;
  border: none;
  border-radius: 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  color: var(--global-text-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  &:hover {
    background: rgba(255, 255, 255, 0.09);
  }
  svg {
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
`;

const RowLink = styled(Link)<{ $bg?: string }>`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0.9rem;
  min-height: 5.6rem;
  border-radius: 0.8rem;
  overflow: hidden;
  text-decoration: none;
  color: var(--global-text);
  background:
    linear-gradient(90deg, rgba(24, 24, 28, 0.98) 38%, rgba(24, 24, 28, 0.82) 100%),
    ${({ $bg }) => ($bg ? `url(${$bg}) center / cover no-repeat` : 'transparent')};
  background-color: #18181c;

  .poster {
    position: relative;
    flex: none;
    width: 4.1rem;
    background: var(--global-tertiary-bg);
  }
  .poster img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .poster .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  &:hover .poster .play {
    opacity: 1;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem 0.7rem 0.6rem 0;
  }
  .name {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .name .dot {
    flex: none;
    width: 0.55rem;
    height: 0.55rem;
    margin-top: 0.4rem;
    border-radius: 50%;
  }
  .name span.t {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  &:hover .name span.t {
    color: #ffd166;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .rel {
    color: #b7a9ff;
    font-size: 0.74rem;
    font-weight: 600;
  }
  @media (min-width: 700px) {
    .poster {
      width: 4.6rem;
    }
  }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.28rem 0.5rem;
  border-radius: 0.45rem;
  background: rgba(255, 255, 255, 0.09);
  color: color-mix(in srgb, var(--global-text) 82%, transparent);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
  svg {
    font-size: 0.72rem;
  }
`;

const Notice = styled.div<{ $tone?: 'warn' | 'error' }>`
  padding: 0.65rem 0.9rem;
  border-radius: 0.7rem;
  font-size: 0.85rem;
  border: 1px solid ${({ $tone }) => ($tone === 'error' ? '#f4433666' : '#d69e0066')};
  background: ${({ $tone }) => ($tone === 'error' ? '#f4433614' : '#d69e0014')};
  color: var(--global-text);
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  .actions button,
  .actions a {
    padding: 0.45rem 0.9rem;
    border-radius: 0.55rem;
    border: 1px solid color-mix(in srgb, var(--global-text) 25%, transparent);
    background: rgba(255, 255, 255, 0.07);
    color: var(--global-text);
    font-size: 0.82rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
`;

const Skeleton = styled.div<{ $h: string }>`
  height: ${({ $h }) => $h};
  border-radius: 0.8rem;
  background: linear-gradient(
    90deg,
    var(--global-secondary-bg),
    var(--global-tertiary-bg),
    var(--global-secondary-bg)
  );
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

// ---------------------------------------------------------------------------
// small components
// ---------------------------------------------------------------------------
function Pop({
  button,
  children,
  right,
}: {
  button: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  right?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <PopWrap ref={ref}>
      {button(open, () => setOpen((v) => !v))}
      {open && <PopMenu $right={right}>{children(() => setOpen(false))}</PopMenu>}
    </PopWrap>
  );
}

const CountChips = ({ id, enabled = true }: { id: string; enabled?: boolean }) => {
  const c = useAudioCounts(id, enabled);
  if (!c || (!c.sub && !c.dub)) return null;
  if (c.sub && c.dub && c.sub === c.dub) {
    return (
      <Chip>
        <FaClosedCaptioning />
        <FaMicrophone /> {c.sub}
      </Chip>
    );
  }
  return (
    <>
      {c.sub > 0 && (
        <Chip>
          <FaClosedCaptioning /> {c.sub}
        </Chip>
      )}
      {c.dub > 0 && (
        <Chip>
          <FaMicrophone /> {c.dub}
        </Chip>
      )}
    </>
  );
};

const MiniRow = ({ item, counts }: { item: any; counts: boolean }) => {
  const name = nameOf(item.title);
  const rel = item.relationType ? (RELATION[item.relationType] ?? item.relationType) : '';
  return (
    <RowLink to={`/anime/${item.id}`} $bg={item.cover} title={name}>
      <div className='poster'>
        {item.image && <img src={item.image} alt={name} loading='lazy' decoding='async' />}
        <span className='play'>
          <FaPlay />
        </span>
      </div>
      <div className='info'>
        <div className='name'>
          <i className='dot' style={{ background: STATUS_DOT[item.status] ?? '#0ea5e9' }} />
          <span className='t'>{name}</span>
        </div>
        <div className='chips'>
          {item.type && <Chip>{String(item.type).replace(/_/g, ' ')}</Chip>}
          {item.releaseDate ? (
            <Chip>
              <FiCalendar /> {item.releaseDate}
            </Chip>
          ) : null}
          {counts && <CountChips id={String(item.id)} enabled={item.status !== 'Not yet aired'} />}
          {item.rating ? (
            <Chip>
              <FiStar /> {item.rating}
            </Chip>
          ) : null}
        </div>
        {rel && <span className='rel'>{rel}</span>}
      </div>
    </RowLink>
  );
};

const ANIME_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Watch() {
  const { animeId = '', episodeNumber } = useParams();
  const [search, setSearch] = useSearchParams();

  const [anime, setAnime] = useState<Anime | null>(null);
  const [providers, setProviders] = useState<ProviderEpisodes[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [audioPref, setAudioPref] = useState<Audio>(() => {
    const q = search.get('audio');
    if (q === 'sub' || q === 'dub') return q;
    try {
      const saved = localStorage.getItem('preferred-audio');
      if (saved === 'sub' || saved === 'dub') return saved;
    } catch {
      /* ignore */
    }
    return 'sub';
  });
  const [providerPref, setProviderPref] = useState<string | null>(
    search.get('provider'),
  );

  const [watch, setWatch] = useState<WatchData | null>(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const [autoPlay, setAutoPlay] = useState(() => readFlag('autoPlay', true));
  const [autoNext, setAutoNext] = useState(() => readFlag('autoNext', true));
  const [autoSkip, setAutoSkip] = useState(() => readFlag('autoSkip', false));

  const [watchedTick, setWatchedTick] = useState(0);
  const [epsOpen, setEpsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(true);
  const [recOpen, setRecOpen] = useState(true);
  const [recMore, setRecMore] = useState(false);
  const [seasons, setSeasons] = useState<SeasonEntry[]>([]);
  const triedProviders = useRef<Set<string>>(new Set());

  // ----- load anime details (AniList) -----
  useEffect(() => {
    let alive = true;
    setAnime(null);
    if (!animeId) return;
    fetchAnimeData(animeId)
      .then((a) => alive && setAnime(a as Anime))
      .catch(() => {
        /* the player still works without the details card */
      });
    return () => {
      alive = false;
    };
  }, [animeId]);

  // ----- seasons / parts of the franchise -----
  useEffect(() => {
    let alive = true;
    setSeasons([]);
    if (animeId) fetchSeasons(animeId).then((v) => alive && setSeasons(v));
    return () => {
      alive = false;
    };
  }, [animeId]);

  // ----- load episode lists from every provider -----
  useEffect(() => {
    let alive = true;
    setProviders(null);
    setProvidersError(null);
    triedProviders.current = new Set();
    if (!animeId) return;
    fetchProviderEpisodes(animeId)
      .then((p) => alive && setProviders(p))
      .catch((e) => {
        if (alive) {
          setProviders([]);
          setProvidersError(e?.message || 'Could not reach the streaming API.');
        }
      });
    return () => {
      alive = false;
    };
  }, [animeId, reloadKey]);

  // ----- derive audio / provider / episodes -----
  const hasAudio = useMemo(
    () => ({
      sub: !!providers?.some((p) => p.sub.length),
      dub: !!providers?.some((p) => p.dub.length),
    }),
    [providers],
  );

  const audio: Audio =
    providers && !hasAudio[audioPref] && hasAudio[audioPref === 'sub' ? 'dub' : 'sub']
      ? audioPref === 'sub'
        ? 'dub'
        : 'sub'
      : audioPref;

  const providerOptions = useMemo(
    () => (providers ?? []).filter((p) => p[audio].length > 0),
    [providers, audio],
  );

  const activeProvider =
    providerOptions.find((p) => p.provider === providerPref) ?? providerOptions[0];
  const episodes: StreamEpisode[] = activeProvider?.[audio] ?? [];

  const requestedEp = Number(search.get('ep') ?? episodeNumber ?? 0) || 0;
  const currentEp: StreamEpisode | undefined = useMemo(() => {
    if (!episodes.length) return undefined;
    const byNumber = (n?: number) => episodes.find((e) => e.number === n);
    return (
      byNumber(requestedEp) ||
      byNumber(getLastWatchedNumber(animeId)) ||
      episodes[0]
    );
  }, [episodes, requestedEp, animeId]);

  const currentIndex = currentEp ? episodes.findIndex((e) => e.id === currentEp.id) : -1;

  // ----- URL helpers -----
  const updateParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(search);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      setSearch(next, { replace: true });
    },
    [search, setSearch],
  );

  const selectEpisode = (ep: StreamEpisode) => {
    triedProviders.current = new Set();
    setProviderNotice(null);
    setEpsOpen(false);
    setDescOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateParams({ ep: String(ep.number) });
  };

  const changeAudio = (a: Audio) => {
    setAudioPref(a);
    try {
      localStorage.setItem('preferred-audio', a);
    } catch {
      /* ignore */
    }
    triedProviders.current = new Set();
    setProviderNotice(null);
    updateParams({ audio: a, provider: undefined });
    setProviderPref(null);
  };

  const changeProvider = (name: string) => {
    triedProviders.current = new Set();
    setProviderNotice(null);
    setProviderPref(name);
    updateParams({ provider: name });
  };

  // ----- load streams for the current episode -----
  useEffect(() => {
    if (!currentEp) {
      setWatch(null);
      return;
    }
    let alive = true;
    setWatch(null);
    setWatchError(null);
    setWatchLoading(true);
    fetchWatch(currentEp.id)
      .then((d) => alive && setWatch(d))
      .catch((e) => alive && setWatchError(e?.message || 'Failed to load streams.'))
      .finally(() => alive && setWatchLoading(false));
    return () => {
      alive = false;
    };
  }, [currentEp?.id]);

  // If this provider has nothing playable for the episode, try the next one.
  useEffect(() => {
    if (!currentEp || !activeProvider || watchLoading) return;
    const empty = !!watchError || (watch !== null && watch.streams.length === 0);
    if (!empty) return;
    triedProviders.current.add(activeProvider.provider);
    const next = providerOptions.find(
      (p) =>
        !triedProviders.current.has(p.provider) &&
        p[audio].some((e) => e.number === currentEp.number),
    );
    if (next) {
      setProviderNotice(
        `${providerLabel(activeProvider.provider)} had no sources for episode ${currentEp.number} — switched to ${providerLabel(next.provider)}.`,
      );
      setProviderPref(next.provider);
    }
  }, [watch, watchError, watchLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- history + document title -----
  const title = anime?.title?.english || anime?.title?.romaji || 'Anime';

  useEffect(() => {
    if (!currentEp) return;
    markWatched(
      animeId,
      {
        titleEnglish: anime?.title?.english,
        titleRomaji: anime?.title?.romaji,
        totalEpisodes: anime?.totalEpisodes,
      },
      { ...currentEp, image: currentEp.image || anime?.cover || anime?.image },
    );
    setWatchedTick((n) => n + 1);
  }, [currentEp?.number, anime?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = currentEp
      ? `${title} - Episode ${currentEp.number} | AniMallu`
      : `${title} | AniMallu`;
  }, [title, currentEp]);

  const watched = useMemo(() => getWatchedNumbers(animeId), [animeId, watchedTick]);
  const resumeAt = currentEp ? getProgress(animeId, currentEp.number)?.currentTime ?? 0 : 0;

  // ----- prev / next -----
  const goPrev = () => currentIndex > 0 && selectEpisode(episodes[currentIndex - 1]);
  const goNext = () =>
    currentIndex >= 0 && currentIndex < episodes.length - 1 && selectEpisode(episodes[currentIndex + 1]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.shiftKey && e.key.toLowerCase() === 'n') goNext();
      if (e.shiftKey && e.key.toLowerCase() === 'p') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ----- render -----
  const poster = currentEp?.image || anime?.cover || anime?.image;
  const noSources = providers !== null && providers.length === 0;
  const prevEp = currentIndex > 0 ? episodes[currentIndex - 1] : undefined;
  const nextEp =
    currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : undefined;

  const subNumbers = new Set<number>();
  const dubNumbers = new Set<number>();
  for (const p of providers ?? []) {
    p.sub.forEach((e) => subNumbers.add(e.number));
    p.dub.forEach((e) => dubNumbers.add(e.number));
  }

  const subTotal = Math.max(0, ...(providers ?? []).map((p) => p.sub.length));
  const dubTotal = Math.max(0, ...(providers ?? []).map((p) => p.dub.length));

  const epTitle = currentEp && !isGenericTitle(currentEp.title) ? currentEp.title! : title;
  const epDate = dateLabel(currentEp?.airDate);
  const season = anime ? seasonLabel((anime as any).season, anime.releaseDate as any) : '';

  const synopsisIsEpisode = !!currentEp?.description?.trim();
  const synopsis = (synopsisIsEpisode ? currentEp!.description! : anime?.description) || '';

  const relations = ((anime?.relations ?? []) as any[]).filter(
    (r) => r.id && ANIME_FORMATS.includes(r.type),
  );
  const recommendations = ((anime?.recommendations ?? []) as any[]).filter(
    (r) => r.id && ANIME_FORMATS.includes(r.type),
  );
  const recShown = recMore ? recommendations : recommendations.slice(0, 4);

  const episodePanel = (
    <EpisodePanel
      title={title}
      subNumbers={subNumbers}
      dubNumbers={dubNumbers}
      episodes={episodes}
      currentNumber={currentEp?.number}
      watched={watched}
      fallbackImage={anime?.cover || anime?.image}
      onSelect={selectEpisode}
    />
  );

  return (
    <Page>
      <Ambient $img={anime?.image} aria-hidden />

      <Main>
        {providers === null ? (
          <PlayerBox>
            <Skeleton $h='min(56.25vw, 38rem)' />
          </PlayerBox>
        ) : noSources ? (
          <Notice $tone='error'>
            <strong>No streaming sources found for this anime yet.</strong>
            <br />
            {providersError ||
              'None of the sources has episodes for it. It may be too new or not available for streaming.'}
            <div className='actions'>
              <button onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
              <Link to={`/anime/${animeId}`}>Back to details</Link>
            </div>
          </Notice>
        ) : (
          <>
            <PlayerBox>
              <StreamPlayer
                watch={watch}
                loading={watchLoading || !currentEp}
                error={watchError}
                poster={poster || undefined}
                title={`${title} - Episode ${currentEp?.number ?? ''}`}
                startTime={resumeAt}
                autoPlay={autoPlay}
                autoNext={autoNext}
                autoSkip={autoSkip}
                onEnded={goNext}
                onProgress={(t, d) => currentEp && saveProgress(animeId, currentEp.number, t, d)}
              />
            </PlayerBox>

            <Pad>
              <EpHead>
                <div className='meta'>
                  <span>Episode {currentEp?.number ?? '—'}</span>
                  {epDate && (
                    <>
                      <span>·</span>
                      <span>{epDate}</span>
                    </>
                  )}
                  {currentEp?.filler && (
                    <>
                      <span>·</span>
                      <span>Filler</span>
                    </>
                  )}
                </div>
                <h1>{epTitle}</h1>
              </EpHead>
            </Pad>

            <Pad>
              <Toolbar>
                <Pop
                  button={(open, toggle) => (
                    <PopBtn aria-expanded={open} aria-haspopup='menu' onClick={toggle}>
                      {audio === 'sub' ? <FaClosedCaptioning /> : <FaMicrophone />}
                      <span className='label'>{audio === 'sub' ? 'Sub' : 'Dub'}</span>
                      <FiChevronDown className='chev' />
                    </PopBtn>
                  )}
                >
                  {(close) => (
                    <>
                      <div className='title'>Audio</div>
                      {(['sub', 'dub'] as Audio[]).map((a) => (
                        <MenuItem
                          key={a}
                          $on={audio === a}
                          disabled={!hasAudio[a]}
                          onClick={() => {
                            changeAudio(a);
                            close();
                          }}
                        >
                          {a === 'sub' ? <FaClosedCaptioning /> : <FaMicrophone />}
                          <span className='grow'>{a === 'sub' ? 'Sub' : 'Dub'}</span>
                          <span className='tag'>{a === 'sub' ? subTotal : dubTotal} eps</span>
                          {audio === a && <FiCheck />}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Pop>

                <Pop
                  button={(open, toggle) => (
                    <PopBtn aria-expanded={open} aria-haspopup='menu' onClick={toggle}>
                      <FiZap />
                      <span className='label'>
                        {activeProvider ? providerLabel(activeProvider.provider) : 'source'}
                      </span>
                      <FiChevronDown className='chev' />
                    </PopBtn>
                  )}
                >
                  {(close) => (
                    <>
                      <div className='title'>Provider</div>
                      {providerOptions.map((p) => (
                        <MenuItem
                          key={p.provider}
                          $on={activeProvider?.provider === p.provider}
                          onClick={() => {
                            changeProvider(p.provider);
                            close();
                          }}
                        >
                          <FiZap />
                          <span className='grow'>{providerLabel(p.provider)}</span>
                          <span className='tag'>{p[audio].length} eps</span>
                          {activeProvider?.provider === p.provider && <FiCheck />}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Pop>

                <Pop
                  right
                  button={(open, toggle) => (
                    <PopBtn $icon aria-expanded={open} aria-label='Playback options' onClick={toggle}>
                      <FiMoreVertical />
                    </PopBtn>
                  )}
                >
                  {() => (
                    <>
                      <div className='title'>Playback</div>
                      {(
                        [
                          ['Autoplay', autoPlay, setAutoPlay, 'autoPlay'],
                          ['Auto next', autoNext, setAutoNext, 'autoNext'],
                          ['Auto skip intro / outro', autoSkip, setAutoSkip, 'autoSkip'],
                        ] as const
                      ).map(([label, on, set, key]) => (
                        <MenuItem
                          key={key}
                          role='switch'
                          aria-checked={on}
                          onClick={() => {
                            set(!on);
                            writeFlag(key, !on);
                          }}
                        >
                          <span className='grow'>{label}</span>
                          <Switch $on={on} />
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Pop>
              </Toolbar>
            </Pad>

            {audio !== audioPref && (
              <Pad>
                <Notice $tone='warn'>
                  {audioPref.toUpperCase()} isn’t available for this anime, so {audio.toUpperCase()} is
                  selected.
                </Notice>
              </Pad>
            )}
            {providerNotice && (
              <Pad>
                <Notice $tone='warn'>{providerNotice}</Notice>
              </Pad>
            )}

            <Pad>
              <EpBar>
                <button onClick={goPrev} disabled={!prevEp} aria-label='Previous episode'>
                  {prevEp && (
                    <>
                      <FiChevronLeft /> <span className='muted'>Ep {prevEp.number}</span>
                    </>
                  )}
                </button>
                <button className={epsOpen ? 'on' : ''} onClick={() => setEpsOpen((v) => !v)}>
                  <FiList /> Episodes
                </button>
                <button onClick={goNext} disabled={!nextEp} aria-label='Next episode'>
                  {nextEp && (
                    <>
                      <span className='muted'>Ep {nextEp.number}</span> <FiChevronRight />
                    </>
                  )}
                </button>
              </EpBar>
              {epsOpen && <EpDrawer style={{ marginTop: '0.6rem' }}>{episodePanel}</EpDrawer>}
            </Pad>
          </>
        )}

        <Pad>
          <Card>
            <AnimeHead>
              <Link className='poster' to={`/anime/${animeId}`}>
                {anime ? <img src={anime.image} alt={`${title} poster`} /> : null}
              </Link>
              <div className='txt'>
                <h2>
                  <Link to={`/anime/${animeId}`}>{title}</Link>
                </h2>
                <div className='sub'>
                  {season && <span>{season}</span>}
                  {subTotal > 0 && (
                    <span>
                      · <FaClosedCaptioning /> {subTotal}
                    </span>
                  )}
                  {dubTotal > 0 && (
                    <span>
                      · <FaMicrophone /> {dubTotal}
                    </span>
                  )}
                </div>
              </div>
              {anime && <ListButton anime={anime as any} variant='hero' />}
            </AnimeHead>

            {synopsis && (
              <Synopsis $open={descOpen}>
                <p>{synopsis}</p>
                <div className='foot'>
                  <span>{synopsisIsEpisode ? 'Episode synopsis' : 'Synopsis'}</span>
                  <button aria-expanded={descOpen} onClick={() => setDescOpen((v) => !v)}>
                    {descOpen ? 'Show less' : 'Show more'} <FiChevronDown />
                  </button>
                </div>
              </Synopsis>
            )}
          </Card>
        </Pad>

        {seasons.length > 1 && (
          <Pad>
            <Card>
              <CardTitle>
                <FiList /> Seasons
              </CardTitle>
              <SeasonGrid>
                {seasons.map((se) => {
                  const current = se.id === animeId;
                  return (
                    <SeasonTile
                      key={se.id}
                      to={`/watch/${se.id}`}
                      $img={se.image}
                      $current={current}
                      title={se.title}
                    >
                      {current && <span className='cur'>Current</span>}
                      <strong>{se.label}</strong>
                      <small>{se.year ?? ''}</small>
                    </SeasonTile>
                  );
                })}
              </SeasonGrid>
            </Card>
          </Pad>
        )}

        {relations.length > 0 && (
          <Pad>
            <ListCard>
              <header aria-expanded={relOpen} onClick={() => setRelOpen((v) => !v)} role='button' tabIndex={0}>
                <FiChevronRight /> Related
              </header>
              {relOpen && (
                <div className='rows'>
                  {relations.map((r) => (
                    <MiniRow key={`${r.id}-${r.relationType}`} item={r} counts={relations.length <= 6} />
                  ))}
                </div>
              )}
            </ListCard>
          </Pad>
        )}

        {recommendations.length > 0 && (
          <Pad>
            <ListCard>
              <header aria-expanded={recOpen} onClick={() => setRecOpen((v) => !v)} role='button' tabIndex={0}>
                <FiChevronRight /> Recommendations
              </header>
              {recOpen && (
                <>
                  <div className='rows'>
                    {recShown.map((r) => (
                      <MiniRow key={r.id} item={r} counts />
                    ))}
                  </div>
                  {recommendations.length > 4 && (
                    <ShowMore aria-expanded={recMore} onClick={() => setRecMore((v) => !v)} aria-label='Show more'>
                      <FiChevronDown />
                    </ShowMore>
                  )}
                </>
              )}
            </ListCard>
          </Pad>
        )}
      </Main>

      <Side>
        {providers === null ? <Skeleton $h='28rem' /> : episodePanel}
      </Side>
    </Page>
  );
}
