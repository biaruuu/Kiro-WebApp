import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { FaClosedCaptioning, FaMicrophone, FaPlay, FaTimes } from 'react-icons/fa';
import {
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiFilm,
  FiImage,
  FiPlus,
  FiStar,
  FiTv,
} from 'react-icons/fi';
import { fetchAnimeData } from '../hooks/useApi';
import { fetchProviderEpisodes, type StreamEpisode } from '../hooks/anivexa';
import {
  fetchExternalIds,
  fetchMalScore,
  fetchTmdbGallery,
  useAudioCounts,
  type ExternalIds,
  type GalleryImage,
  type TmdbGallery,
} from '../hooks/extras';
import { useMyList } from '../hooks/watchlist';
import { getLastWatchedNumber } from '../hooks/watchStorage';
import type { Anime } from '../hooks/interface';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const FORMAT: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};
const formatLabel = (t?: string) => (t ? (FORMAT[t] ?? t.replace(/_/g, ' ')) : '');

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
  SOURCE: 'Source',
  ADAPTATION: 'Adaptation',
};
const relationLabel = (r?: string) => (r ? (RELATION[r] ?? r.replace(/_/g, ' ')) : '');

const STATUS: Record<string, { label: string; color: string }> = {
  Ongoing: { label: 'Airing', color: '#22c55e' },
  Completed: { label: 'Finished', color: '#7dd3fc' },
  'Not yet aired': { label: 'Upcoming', color: '#fbbf24' },
  Cancelled: { label: 'Cancelled', color: '#f87171' },
  Hiatus: { label: 'Hiatus', color: '#fb923c' },
};

const seasonLabel = (season?: string, year?: number | null) => {
  const s = season ? season.charAt(0) + season.slice(1).toLowerCase() : '';
  return [s, year].filter(Boolean).join(' ');
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d?: { year?: number; month?: number; day?: number }) =>
  d?.year ? `${d.year}-${pad(d.month || 1)}-${pad(d.day || 1)}` : '';

const dateLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const durationLabel = (d?: number | null) => {
  if (!d) return '';
  const mins = d > 300 ? Math.round(d / 60) : Math.round(d);
  return `${mins}m`;
};

const nameOf = (t?: { english?: string | null; romaji?: string | null; userPreferred?: string }) =>
  t?.english || t?.romaji || t?.userPreferred || 'Untitled';

const titleCase = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------
const Page = styled.div`
  position: relative;
  isolation: isolate;
  max-width: 90rem;
  margin: 0 auto;
  padding: 0 0 2rem;

  @media (min-width: 700px) {
    padding: 0 0 3rem;
  }
`;

// backdrop: blurred artwork fixed behind the page, fading out as you scroll
const BgLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  will-change: opacity;

  img {
    position: absolute;
    inset: -3rem;
    width: calc(100% + 6rem);
    height: calc(100% + 6rem);
    object-fit: cover;
    filter: blur(28px) saturate(1.1);
    transform: translateZ(0);
    opacity: 0.55;
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(11, 11, 16, 0.35) 0%,
      rgba(11, 11, 16, 0.7) 45%,
      var(--global-primary-bg) 100%
    );
  }
`;

const Hero = styled.section`
  position: relative;
  margin-top: -3.25rem;
  padding: 4.4rem 0.5rem 1.2rem;
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  grid-template-areas:
    'poster head'
    'actions actions'
    'desc desc';
  gap: 0.85rem 0.9rem;
  align-items: end;

  @media (min-width: 700px) {
    margin-top: -3.75rem;
    padding: 7rem 1.5rem 2rem;
    grid-template-columns: 13rem minmax(0, 1fr);
    grid-template-areas:
      'poster head'
      'poster actions'
      'poster desc';
    gap: 1rem 2rem;
    align-items: start;
  }
  @media (min-width: 1100px) {
    grid-template-columns: 15rem minmax(0, 1fr);
  }
`;

const Poster = styled.div`
  grid-area: poster;
  aspect-ratio: 2 / 3;
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--global-secondary-bg);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 0.6rem 1.8rem rgba(0, 0, 0, 0.45);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Head = styled.div`
  grid-area: head;
  min-width: 0;
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;

  @media (min-width: 700px) {
    align-self: end;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(1.15rem, 4.8vw, 2.3rem);
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: -0.01em;
  text-shadow: 0 0.1rem 1rem rgba(0, 0, 0, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.76rem;

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
  }
  svg {
    font-size: 0.95rem;
    opacity: 0.85;
  }
  @media (min-width: 700px) {
    font-size: 0.95rem;
  }
`;

const Actions = styled.div`
  grid-area: actions;
  display: flex;
  gap: 0.6rem;
`;

const popIn = keyframes`
  0% { transform: scale(0.6); }
  60% { transform: scale(1.25); }
  100% { transform: scale(1); }
`;

const ActionBtn = styled.button<{ $primary?: boolean; $on?: boolean }>`
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  height: 2.3rem;
  padding: 0 0.8rem;
  border-radius: 0.5rem;
  font-size: 0.84rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid
    ${({ $primary, $on }) =>
      $primary ? 'transparent' : $on ? 'rgba(183,169,255,0.55)' : 'rgba(255,255,255,0.16)'};
  color: ${({ $primary, $on }) => ($primary ? '#0b0b10' : $on ? '#cfc6ff' : '#fff')};
  background: ${({ $primary, $on }) =>
    $primary ? '#f5f5f5' : $on ? 'rgba(183,169,255,0.14)' : 'rgba(255,255,255,0.07)'};
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;

  &:hover {
    background: ${({ $primary }) => ($primary ? '#fff' : 'rgba(255,255,255,0.13)')};
  }
  &:active {
    transform: scale(0.98);
  }
  svg {
    font-size: 1rem;
  }
  .swap {
    animation: ${popIn} 0.35s ease;
  }

  @media (min-width: 700px) {
    flex: 0 0 auto;
    min-width: 11rem;
    height: 2.8rem;
  }
`;

const DescBox = styled.div`
  grid-area: desc;
  min-width: 0;
`;

const ReadMore = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.4rem;
  padding: 0.2rem 0;
  border: none;
  background: none;
  color: #b7a9ff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  svg {
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
`;

const Description = styled.p<{ $open: boolean }>`
  margin: 0;
  max-width: 62rem;
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.82rem;
  line-height: 1.7;
  white-space: pre-line;
  ${({ $open }) =>
    $open
      ? ''
      : `display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;`}

  @media (min-width: 700px) {
    font-size: 1rem;
  }
`;

const Section = styled.section`
  margin-top: 1.9rem;
  padding: 0 0.5rem;
  min-width: 0;

  @media (min-width: 700px) {
    padding: 0 1.5rem;
    margin-top: 3rem;
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;

  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  p {
    margin: 0.3rem 0 0;
    color: var(--global-text-muted);
    font-size: 0.8rem;
  }
  .count {
    color: var(--global-text-muted);
    font-size: 0.82rem;
    margin-left: auto;
    white-space: nowrap;
  }
  @media (min-width: 700px) {
    h2 {
      font-size: 1.55rem;
    }
  }
`;

const SelectWrap = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;

  select {
    appearance: none;
    -webkit-appearance: none;
    height: 2.1rem;
    min-width: 7rem;
    padding: 0 2rem 0 0.8rem;
    border-radius: 0.6rem;
    border: 1.5px solid color-mix(in srgb, var(--global-text) 28%, transparent);
    background: transparent;
    color: var(--global-text);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  select option {
    background: var(--global-secondary-bg);
    color: var(--global-text);
  }
  svg {
    position: absolute;
    right: 0.75rem;
    pointer-events: none;
    color: var(--global-text-muted);
  }
`;

// ----- about ---------------------------------------------------------------
const AboutList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);

  @media (min-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 3rem;
  }
`;

const AboutRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 2rem;
  font-size: 0.84rem;

  dt {
    color: var(--global-text-muted);
  }
  dd {
    margin: 0;
    font-weight: 500;
    text-align: right;
  }
`;

const Group = styled.div`
  margin-top: 0.7rem;

  h3 {
    margin: 0 0 0.45rem;
    font-size: 0.84rem;
    font-weight: 400;
    color: var(--global-text-muted);
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Pill = styled.span<{ $outline?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 500;
  background: ${({ $outline }) =>
    $outline ? 'transparent' : 'color-mix(in srgb, var(--global-text) 10%, var(--global-secondary-bg))'};
  border: 1px solid
    ${({ $outline }) =>
      $outline ? 'color-mix(in srgb, var(--global-text) 28%, transparent)' : 'transparent'};
  color: ${({ $outline }) => ($outline ? 'var(--global-text-muted)' : 'var(--global-text)')};
`;

const Links = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.1rem;
`;

const LinkTile = styled.a<{ $bg: string; $fg: string }>`
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.55rem;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration: none;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  transition: transform 0.15s ease;
  &:hover {
    transform: translateY(-2px);
  }
  @media (min-width: 700px) {
    width: 2.6rem;
    height: 2.6rem;
    font-size: 0.7rem;
  }
`;

// ----- trailer -------------------------------------------------------------
const TrailerBox = styled.button<{ $img: string }>`
  position: relative;
  display: block;
  width: 100%;
  max-width: 48rem;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: none;
  border-radius: 0.8rem;
  overflow: hidden;
  cursor: pointer;
  background: var(--global-secondary-bg) ${({ $img }) => ($img ? `url(${$img})` : 'none')} center /
    cover no-repeat;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.18);
  }
  .play {
    position: absolute;
    z-index: 1;
    inset: 0;
    margin: auto;
    width: 3.1rem;
    height: 3.1rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(70, 50, 40, 0.72);
    color: #fff;
    font-size: 1.3rem;
    padding-left: 0.2rem;
    transition: transform 0.2s ease;
  }
  &:hover .play {
    transform: scale(1.08);
  }
`;

// ----- horizontal scrollers ------------------------------------------------
const Scroller = styled.div`
  display: flex;
  gap: 0.8rem;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  margin: 0 -0.5rem;
  padding: 0 0.5rem 0.4rem;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar {
    display: none;
  }
  @media (min-width: 700px) {
    margin: 0 -1.5rem;
    padding: 0 1.5rem 0.4rem;
    gap: 1.1rem;
  }
`;

const EpCard = styled(Link)`
  flex: 0 0 min(70vw, 16rem);
  scroll-snap-align: start;
  min-width: 0;
  text-decoration: none;
  color: var(--global-text);

  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
    border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.35s ease;
  }
  &:hover .thumb img {
    transform: scale(1.05);
  }
  .badge {
    position: absolute;
    padding: 0.22rem 0.5rem;
    border-radius: 0.45rem;
    background: rgba(30, 30, 36, 0.82);
    font-size: 0.66rem;
    font-weight: 600;
    color: #fff;
  }
  .ep {
    top: 0.55rem;
    left: 0.55rem;
  }
  .dur {
    right: 0.55rem;
    bottom: 0.55rem;
  }
  strong {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.84rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    display: block;
    margin-top: 0.2rem;
    color: var(--global-text-muted);
    font-size: 0.74rem;
  }
`;

const PosterCard = styled(Link)`
  flex: 0 0 8.2rem;
  scroll-snap-align: start;
  min-width: 0;
  text-decoration: none;
  color: var(--global-text);

  @media (min-width: 700px) {
    flex-basis: 10.5rem;
  }
  .art {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
    border: 1.5px solid color-mix(in srgb, var(--global-text) 18%, transparent);
    display: grid;
    place-items: center;
    color: var(--global-text-muted);
    font-size: 2rem;
  }
  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.35s ease;
  }
  &:hover .art img {
    transform: scale(1.05);
  }
  .tag {
    position: absolute;
    z-index: 1;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.22rem 0.5rem;
    border-radius: 999px;
    background: rgba(10, 10, 14, 0.85);
    font-size: 0.64rem;
    font-weight: 700;
    color: #fff;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0.55rem 0 0.35rem;
  }
  .rel {
    margin: 0 0 0.2rem;
    color: #b7a9ff;
    font-weight: 600;
    font-size: 0.84rem;
  }
  .name {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  &:hover .name {
    color: var(--primary-accent);
  }
`;

const MiniChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.24rem 0.4rem;
  border-radius: 0.38rem;
  background: color-mix(in srgb, var(--global-text) 12%, var(--global-secondary-bg));
  color: color-mix(in srgb, var(--global-text) 94%, transparent);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  svg {
    font-size: 0.74rem;
  }
`;

// ----- characters ----------------------------------------------------------
const CharList = styled.div`
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(0, 1fr);

  @media (min-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const CharRow = styled.div`
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  min-height: 3.6rem;
  border-radius: 0.8rem;
  overflow: hidden;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 20%, transparent);
  background: color-mix(in srgb, var(--global-secondary-bg) 70%, transparent);

  img {
    flex: none;
    width: 2.5rem;
    object-fit: cover;
    background: var(--global-tertiary-bg);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.4rem 0.7rem;
  }
  .who.right {
    align-items: flex-end;
    text-align: right;
    flex: 0 1 42%;
  }
  strong {
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who.right strong {
    font-size: 0.76rem;
    font-weight: 500;
  }
  small {
    color: var(--global-text-muted);
    font-size: 0.74rem;
  }
  .who.right small {
    font-size: 0.64rem;
  }
`;

const MoreBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem auto 0;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  color: var(--global-text-muted);
  font-size: 0.84rem;
  cursor: pointer;
  &:hover {
    color: var(--global-text);
  }
  svg {
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
`;

const Center = styled.div`
  display: flex;
  justify-content: center;
`;

// ----- gallery -------------------------------------------------------------
const GalleryIcon = styled.span`
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 0.7rem;
  border: 1.5px solid color-mix(in srgb, var(--global-text) 22%, transparent);
  background: var(--global-secondary-bg);
  font-size: 1.2rem;
  flex: none;
`;

const Masonry = styled.div<{ $open: boolean }>`
  position: relative;
  column-count: 1;
  column-gap: 0.7rem;
  ${({ $open }) =>
    $open ? '' : 'max-height: 17rem; overflow: hidden;'}

  @media (min-width: 700px) {
    column-count: 2;
  }
  @media (min-width: 1100px) {
    column-count: 3;
  }
  ${({ $open }) =>
    $open
      ? ''
      : `&::after{content:'';position:absolute;left:0;right:0;bottom:0;height:60%;pointer-events:none;background:linear-gradient(to bottom,transparent,var(--global-primary-bg));}`}

  ${({ $open }) => ($open ? '' : 'column-count: 1 !important; max-height: 15rem;')}
  button {
    display: block;
    width: 100%;
    margin: 0 0 0.7rem;
    padding: 0;
    border: 1.5px solid color-mix(in srgb, var(--global-text) 18%, transparent);
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
    break-inside: avoid;
    cursor: zoom-in;
  }
  img {
    width: 100%;
    height: auto;
    display: block;
  }
`;

const Lightbox = styled.div`
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.88);

  img {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.6rem;
    object-fit: contain;
  }
  button {
    position: absolute;
    top: 0.8rem;
    right: 0.8rem;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    cursor: pointer;
  }
`;

const Shimmer = styled.div<{ $h: string }>`
  height: ${({ $h }) => $h};
  border-radius: 0.8rem;
  background: linear-gradient(
    90deg,
    var(--global-secondary-bg),
    var(--global-tertiary-bg),
    var(--global-secondary-bg)
  );
  background-size: 200% 100%;
  animation: ${keyframes`
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  `} 1.4s ease-in-out infinite;
`;

const ErrorBox = styled.div`
  margin: 6rem auto;
  max-width: 28rem;
  padding: 1.5rem;
  text-align: center;
  color: var(--global-text-muted);
  a {
    color: var(--primary-accent);
  }
`;

// ---------------------------------------------------------------------------
// small components
// ---------------------------------------------------------------------------
const CountChips = ({ id, aired = true }: { id: string; aired?: boolean }) => {
  const c = useAudioCounts(id, aired);
  if (!c) return null;
  const { sub, dub } = c;
  if (sub && dub && sub === dub) {
    return (
      <MiniChip>
        <FaClosedCaptioning />
        <FaMicrophone /> {sub}
      </MiniChip>
    );
  }
  return (
    <>
      {sub > 0 && (
        <MiniChip>
          <FaClosedCaptioning /> {sub}
        </MiniChip>
      )}
      {dub > 0 && (
        <MiniChip>
          <FaMicrophone /> {dub}
        </MiniChip>
      )}
    </>
  );
};

const AnimeCard = ({
  item,
  relation,
}: {
  item: any;
  relation?: string;
}) => {
  const name = nameOf(item.title);
  const aired = item.status !== 'Not yet aired';
  return (
    <PosterCard to={`/anime/${item.id}`} title={name}>
      <div className='art'>
        {item.image ? <img src={item.image} alt={name} loading='lazy' decoding='async' /> : <FiFilm />}
        {relation && <span className='tag'>{relation}</span>}
      </div>
      <div className='chips'>
        {!relation && <CountChips id={String(item.id)} aired={aired} />}
        {item.type && <MiniChip>{formatLabel(item.type)}</MiniChip>}
        {item.releaseDate || item.seasonYear ? (
          <MiniChip>{item.releaseDate ?? item.seasonYear}</MiniChip>
        ) : null}
      </div>
      {relation && <p className='rel'>{relation}</p>}
      <p className='name'>{name}</p>
    </PosterCard>
  );
};

const ListButton = ({ anime }: { anime: Anime }) => {
  const { has, toggle } = useMyList();
  const on = has(String(anime.id));
  return (
    <ActionBtn
      type='button'
      $on={on}
      aria-pressed={on}
      onClick={() =>
        toggle({
          id: String(anime.id),
          title: nameOf(anime.title),
          image: anime.image,
          type: anime.type,
          year: anime.releaseDate ?? null,
        })
      }
    >
      <span className='swap' key={String(on)} style={{ display: 'inline-flex' }}>
        {on ? <FiCheck /> : <FiPlus />}
      </span>
      {on ? 'In My List' : 'Add to List'}
    </ActionBtn>
  );
};

const EP_WINDOW = 60;

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------
const Details = () => {
  const { animeId = '' } = useParams();
  const [anime, setAnime] = useState<(Anime & Record<string, any>) | null>(null);
  const [error, setError] = useState(false);
  const [episodes, setEpisodes] = useState<StreamEpisode[] | null>(null);
  const [dubCount, setDubCount] = useState(0);
  const [mal, setMal] = useState<number | null>(null);
  const [ids, setIds] = useState<ExternalIds>({});
  const [gallery, setGallery] = useState<TmdbGallery | null>(null);

  const [descOpen, setDescOpen] = useState(false);
  const [trailer, setTrailer] = useState(false);
  const [lang, setLang] = useState('Japanese');
  const [allChars, setAllChars] = useState(false);
  const [galleryKind, setGalleryKind] = useState<'all' | 'backdrops' | 'posters' | 'logos'>('all');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
  const [epRange, setEpRange] = useState(0);

  const bgRef = useRef<HTMLDivElement>(null);

  // ----- load -----
  useEffect(() => {
    let alive = true;
    window.scrollTo(0, 0);
    setAnime(null);
    setError(false);
    setEpisodes(null);
    setDubCount(0);
    setMal(null);
    setIds({});
    setGallery(null);
    setDescOpen(false);
    setAllChars(false);
    setGalleryOpen(false);
    setGalleryKind('all');
    setEpRange(0);

    fetchAnimeData(animeId)
      .then((a: any) => {
        if (!alive) return;
        setAnime(a);
        document.title = `${nameOf(a.title)} | AniMallu`;
        if (a.malId) fetchMalScore(a.malId).then((v) => alive && setMal(v));
        fetchTmdbGallery(animeId, { type: a.type, title: nameOf(a.title) }).then(
          (g) => alive && setGallery(g),
        );
      })
      .catch(() => alive && setError(true));

    fetchProviderEpisodes(animeId)
      .then((providers) => {
        if (!alive) return;
        // the provider with the most sub episodes is the most complete list
        const best = [...providers].sort((a, b) => b.sub.length - a.sub.length)[0];
        setEpisodes(best ? best.sub : []);
        setDubCount(providers.reduce((m, p) => Math.max(m, p.dub.length), 0));
      })
      .catch(() => alive && setEpisodes([]));

    fetchExternalIds(animeId).then((v) => alive && setIds(v));
    return () => {
      alive = false;
    };
  }, [animeId]);

  // ----- backdrop fades out while scrolling -----
  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 800;
      const p = Math.min(1, Math.max(0, (window.scrollY - vh * 0.15) / (vh * 1.1)));
      el.style.opacity = String(1 - p * p * (3 - 2 * p));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [anime]);

  // ----- derived -----
  const name = anime ? nameOf(anime.title) : '';
  const lastWatched = anime ? getLastWatchedNumber(animeId) : undefined;
  const aired = anime?.currentEpisode || anime?.totalEpisodes || 0;
  const subCount = episodes?.length || aired || 0;

  const episodeList: StreamEpisode[] = useMemo(() => {
    if (episodes && episodes.length) return episodes;
    // no provider data (yet): numbered placeholders so the page is still useful
    return Array.from({ length: Math.min(aired, 500) }, (_, i) => ({
      id: `${animeId}-${i + 1}`,
      number: i + 1,
      title: null,
      description: null,
      image: null,
      airDate: null,
      duration: null,
      filler: false,
    }));
  }, [episodes, aired, animeId]);

  const ranges = Math.ceil(episodeList.length / EP_WINDOW);
  const shownEpisodes = episodeList.slice(epRange * EP_WINDOW, (epRange + 1) * EP_WINDOW);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const c of anime?.characters ?? [])
      for (const v of c.voiceActors ?? []) if (v.language) set.add(v.language);
    return [...set].sort((a, b) => (a === 'Japanese' ? -1 : b === 'Japanese' ? 1 : a.localeCompare(b)));
  }, [anime]);

  useEffect(() => {
    if (languages.length && !languages.includes(lang)) setLang(languages[0]);
  }, [languages, lang]);

  const galleryImages: GalleryImage[] = useMemo(() => {
    if (!gallery) return [];
    if (galleryKind === 'backdrops') return gallery.backdrops;
    if (galleryKind === 'posters') return gallery.posters;
    if (galleryKind === 'logos') return gallery.logos;
    return [...gallery.backdrops, ...gallery.posters, ...gallery.logos];
  }, [gallery, galleryKind]);

  // ----- states -----
  if (error) {
    return (
      <ErrorBox>
        <p>Couldn’t load this anime right now.</p>
        <Link to='/'>Back to home</Link>
      </ErrorBox>
    );
  }

  if (!anime) {
    return (
      <Page>
        <Hero>
          <Poster as='div' style={{ background: 'var(--global-secondary-bg)' }} />
          <Head>
            <Shimmer $h='2.2rem' />
            <Shimmer $h='1.1rem' />
          </Head>
          <Actions>
            <Shimmer $h='2.5rem' style={{ flex: 1 }} />
            <Shimmer $h='2.5rem' style={{ flex: 1 }} />
          </Actions>
        </Hero>
      </Page>
    );
  }

  const status = STATUS[anime.status] ?? { label: anime.status, color: 'inherit' };
  const score = anime.rating ? (anime.rating / 10).toFixed(1) : '';
  const season = seasonLabel(anime.season, anime.releaseDate);
  const aniDate = [ymd(anime.startDate), ymd(anime.endDate)].filter(Boolean);
  const totalLabel = anime.totalEpisodes ? String(anime.totalEpisodes) : '?';
  const studios: { name: string; isMain: boolean }[] =
    anime.allStudios?.length
      ? anime.allStudios
      : (anime.studios ?? []).map((s) => ({ name: s, isMain: true }));
  const trailerId = anime.trailer?.site === 'youtube' ? anime.trailer.id : null;
  const trailerImg = anime.trailer?.thumbnail || (trailerId ? `https://i.ytimg.com/vi/${trailerId}/hqdefault.jpg` : '');
  const bgImage = anime.cover || anime.image;
  const desc = anime.description || 'No synopsis available.';
  const related: any[] = (anime.relations ?? []).filter((r: any) => r.id);
  const recs: any[] = (anime.recommendations ?? []).filter((r: any) => r.id);
  const characters = anime.characters ?? [];
  const shownChars = allChars ? characters : characters.slice(0, 8);

  const links: { key: string; label: string; href: string; bg: string; fg: string }[] = [
    { key: 'al', label: 'AL', href: `https://anilist.co/anime/${anime.id}`, bg: '#0b1622', fg: '#3db4f2' },
    ...(anime.malId
      ? [{ key: 'mal', label: 'MAL', href: `https://myanimelist.net/anime/${anime.malId}`, bg: '#2e51a2', fg: '#fff' }]
      : []),
    ...(ids.anidb
      ? [{ key: 'anidb', label: 'aniDB', href: `https://anidb.net/anime/${ids.anidb}`, bg: '#1b1b1f', fg: '#e5b567' }]
      : []),
    ...(ids.kitsu
      ? [{ key: 'kitsu', label: 'Kitsu', href: `https://kitsu.app/anime/${ids.kitsu}`, bg: '#1d1d28', fg: '#ff6a4d' }]
      : []),
    ...(ids.anisearch
      ? [{ key: 'anisearch', label: 'aS', href: `https://www.anisearch.com/anime/${ids.anisearch}`, bg: '#2b1f14', fg: '#f0a64b' }]
      : []),
    ...(ids.tvdb
      ? [{ key: 'tvdb', label: 'tvdb', href: `https://thetvdb.com/dereferrer/series/${ids.tvdb}`, bg: '#0f1f17', fg: '#6cd49a' }]
      : []),
    ...(ids.tmdb
      ? [{ key: 'tmdb', label: 'TMDB', href: `https://www.themoviedb.org/${ids.tmdbKind ?? (anime.type === 'MOVIE' ? 'movie' : 'tv')}/${ids.tmdb}`, bg: '#0d253f', fg: '#01b4e4' }]
      : []),
    ...(ids.imdb
      ? [{ key: 'imdb', label: 'IMDb', href: `https://www.imdb.com/title/${ids.imdb}`, bg: '#f5c518', fg: '#000' }]
      : []),
  ];

  return (
    <Page>
      <BgLayer ref={bgRef} aria-hidden>
        {bgImage && <img src={bgImage} alt='' decoding='async' />}
      </BgLayer>

      {/* ---------- hero ---------- */}
      <Hero>
        <Poster>
          <img src={anime.image} alt={name} decoding='async' />
        </Poster>

        <Head>
          <Title>{name}</Title>
          <Meta>
            {season && (
              <span>
                <FiCalendar /> {season}
              </span>
            )}
            {score && (
              <span>
                <FiStar /> {score}
              </span>
            )}
            {anime.type && (
              <span>
                <FiTv /> {formatLabel(anime.type)}
              </span>
            )}
            {anime.duration ? (
              <span>
                <FiClock /> {anime.duration} min
              </span>
            ) : null}
          </Meta>
        </Head>

        <Actions>
          <ActionBtn
            as={Link}
            to={`/watch/${anime.id}${lastWatched ? `?ep=${lastWatched}` : ''}`}
            $primary
          >
            <FaPlay /> {lastWatched ? `Continue EP ${lastWatched}` : 'Watch Now'}
          </ActionBtn>
          <ListButton anime={anime} />
        </Actions>

        <DescBox>
          <Description $open={descOpen}>{desc}</Description>
          {desc.length > 200 && (
            <ReadMore type='button' aria-expanded={descOpen} onClick={() => setDescOpen((v) => !v)}>
              {descOpen ? 'Show less' : 'Read more'}
              <FiChevronDown />
            </ReadMore>
          )}
        </DescBox>
      </Hero>

      {/* ---------- about ---------- */}
      <Section>
        <SectionHead>
          <h2>About this anime</h2>
        </SectionHead>
        <AboutList>
          <AboutRow>
            <dt>Status</dt>
            <dd style={{ color: status.color }}>{status.label}</dd>
          </AboutRow>
          <AboutRow>
            <dt>Episodes</dt>
            <dd>
              {subCount} / {totalLabel} Sub{dubCount ? ` · ${dubCount} Dub` : ''}
            </dd>
          </AboutRow>
          {score && (
            <AboutRow>
              <dt>AniList score</dt>
              <dd>{score}</dd>
            </AboutRow>
          )}
          {mal ? (
            <AboutRow>
              <dt>MAL score</dt>
              <dd>{mal.toFixed(2)}</dd>
            </AboutRow>
          ) : null}
          {aniDate.length > 0 && (
            <AboutRow>
              <dt>Aired</dt>
              <dd>{aniDate.join(' – ')}</dd>
            </AboutRow>
          )}
          {anime.popularityRank ? (
            <AboutRow>
              <dt>Popularity</dt>
              <dd>#{Number(anime.popularityRank).toLocaleString('en-US')}</dd>
            </AboutRow>
          ) : null}
          {anime.title?.native && (
            <AboutRow>
              <dt>Native</dt>
              <dd>{anime.title.native}</dd>
            </AboutRow>
          )}
        </AboutList>

        {anime.genres?.length > 0 && (
          <Group>
            <h3>Genres</h3>
            <ChipRow>
              {anime.genres.map((g) => (
                <Pill key={g}>{g}</Pill>
              ))}
            </ChipRow>
          </Group>
        )}
        {studios.length > 0 && (
          <Group>
            <h3>Studios</h3>
            <ChipRow>
              {studios.map((s) => (
                <Pill key={s.name} $outline={!s.isMain}>
                  {s.name}
                </Pill>
              ))}
            </ChipRow>
          </Group>
        )}
        <Links>
          {links.map((l) => (
            <LinkTile
              key={l.key}
              href={l.href}
              target='_blank'
              rel='noopener noreferrer'
              $bg={l.bg}
              $fg={l.fg}
              title={l.label}
              aria-label={l.label}
            >
              {l.label}
            </LinkTile>
          ))}
        </Links>
      </Section>

      {/* ---------- trailer ---------- */}
      {trailerId && (
        <Section>
          <SectionHead>
            <h2>Trailer</h2>
          </SectionHead>
          <TrailerBox $img={trailerImg} onClick={() => setTrailer(true)} aria-label='Play trailer'>
            <span className='play'>
              <FaPlay />
            </span>
          </TrailerBox>
        </Section>
      )}

      {/* ---------- episodes ---------- */}
      <Section>
        <SectionHead>
          <h2>Episodes</h2>
          {ranges > 1 && (
            <SelectWrap>
              <select value={epRange} onChange={(e) => setEpRange(Number(e.target.value))}>
                {Array.from({ length: ranges }, (_, i) => (
                  <option key={i} value={i}>
                    {i * EP_WINDOW + 1}–{Math.min((i + 1) * EP_WINDOW, episodeList.length)}
                  </option>
                ))}
              </select>
              <FiChevronDown />
            </SelectWrap>
          )}
        </SectionHead>
        {episodes === null ? (
          <Scroller>
            {[0, 1].map((i) => (
              <div key={i} style={{ flex: '0 0 min(70vw, 16rem)' }}>
                <Shimmer $h='9.5rem' />
              </div>
            ))}
          </Scroller>
        ) : shownEpisodes.length === 0 ? (
          <p style={{ color: 'var(--global-text-muted)' }}>No episodes available yet.</p>
        ) : (
          <Scroller key={epRange}>
            {shownEpisodes.map((ep) => (
              <EpCard key={ep.number} to={`/watch/${anime.id}?ep=${ep.number}`}>
                <div className='thumb'>
                  <img
                    src={ep.image || anime.cover || anime.image}
                    alt=''
                    loading='lazy'
                    decoding='async'
                  />
                  <span className='badge ep'>EP {ep.number}</span>
                  {(durationLabel(ep.duration) || anime.duration) && (
                    <span className='badge dur'>
                      {durationLabel(ep.duration) || `${anime.duration}m`}
                    </span>
                  )}
                </div>
                <strong>Episode {ep.number}</strong>
                <small>{dateLabel(ep.airDate) || ep.title || ' '}</small>
              </EpCard>
            ))}
          </Scroller>
        )}
      </Section>

      {/* ---------- related ---------- */}
      {related.length > 0 && (
        <Section>
          <SectionHead>
            <div>
              <h2>Related</h2>
              <p>Side stories and franchise connections</p>
            </div>
            <span className='count'>
              {related.length} {related.length === 1 ? 'entry' : 'entries'}
            </span>
          </SectionHead>
          <Scroller>
            {related.map((r) => (
              <AnimeCard key={`${r.id}-${r.relationType}`} item={r} relation={relationLabel(r.relationType)} />
            ))}
          </Scroller>
        </Section>
      )}

      {/* ---------- characters ---------- */}
      {characters.length > 0 && (
        <Section>
          <SectionHead>
            <h2>Characters</h2>
            <span className='count'>{characters.length}</span>
            {languages.length > 0 && (
              <SelectWrap>
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <FiChevronDown />
              </SelectWrap>
            )}
          </SectionHead>
          <CharList>
            {shownChars.map((c: any) => {
              const va = (c.voiceActors ?? []).find((v: any) => v.language === lang);
              return (
                <CharRow key={c.id}>
                  {c.image && <img src={c.image} alt='' loading='lazy' decoding='async' />}
                  <div className='who'>
                    <strong>{nameOf(c.name)}</strong>
                    <small>{titleCase(c.role)}</small>
                  </div>
                  {va && (
                    <>
                      <div className='who right'>
                        <strong>{nameOf(va.name)}</strong>
                        <small>{va.language}</small>
                      </div>
                      {va.image && <img src={va.image} alt='' loading='lazy' decoding='async' />}
                    </>
                  )}
                </CharRow>
              );
            })}
          </CharList>
          {characters.length > 8 && (
            <Center>
              <MoreBtn aria-expanded={allChars} onClick={() => setAllChars((v) => !v)}>
                {allChars ? 'Show fewer' : `Show all ${characters.length} characters`}
                <FiChevronDown />
              </MoreBtn>
            </Center>
          )}
        </Section>
      )}

      {/* ---------- artwork ---------- */}
      {gallery && galleryImages.length > 0 && (
        <Section>
          <SectionHead>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
              <GalleryIcon>
                <FiImage />
              </GalleryIcon>
              <div>
                <h2>Artwork &amp; Posters</h2>
                <p>{galleryImages.length} images</p>
              </div>
            </div>
            <SelectWrap>
              <select
                value={galleryKind}
                onChange={(e) => {
                  setGalleryKind(e.target.value as any);
                  setGalleryOpen(false);
                }}
                style={{ minWidth: '6.5rem' }}
              >
                <option value='all'>All</option>
                {gallery.backdrops.length > 0 && <option value='backdrops'>Backdrops</option>}
                {gallery.posters.length > 0 && <option value='posters'>Posters</option>}
                {gallery.logos.length > 0 && <option value='logos'>Logos</option>}
              </select>
              <FiChevronDown />
            </SelectWrap>
          </SectionHead>
          <Masonry $open={galleryOpen}>
            {(galleryOpen ? galleryImages : galleryImages.slice(0, 1)).map((img) => (
              <button key={img.full} onClick={() => setLightbox(img)} aria-label='Open image'>
                <img src={img.thumb} alt='' loading='lazy' decoding='async' />
              </button>
            ))}
          </Masonry>
          <Center>
            <MoreBtn aria-expanded={galleryOpen} onClick={() => setGalleryOpen((v) => !v)}>
              {galleryOpen ? 'Show less' : `View all ${galleryImages.length} images`}
              <FiChevronDown />
            </MoreBtn>
          </Center>
        </Section>
      )}

      {/* ---------- more like this ---------- */}
      {recs.length > 0 && (
        <Section>
          <SectionHead>
            <h2>More like this</h2>
          </SectionHead>
          <Scroller>
            {recs.map((r) => (
              <AnimeCard key={r.id} item={r} />
            ))}
          </Scroller>
        </Section>
      )}

      {/* ---------- overlays ---------- */}
      {trailer && trailerId && (
        <Lightbox onClick={() => setTrailer(false)}>
          <button onClick={() => setTrailer(false)} aria-label='Close trailer'>
            <FaTimes />
          </button>
          <iframe
            title='Trailer'
            src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&rel=0`}
            allow='autoplay; encrypted-media; picture-in-picture; fullscreen'
            allowFullScreen
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(100%, 60rem)', aspectRatio: '16 / 9', border: 0, borderRadius: '0.6rem' }}
          />
        </Lightbox>
      )}
      {lightbox && (
        <Lightbox onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} aria-label='Close image'>
            <FaTimes />
          </button>
          <img src={lightbox.full} alt='' onClick={(e) => e.stopPropagation()} />
        </Lightbox>
      )}
    </Page>
  );
};

export default Details;
