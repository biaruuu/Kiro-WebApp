/**
 * The AniBiar video player (https://github.com/biaruuu/anibiartv), ported from
 * React + Tailwind to styled-components and restyled as Apple "Liquid Glass".
 * Every feature of the original is kept: hls.js with quality levels, own caption
 * parser + renderer, skip intro/outro (with Undo), volume boost, speed, Cast,
 * screenshot, download, fullscreen + orientation lock, resume, gestures, keys.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type * as React from 'react';
import styled, { css, keyframes } from 'styled-components';
import './GlassPlayer.css';
import {
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChromecastIcon,
  ClosedCaptionsIcon,
  ClosedCaptionsOnIcon,
  DownloadIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  InfoIcon,
  MuteIcon,
  PauseIcon,
  PlaybackSpeedCircleIcon,
  PlayIcon,
  SeekBackward10Icon,
  SeekForward10Icon,
  SettingsIcon,
  VolumeHighIcon,
  VolumeLowIcon,
} from './icons';
import { castMedia, CastCancelled, loadCastSdk } from '../../../lib/cast';
import { activeText, decodeText, parseCaptions, type Cue } from '../../../lib/captions';

export type GlassTrack = { url: string; label: string; srclang?: string; default?: boolean };
type Range = { start: number; end: number };
type Option = { value: boolean; onChange: (value: boolean) => void };

type Props = {
  src: string;
  type: 'hls' | 'mp4';
  title: string;
  poster?: string;
  tracks: GlassTrack[];
  startTime?: number;
  autoPlay: boolean;
  intro?: Range | null;
  outro?: Range | null;
  autoplayOption?: Option;
  autoNextOption?: Option;
  autoSkipOption?: Option;
  /** quality labels that come from separate sources (used when the stream has no levels) */
  sourceQualities?: string[];
  sourceQuality?: string;
  onSourceQuality?: (label: string) => void;
  onReady?: () => void;
  /** the source cannot be played: let the page try another server */
  onFail?: () => void;
  onEnded: () => void;
  onProgress: (t: number, d: number) => void;
};

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type CastVideo = HTMLVideoElement & { remote?: { prompt: () => Promise<void> } };
type SkipKind = 'intro' | 'outro';
type MenuView = 'main' | 'captions' | 'style' | 'speed' | 'boost' | 'quality' | 'source';
type Notice = { text: string; tone: 'default' | 'error' };

const CAPTION_FONT = '"Trebuchet MS", "Open Sans", "Segoe UI", Tahoma, sans-serif';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 10;
const AUTO_HIDE_MS = 3000;
const CAPTION_SIZES = {
  sm: { label: 'Small', scale: 0.88 },
  md: { label: 'Medium', scale: 1.1 },
  lg: { label: 'Large', scale: 1.4 },
} as const;
const CAPTION_STYLES = { box: 'Dark box', outline: 'Outline' } as const;
type CaptionSize = keyof typeof CAPTION_SIZES;
type CaptionStyle = keyof typeof CAPTION_STYLES;
const CAPTION_PREFS_KEY = 'videoplayer:caption-style:v3';
const QUALITY_KEY = 'videoplayer:quality';
const BOOSTS = [1, 2, 3, 4] as const;
const boostLabel = (b: number) => `${Math.round((b - 1) * 100)}%`;
const MENU_TITLES: Record<MenuView, string> = {
  main: 'Settings',
  captions: 'Captions',
  style: 'Caption style',
  speed: 'Speed',
  quality: 'Quality',
  boost: 'Volume boost',
  source: 'Quality',
};

const trackId = (t: GlassTrack) => `${t.srclang ?? ''}:${t.url}`;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

async function lockOrientation(video: HTMLVideoElement | null) {
  const o = screen.orientation as any;
  if (!o?.lock) return;
  const portrait = video ? video.videoHeight > video.videoWidth : false;
  try {
    await o.lock(portrait ? 'portrait' : 'landscape');
  } catch {
    /* not supported here */
  }
}
function unlockOrientation() {
  try {
    (screen.orientation as any)?.unlock?.();
  } catch {
    /* nothing to unlock */
  }
}

/* ======================= Liquid Glass styling ======================= */

const glass = css`
  position: relative;
  background: rgba(255, 255, 255, 0.12);
  -webkit-backdrop-filter: blur(8px) saturate(1.5);
  backdrop-filter: blur(8px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -1px 0 rgba(255, 255, 255, 0.08),
    0 6px 20px rgba(0, 0, 0, 0.22);
  color: #fff;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 50%);
  }
`;

const BAR_BUTTON = 'clamp(1.8rem, 4cqw, 2.75rem)';
const BAR_ICON = 'clamp(1.35rem, 3.4cqw, 2.1rem)';
const PILL_H = 'clamp(1.8rem, 4.1cqw, 2.6rem)';
const PAD = 'clamp(0.5rem, 2.2cqw, 1.25rem)';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; }`;
const spin = keyframes`to { transform: rotate(360deg); }`;

const Root = styled.div<{ $hidden: boolean }>`
  container-type: inline-size;
  position: absolute;
  inset: 0;
  background: #000;
  overflow: hidden;
  outline: none;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  ${(p) => p.$hidden && 'cursor: none;'}

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  svg {
    display: block;
  }
`;

const Dim = styled.div<{ $on: boolean }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.2);
  transition: opacity 0.3s;
  opacity: ${(p) => (p.$on ? 1 : 0)};
`;

const Layer = styled.div<{ $off: boolean; $from?: 'top' | 'bottom' }>`
  position: absolute;
  z-index: 10;
  pointer-events: none;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  ${(p) =>
    p.$off &&
    `opacity: 0; transform: translateY(${p.$from === 'bottom' ? '8px' : p.$from === 'top' ? '-8px' : '0'});`}
  & > * {
    pointer-events: ${(p) => (p.$off ? 'none' : 'auto')};
  }
`;

const TopBar = styled(Layer)`
  inset: 0 0 auto 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4), transparent);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: ${PAD};
`;

const Pill = styled.div`
  ${glass}
  display: flex;
  align-items: center;
  padding: clamp(0.125rem, 0.32cqw, 0.25rem);
  border-radius: 999px;
`;

const Btn = styled.button<{ $on?: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: ${BAR_BUTTON};
  height: ${BAR_BUTTON};
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.15s;
  svg {
    position: relative;
    width: ${BAR_ICON};
    height: ${BAR_ICON};
  }
  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  &:active {
    transform: scale(0.93);
  }
`;

const GearBtn = styled(Btn)<{ $open: boolean }>`
  svg {
    transition: transform 0.3s;
    ${(p) => p.$open && 'transform: rotate(45deg);'}
  }
`;

const VolWrap = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  .slot {
    display: none;
    width: 0;
    overflow: hidden;
    transition: width 0.3s ease;
  }
  @container (min-width: 32rem) {
    .slot {
      display: block;
    }
    &:hover .slot,
    &:focus-within .slot {
      width: 6rem;
    }
  }
  .slot > div {
    width: 6rem;
    height: 1.4rem;
    padding: 0 0.5rem;
  }
`;

const CenterLayer = styled(Layer)`
  inset: 0;
`;

const Round = styled.button<{ $size: string; $left: string }>`
  ${glass}
  position: absolute;
  top: 50%;
  /* small players: lift the buttons so the captions fit under them */
  @container (max-width: 34rem) {
    top: 36%;
  }
  left: ${(p) => p.$left};
  width: ${(p) => p.$size};
  height: ${(p) => p.$size};
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.15s;
  svg {
    position: relative;
    width: 74%;
    height: 74%;
  }
  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
  &:active {
    transform: translate(-50%, -50%) scale(0.95);
  }
`;

const Spin = styled.div`
  position: relative;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  animation: ${spin} 0.8s linear infinite;
`;

const BottomBar = styled(Layer)`
  inset: auto 0 0 0;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.5), transparent);
  padding: 1.2rem clamp(0.75rem, 3.5cqw, 3rem) clamp(0.8rem, 3cqw, 2.25rem);
`;

const InfoRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: clamp(0.25rem, 1cqw, 0.75rem);
`;

const TimePill = styled.span`
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: ${PILL_H};
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  font-size: clamp(0.7rem, 1.7cqw, 0.95rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  span {
    position: relative;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  em {
    font-style: normal;
    opacity: 0.6;
  }
  .ttl {
    display: none;
  }
  @container (min-width: 28rem) {
    .ttl {
      display: inline;
    }
  }
`;

const FsBtn = styled.button`
  ${glass}
  display: grid;
  place-items: center;
  height: ${PILL_H};
  width: clamp(2.4rem, 5.6cqw, 3.4rem);
  padding: 0;
  border-radius: clamp(0.9rem, 2.4cqw, 1.4rem);
  cursor: pointer;
  svg {
    position: relative;
    width: ${BAR_ICON};
    height: ${BAR_ICON};
  }
  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;

const SeekWrap = styled.div`
  display: flex;
  align-items: center;
  height: 1.25rem;
`;

/* custom slider (replaces Radix) */
const SliderBox = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  outline: none;
  .rail {
    position: relative;
    width: 100%;
    height: 0.3rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.3);
    transition: height 0.15s;
  }
  &:hover .rail,
  &.drag .rail {
    height: 0.4rem;
  }
  .buf,
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
  }
  .buf {
    background: rgba(255, 255, 255, 0.5);
  }
  .fill {
    background: #fff;
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 0.85rem;
    height: 0.85rem;
    margin: -0.425rem 0 0 -0.425rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
    opacity: 0;
    transition: opacity 0.15s;
  }
  &:hover .thumb,
  &.drag .thumb,
  &:focus-visible .thumb {
    opacity: 1;
  }
`;

function Slider({
  value,
  max,
  step,
  label,
  buffered = 0,
  onChange,
  onCommit,
}: {
  value: number;
  max: number;
  step: number;
  label: string;
  buffered?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const [drag, setDrag] = useState(false);
  const last = useRef(value);
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const at = (e: { clientX: number; currentTarget: HTMLDivElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const raw = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * max;
    return Math.round(raw / step) * step;
  };
  return (
    <SliderBox
      className={drag ? 'drag' : ''}
      role='slider'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        last.current = at(e);
        onChange(last.current);
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        last.current = at(e);
        onChange(last.current);
      }}
      onPointerUp={() => {
        setDrag(false);
        onCommit?.(last.current);
      }}
      onPointerCancel={() => {
        setDrag(false);
        onCommit?.(last.current);
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? step * 5 : e.key === 'ArrowLeft' ? -step * 5 : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const v = Math.min(max, Math.max(0, value + d));
        onChange(v);
        onCommit?.(v);
      }}
    >
      <div className='rail'>
        <div className='buf' style={{ width: `${buffered}%` }} />
        <div className='fill' style={{ width: `${pct}%` }} />
        <div className='thumb' style={{ left: `${pct}%` }} />
      </div>
    </SliderBox>
  );
}

const Skips = styled.div`
  position: absolute;
  z-index: 20;
  right: ${PAD};
  bottom: clamp(5.4rem, 13cqw, 8.4rem);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5em;
  font-size: clamp(0.75rem, 1.9cqw, 1.05rem);
  animation: ${fadeIn} 0.2s ease;

  button {
    ${glass}
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.6em 1.1em;
    border-radius: 999px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  button svg {
    position: relative;
    width: 1.5em;
    height: 1.5em;
  }
  .toast {
    ${glass}
    display: flex;
    align-items: center;
    gap: 0.7em;
    padding: 0.4em 0.5em 0.4em 1em;
    border-radius: 999px;
    font-weight: 700;
  }
  .toast span {
    position: relative;
  }
  .toast button {
    padding: 0.25em 0.9em;
    background: rgba(255, 255, 255, 0.25);
    box-shadow: none;
  }
`;

const CaptionBox = styled.div<{ $lift: boolean }>`
  position: absolute;
  z-index: 15;
  left: 0;
  right: 0;
  /* controls hidden: right at the bottom. controls showing: just above the time row,
     so the text never sits on the progress bar. */
  bottom: ${(p) =>
    p.$lift
      ? `calc(clamp(0.8rem, 3cqw, 2.25rem) + clamp(0.25rem, 1cqw, 0.75rem) + ${PILL_H} + 1.25rem + 0.3rem)`
      : 'clamp(0.6rem, 2.6cqw, 2.4rem)'};
  transition: bottom 0.25s ease;
  display: flex;
  justify-content: center;
  padding: 0 5cqw;
  pointer-events: none;
  p {
    margin: 0;
    max-width: min(100%, 52em);
    text-align: center;
    line-height: 1.18;
    font-weight: 400;
    letter-spacing: 0;
    text-wrap: balance;
    white-space: pre-line;
    color: #fff;
  }
  .outline {
    /* thin dark outline + soft shadow, regular weight Trebuchet (like the reference) */
    -webkit-text-stroke: 0.13em rgba(20, 20, 20, 0.92);
    paint-order: stroke fill;
    stroke-linejoin: round;
    text-shadow:
      0 0 0.08em rgba(0, 0, 0, 0.9),
      0.02em 0.05em 0.1em rgba(0, 0, 0, 0.85),
      0 0.08em 0.3em rgba(0, 0, 0, 0.5);
  }
  .box {
    padding: 0.12em 0.6em;
    border-radius: 0.35em;
    background: rgba(0, 0, 0, 0.75);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    box-shadow: 0 0.1em 0.4em rgba(0, 0, 0, 0.4);
  }
`;

const Flash = styled.div<{ $dir: 'back' | 'forward' }>`
  position: absolute;
  z-index: 5;
  top: 50%;
  ${(p) => (p.$dir === 'back' ? 'left: 12%;' : 'right: 12%;')}
  transform: translateY(-50%);
  pointer-events: none;
  animation: ${fadeIn} 0.2s ease;
  > div {
    ${glass}
    display: grid;
    place-items: center;
    width: clamp(3rem, 10cqw, 5rem);
    height: clamp(3rem, 10cqw, 5rem);
    border-radius: 50%;
  }
  svg {
    position: relative;
    width: 70%;
    height: 70%;
  }
`;

const Fill = styled.div`
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1rem;
  text-align: center;
  background: #000;
  color: #fff;
  .in {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-width: 24rem;
  }
  svg {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.7;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
  }
  small {
    font-size: 0.72rem;
    opacity: 0.6;
  }
`;

const NoticeBox = styled.div<{ $error: boolean }>`
  ${glass}
  position: absolute;
  z-index: 30;
  top: clamp(3.5rem, 9.5cqw, 5rem);
  left: 50%;
  transform: translateX(-50%);
  max-width: 90%;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  text-align: center;
  font-size: 0.74rem;
  font-weight: 700;
  pointer-events: none;
  ${(p) => p.$error && 'background: rgba(255, 90, 90, 0.7); color: #fff;'}
`;

const MenuWrap = styled.div`
  position: absolute;
  z-index: 30;
  top: clamp(3.1rem, 7.4cqw, 4.4rem);
  right: ${PAD};
  display: flex;
  flex-direction: column;
  width: clamp(14rem, 39cqw, 26rem);
  max-width: calc(100% - 1rem);
  max-height: calc(100% - clamp(3.1rem, 7.4cqw, 4.4rem) - clamp(0.5rem, 5cqw, 3.5rem));
  transform-origin: top right;
  animation: ${fadeIn} 0.15s ease;
  font-size: clamp(0.75rem, 1.9cqw, 1.05rem);
  color: #fff;

  .sheet {
    ${glass}
    min-height: 0;
    overflow-y: auto;
    padding: 0.55em;
    border-radius: 1.5em;
    background: rgba(20, 20, 26, 0.42);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    backdrop-filter: blur(16px) saturate(1.6);
    display: flex;
    flex-direction: column;
    gap: 0.4em;
  }
  .sheet > * {
    position: relative;
    flex: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75em;
    width: 100%;
    padding: 0.6em 0.9em;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 1em;
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .row.sel {
    background: rgba(255, 255, 255, 0.28);
    border-color: rgba(255, 255, 255, 0.6);
  }
  .row svg {
    flex: none;
    width: 1.5em;
    height: 1.5em;
  }
  .row .lab {
    flex: 1;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row .val {
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
  }
  .cap {
    margin: 0;
    padding: 0.3em 0.9em 0;
    font-size: 0.75em;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    opacity: 0.55;
  }
  .hint {
    margin: 0;
    padding: 0.3em 0.9em;
    font-size: 0.8em;
    opacity: 0.65;
  }
`;

/* menu rows live at module level so they keep their identity between renders */
function Row({
  icon,
  label,
  value,
  onClick,
  chevron = true,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return (
    <button type='button' className='row' onClick={onClick}>
      {icon}
      <span className='lab'>{label}</span>
      {value && <span className='val'>{value}</span>}
      {chevron && <ChevronRightIcon />}
    </button>
  );
}
function Opt({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type='button' className={`row${selected ? ' sel' : ''}`} onClick={onClick}>
      <span className='lab'>{label}</span>
      {selected && <CheckIcon />}
    </button>
  );
}

/* ============================== component ============================== */

export default function GlassPlayer({
  src,
  type,
  title,
  poster,
  tracks,
  startTime,
  autoPlay,
  intro,
  outro,
  autoplayOption,
  autoNextOption,
  autoSkipOption,
  sourceQualities = [],
  sourceQuality = 'auto',
  onSourceQuality,
  onReady,
  onFail,
  onEnded,
  onProgress,
}: Props) {
  const isHls = type === 'hls';

  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  });
  // After the source really started, a hiccup must never swap servers.
  const startedRef = useRef(false);
  const autoTriedRef = useRef(false);
  const endedRef = useRef(false);
  const autoPlayRef = useRef(autoPlay);
  const startAtRef = useRef(startTime);
  const resumedRef = useRef<string | null>(null);
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const lastReportRef = useRef(0);
  useEffect(() => {
    autoPlayRef.current = autoPlay;
    startAtRef.current = startTime;
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsOpenRef = useRef(false);
  const cueCache = useRef(new Map<string, Cue[]>());
  const cuesRef = useRef<Cue[]>([]);
  const offsetRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [boost, setBoost] = useState(1);
  const [cors, setCors] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [castSupported, setCastSupported] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [cueText, setCueText] = useState('');
  const [cueVersion, setCueVersion] = useState(0);
  const [captionSize, setCaptionSize] = useState<CaptionSize>('md');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('outline');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [flash, setFlash] = useState<{ dir: 'back' | 'forward'; key: number } | null>(null);
  const [levels, setLevels] = useState<{ index: number; height: number; bitrate: number }[]>([]);
  const [quality, setQuality] = useState(-1); // -1 = Auto
  const [liveLevel, setLiveLevel] = useState(-1);

  /* ---------- intro / outro skipping ---------- */
  const skipRef = useRef({ intro, outro, auto: Boolean(autoSkipOption?.value) });
  useEffect(() => {
    skipRef.current = { intro, outro, auto: Boolean(autoSkipOption?.value) };
  });
  const skippedRef = useRef<Record<SkipKind, boolean>>({ intro: false, outro: false });
  const insideRef = useRef<Record<SkipKind, boolean>>({ intro: false, outro: false });
  const lastTimeRef = useRef(0);
  const skipToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [skipTarget, setSkipTarget] = useState<SkipKind | null>(null);
  const [skipToast, setSkipToast] = useState<{ kind: SkipKind; from: number } | null>(null);

  const skipTo = (kind: SkipKind, automatic: boolean) => {
    const v = videoRef.current;
    const range = kind === 'intro' ? skipRef.current.intro : skipRef.current.outro;
    if (!v || !range) return;
    const from = v.currentTime;
    skippedRef.current[kind] = true;
    setSkipTarget(null);
    // an outro that runs to the end jumps to the very end so the next episode can start
    const end =
      Number.isFinite(v.duration) && range.end >= v.duration - 2 ? Math.max(0, v.duration - 0.05) : range.end;
    v.currentTime = end;
    if (v.paused && !automatic) void v.play().catch(() => {});
    if (automatic) {
      setSkipToast({ kind, from });
      if (skipToastTimer.current) clearTimeout(skipToastTimer.current);
      skipToastTimer.current = setTimeout(() => setSkipToast(null), 5000);
    }
  };
  const undoSkip = () => {
    const v = videoRef.current;
    if (v && skipToast) v.currentTime = skipToast.from;
    setSkipToast(null);
  };
  const checkSkip = (v: HTMLVideoElement) => {
    const t = v.currentTime;
    const { intro: i, outro: o, auto } = skipRef.current;
    const inside = (r: Range | null | undefined) =>
      Boolean(r) && r!.end > r!.start && t >= r!.start - 0.3 && t < r!.end - 0.6;
    const now: Record<SkipKind, boolean> = { intro: inside(i), outro: inside(o) };
    const natural = Math.abs(t - lastTimeRef.current) < 3;
    lastTimeRef.current = t;
    for (const kind of ['intro', 'outro'] as const) {
      // jumped straight into the range (scrub / Undo): never auto-skip it, keep the button
      if (now[kind] && !insideRef.current[kind] && !natural) skippedRef.current[kind] = true;
    }
    insideRef.current = now;
    const kind: SkipKind | null = now.intro ? 'intro' : now.outro ? 'outro' : null;
    if (kind && auto && !skippedRef.current[kind] && !v.paused) {
      skipTo(kind, true);
      return;
    }
    setSkipTarget((cur) => (cur === kind ? cur : kind));
  };
  useEffect(() => {
    skippedRef.current = { intro: false, outro: false };
    insideRef.current = { intro: false, outro: false };
    lastTimeRef.current = 0;
    setSkipTarget(null);
    setSkipToast(null);
  }, [src]);

  const reportFail = () => {
    if (!startedRef.current) onFailRef.current?.();
  };
  const fireEnded = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPlaying(false);
    onEndedRef.current();
  };

  /* ---------- feedback + helpers ---------- */
  const showNotice = useCallback((text: string, tone: Notice['tone'] = 'default') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 2800);
  }, []);
  const flashSeek = (dir: 'back' | 'forward') => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ dir, key: Date.now() });
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  };
  const updateBuffered = (v: HTMLVideoElement) => {
    const r = v.buffered;
    let end = 0;
    for (let i = 0; i < r.length; i++) {
      if (r.start(i) <= v.currentTime + 0.5 && r.end(i) >= v.currentTime) {
        end = r.end(i);
        break;
      }
    }
    setBuffered(end);
  };
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);
  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration || 0);
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);
  const changeVolume = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  }, []);

  // Volume boost: a Web Audio gain node with a fast limiter (needs CORS-readable media).
  const changeBoost = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (!audioRef.current) {
        if (value === 1) {
          setBoost(1);
          return;
        }
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx: AudioContext = new Ctx();
        const source = ctx.createMediaElementSource(v);
        const gain = ctx.createGain();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2;
        limiter.knee.value = 2;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.12;
        source.connect(gain).connect(limiter).connect(ctx.destination);
        audioRef.current = { ctx, gain };
      }
      const { ctx, gain } = audioRef.current;
      gain.gain.value = value;
      if (ctx.state === 'suspended') void ctx.resume();
      setBoost(value);
    } catch {
      setBoost(1);
    }
  }, []);
  useEffect(() => {
    if (playing && audioRef.current?.ctx.state === 'suspended') void audioRef.current.ctx.resume();
  }, [playing]);
  useEffect(() => {
    // new source = new <video> element (keyed), so the old audio graph is gone
    setCors(true);
    audioRef.current = null;
    setBoost(1);
    startedRef.current = false;
    autoTriedRef.current = false;
    endedRef.current = false;
  }, [src]);

  /* ---------- hls.js ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHls) return;
    let cancelled = false;
    let native = false;
    setLevels([]);
    setQuality(-1);
    setLiveLevel(-1);
    import('hls.js')
      .then(({ default: Hls }: any) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            native = true;
            video.src = src;
            return;
          }
          setLoading(false);
          setError(true);
          reportFail();
          return;
        }
        let netRetries = 0;
        let mediaRetries = 0;
        const hls = new Hls({ enableWorker: true, maxBufferLength: 40, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
          // one entry per picture height (the best bitrate of each), tallest first
          const best = new Map<number, { index: number; height: number; bitrate: number }>();
          data.levels.forEach((l: any, index: number) => {
            const key = l.height || Math.round(l.bitrate / 1000);
            const have = best.get(key);
            if (!have || l.bitrate > have.bitrate) best.set(key, { index, height: l.height || 0, bitrate: l.bitrate });
          });
          const list = [...best.values()].sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
          setLevels(list);
          try {
            const saved = Number(localStorage.getItem(QUALITY_KEY));
            const match = saved ? list.find((l) => l.height === saved) : undefined;
            if (match) {
              hls.currentLevel = match.index;
              setQuality(match.index);
            }
          } catch {
            /* start on Auto */
          }
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, d: any) => setLiveLevel(d.level));
        hls.on(Hls.Events.FRAG_LOADED, () => {
          netRetries = 0;
          mediaRetries = 0;
        });
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 4) {
            netRetries += 1;
            window.setTimeout(() => hlsRef.current === hls && hls.startLoad(), 500 * netRetries);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 3) {
            mediaRetries += 1;
            if (mediaRetries === 2) hls.swapAudioCodec();
            hls.recoverMediaError();
          } else {
            setLoading(false);
            setError(true);
            reportFail();
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
        reportFail();
      });
    return () => {
      cancelled = true;
      const hls = hlsRef.current;
      hlsRef.current = null;
      hls?.destroy();
      if (native) {
        video.removeAttribute('src');
        video.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isHls]);

  const changeQuality = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setQuality(index);
    try {
      const height = levels.find((l) => l.index === index)?.height;
      if (index === -1 || !height) localStorage.removeItem(QUALITY_KEY);
      else localStorage.setItem(QUALITY_KEY, String(height));
    } catch {
      /* ignore */
    }
  };
  const levelLabel = (l: { height: number; bitrate: number }) =>
    l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`;
  const qualityValue = () => {
    if (quality !== -1) {
      const l = levels.find((x) => x.index === quality);
      return l ? levelLabel(l) : 'Auto';
    }
    const playingLevel = hlsRef.current?.levels?.[liveLevel];
    return playingLevel?.height ? `Auto (${playingLevel.height}p)` : 'Auto';
  };

  const changeSpeed = (value: number) => {
    if (videoRef.current) videoRef.current.playbackRate = value;
    setSpeed(value);
  };

  /* ---------- captions (own parser, own timing, Trebuchet MS) ---------- */
  const trackKey = tracks.map(trackId).join('|');
  const defaultTrack =
    tracks.find((t) => t.default && /^en/i.test(t.srclang ?? '')) ??
    tracks.find((t) => /^en(\b|-|_)/i.test(t.srclang ?? '') || /^english\b/i.test(t.label)) ??
    tracks.find((t) => t.default) ??
    tracks[0];
  const firstId = defaultTrack ? trackId(defaultTrack) : null;
  const [captionId, setCaptionId] = useState<string | null>(firstId);
  const activeTrack = tracks.find((t) => trackId(t) === captionId);
  useEffect(() => {
    setCaptionId(firstId);
  }, [firstId]);

  useEffect(() => {
    const controller = new AbortController();
    for (const track of tracks) {
      const id = trackId(track);
      if (cueCache.current.has(id)) continue;
      fetch(track.url, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        })
        .then((buf) => {
          cueCache.current.set(id, parseCaptions(decodeText(buf)).cues);
          setCueVersion((v) => v + 1);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          showNotice(`Couldn't load ${track.label} captions`, 'error');
        });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, showNotice]);

  const activeCues = useMemo(() => {
    if (!activeTrack) return [] as Cue[];
    return cueCache.current.get(trackId(activeTrack)) ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionId, trackKey, cueVersion]);

  const syncCue = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const text = activeText(cuesRef.current, v.currentTime - offsetRef.current);
    setCueText((prev) => (prev === text ? prev : text));
  }, []);
  useEffect(() => {
    cuesRef.current = activeCues;
    syncCue();
  }, [activeCues, syncCue]);
  // check the cue on every frame while playing so captions are frame accurate
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      syncCue();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, syncCue]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CAPTION_PREFS_KEY) ?? 'null');
      if (saved?.size in CAPTION_SIZES) setCaptionSize(saved.size);
      if (saved?.style in CAPTION_STYLES) setCaptionStyle(saved.style);
    } catch {
      /* defaults are fine */
    }
  }, []);
  const savePrefs = (size: CaptionSize, style: CaptionStyle) => {
    try {
      localStorage.setItem(CAPTION_PREFS_KEY, JSON.stringify({ size, style }));
    } catch {
      /* storage blocked */
    }
  };
  const toggleCaptions = () => setCaptionId(captionId ? null : firstId);

  /* ---------- fullscreen / cast / screenshot / download ---------- */
  const toggleFullscreen = useCallback(async () => {
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        unlockOrientation();
      } else if (document.fullscreenEnabled) {
        await container.requestFullscreen();
        // rotate to landscape automatically (Android and other supporting browsers)
        await lockOrientation(videoRef.current);
      } else {
        // iPhone Safari: the native player handles rotation itself
        (videoRef.current as WebkitVideo | null)?.webkitEnterFullscreen?.();
      }
    } catch {
      /* refused */
    }
  }, [container]);

  const castVideo = async () => {
    const v = videoRef.current as CastVideo | null;
    if (!v) return;
    try {
      const device = await castMedia({
        url: new URL(src, window.location.href).href,
        contentType: isHls ? 'application/x-mpegURL' : 'video/mp4',
        title: title ?? 'Video',
        poster: poster ? new URL(poster, window.location.href).href : undefined,
        startTime: v.currentTime,
      });
      v.pause();
      showNotice(`Casting to ${device}`);
      return;
    } catch (e) {
      if (e instanceof CastCancelled) return;
    }
    try {
      if (v.remote) await v.remote.prompt();
      else showNotice("Casting isn't available in this browser", 'error');
    } catch {
      showNotice("Couldn't start casting", 'error');
    }
  };

  const takeScreenshot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext('2d')?.drawImage(v, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          showNotice("Screenshot isn't available for this video", 'error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title ?? 'video'}-${formatTime(v.currentTime).replace(/:/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('Screenshot saved');
      }, 'image/png');
    } catch {
      showNotice("This video's host doesn't allow screenshots", 'error');
    }
  };

  const downloadVideo = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = title ?? 'video';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showNotice('Download started');
  };

  /* ---------- controls visibility ---------- */
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !settingsOpenRef.current) setShowControls(false);
    }, AUTO_HIDE_MS);
  }, []);
  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(false);
  }, []);
  const closeSettings = () => {
    setSettingsOpen(false);
    setMenuView('main');
    revealControls();
  };
  const toggleSettings = () => {
    if (settingsOpen) closeSettings();
    else {
      setMenuView('main');
      setSettingsOpen(true);
    }
  };

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  // the video can finish loading metadata before React attaches, so catch up
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.error && !hlsRef.current) {
      setError(true);
      reportFail();
    }
    if (v.readyState >= 1) {
      setDuration(v.duration);
      updateBuffered(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // controls are always visible while paused; while playing they auto-hide
  useEffect(() => {
    if (playing) revealControls();
    else {
      setShowControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
  }, [playing, revealControls]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (skipToastTimer.current) clearTimeout(skipToastTimer.current);
    },
    [],
  );

  useEffect(() => {
    const chromium = 'chrome' in window && !/Firefox/i.test(navigator.userAgent);
    setCastSupported(Boolean((videoRef.current as CastVideo | null)?.remote) || chromium);
    if (chromium) void loadCastSdk();
    const onChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (!active) unlockOrientation();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      unlockOrientation();
    };
  }, []);

  /* ---------- gestures + keys ---------- */
  // tapping the picture only shows or hides the controls; it never pauses
  const onVideoClick = () => {
    if (settingsOpen) {
      closeSettings();
      return;
    }
    if (!playing) return;
    if (showControls) hideControls();
    else revealControls();
  };
  // double tap: left third rewinds, right third skips, middle toggles fullscreen
  const onVideoDoubleClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (ratio < 0.33) {
      seekBy(-SEEK_STEP);
      flashSeek('back');
    } else if (ratio > 0.67) {
      seekBy(SEEK_STEP);
      flashSeek('forward');
    } else void toggleFullscreen();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[role="slider"]')) return;
    if (e.key === ' ' && target.closest('button')) return;
    switch (e.key.toLowerCase()) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'arrowleft':
      case 'j':
        e.preventDefault();
        seekBy(-SEEK_STEP);
        flashSeek('back');
        break;
      case 'arrowright':
      case 'l':
        e.preventDefault();
        seekBy(SEEK_STEP);
        flashSeek('forward');
        break;
      case 'arrowup':
        e.preventDefault();
        changeVolume(Math.min(volume + 0.1, 1));
        break;
      case 'arrowdown':
        e.preventDefault();
        changeVolume(Math.max(volume - 0.1, 0));
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        void toggleFullscreen();
        break;
      case 'c':
        if (tracks.length > 0) toggleCaptions();
        break;
      case 'escape':
        if (settingsOpen) {
          e.preventDefault();
          closeSettings();
        }
        break;
      default:
        return;
    }
    revealControls();
  };

  const VolIcon = muted || volume === 0 ? MuteIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;
  const controlsHidden = !showControls && playing;
  const bufferedPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const buffering = loading && playing && !error;
  const useLevels = levels.length > 1;
  const useSources = !useLevels && sourceQualities.length > 1;

  const captionStyleVars: CSSProperties = {
    fontSize: `calc(clamp(0.85rem, 2.6cqw, 2.5rem) * ${CAPTION_SIZES[captionSize].scale})`,
    fontFamily: CAPTION_FONT,
  };

  return (
    <Root
      ref={setContainer}
      tabIndex={0}
      role='region'
      aria-label={title ? `Video player: ${title}` : 'Video player'}
      $hidden={controlsHidden}
      onKeyDown={onKeyDown}
      // only a real mouse reveals controls on hover (touch sends emulated mouse events after a tap)
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') revealControls();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && playing && !settingsOpen) hideControls();
      }}
    >
      <video
        key={src}
        ref={videoRef}
        src={isHls ? undefined : src}
        poster={poster}
        preload='metadata'
        playsInline
        crossOrigin={cors ? 'anonymous' : undefined}
        onClick={onVideoClick}
        onDoubleClick={onVideoDoubleClick}
        onLoadStart={() => {
          endedRef.current = false;
          setCurrentTime(0);
          setDuration(0);
          setBuffered(0);
          setError(false);
          setLoading(true);
        }}
        onEmptied={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onPlaying={() => {
          startedRef.current = true;
          setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={(e) => {
          setLoading(false);
          setError(false);
          onReady?.();
          const v = e.currentTarget;
          // start by ourselves: a browser that blocks sound autoplay gets a muted start instead
          if (autoPlayRef.current && !autoTriedRef.current && !startedRef.current && v.paused) {
            autoTriedRef.current = true;
            v.play().catch((err: unknown) => {
              if ((err as DOMException)?.name !== 'NotAllowedError') return;
              v.muted = true;
              setMuted(true);
              v.play()
                .then(() => showNotice('Playing muted. Tap the volume button to unmute.'))
                .catch(() => {
                  v.muted = false;
                  setMuted(false);
                });
            });
          }
        }}
        onError={() => {
          // hls.js reports and recovers from its own errors
          if (hlsRef.current) return;
          // a server without CORS headers rejects the request: retry once without CORS
          if (cors && /^https?:/i.test(src) && !audioRef.current) {
            setCors(false);
            return;
          }
          setLoading(false);
          setError(true);
          reportFail();
        }}
        onEnded={fireEnded}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          // resume once per source (a server switch keeps the spot the viewer was at)
          const from = startAtRef.current;
          if (from && from > 3 && Number.isFinite(v.duration) && from < v.duration - 15 && resumedRef.current !== src) {
            v.currentTime = from;
          }
          resumedRef.current = src;
          v.playbackRate = speed;
          updateBuffered(v);
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onProgress={(e) => updateBuffered(e.currentTarget)}
        onSeeked={syncCue}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!scrubbing) setCurrentTime(v.currentTime);
          updateBuffered(v);
          checkSkip(v);
          if (
            Number.isFinite(v.duration) &&
            v.duration > 0 &&
            v.currentTime > 5 &&
            Math.abs(v.currentTime - lastReportRef.current) >= 4
          ) {
            lastReportRef.current = v.currentTime;
            onProgressRef.current(v.currentTime, v.duration);
          }
          // some streams never fire "ended": treat the last quarter second as the end
          if (Number.isFinite(v.duration) && v.duration > 1 && v.currentTime >= v.duration - 0.25) {
            onProgressRef.current(v.duration, v.duration);
            fireEnded();
          }
        }}
      />

      <Dim $on={!controlsHidden} />

      {(skipTarget || skipToast) && (
        <Skips>
          {skipToast && (
            <div className='toast' role='status'>
              <span>{skipToast.kind === 'intro' ? 'Intro skipped' : 'Outro skipped'}</span>
              <button type='button' onClick={undoSkip}>
                Undo
              </button>
            </div>
          )}
          {skipTarget && !skipToast && (
            <button type='button' onClick={() => skipTo(skipTarget, false)}>
              <span style={{ position: 'relative' }}>{skipTarget === 'intro' ? 'Skip Intro' : 'Skip Outro'}</span>
              <SeekForward10Icon />
            </button>
          )}
        </Skips>
      )}

      {cueText && (
        <CaptionBox $lift={!controlsHidden}>
          <p style={captionStyleVars}>
            <span className={captionStyle === 'box' ? 'box' : 'outline'}>{cueText}</span>
          </p>
        </CaptionBox>
      )}

      {flash && (
        <Flash key={flash.key} $dir={flash.dir}>
          <div>{flash.dir === 'back' ? <SeekBackward10Icon /> : <SeekForward10Icon />}</div>
        </Flash>
      )}

      {buffering && controlsHidden && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <Spin style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} />
        </div>
      )}

      {error && (
        <Fill>
          <div className='in'>
            <InfoIcon />
            <p>This video couldn&apos;t be played</p>
            <small>This server didn&apos;t load. Another one is tried automatically when available.</small>
          </div>
        </Fill>
      )}

      {notice && (
        <NoticeBox role='status' aria-live='polite' $error={notice.tone === 'error'}>
          {notice.text}
        </NoticeBox>
      )}

      {/* top: volume + cast on the left, tools on the right */}
      <TopBar $off={controlsHidden} $from='top'>
        <Pill>
          <VolWrap>
            <Btn type='button' aria-label={muted ? 'Unmute (m)' : 'Mute (m)'} title='Mute (m)' onClick={toggleMute}>
              <VolIcon />
            </Btn>
            <div className='slot'>
              <div>
                <Slider
                  label='Volume'
                  value={muted ? 0 : volume}
                  max={1}
                  step={0.02}
                  onChange={(v) => changeVolume(v)}
                />
              </div>
            </div>
          </VolWrap>
          {castSupported && (
            <Btn type='button' aria-label='Cast' title='Cast' onClick={() => void castVideo()}>
              <ChromecastIcon />
            </Btn>
          )}
        </Pill>

        <Pill>
          <Btn type='button' aria-label='Screenshot' title='Screenshot' onClick={takeScreenshot}>
            <CameraIcon />
          </Btn>
          {!isHls && (
            <Btn type='button' aria-label='Download' title='Download' onClick={downloadVideo}>
              <DownloadIcon />
            </Btn>
          )}
          {tracks.length > 0 && (
            <Btn
              type='button'
              aria-label={captionId ? 'Hide captions (c)' : 'Show captions (c)'}
              title='Captions (c)'
              onClick={toggleCaptions}
            >
              {captionId ? <ClosedCaptionsOnIcon /> : <ClosedCaptionsIcon />}
            </Btn>
          )}
          <GearBtn type='button' aria-label='Settings' title='Settings' $open={settingsOpen} onClick={toggleSettings}>
            <SettingsIcon />
          </GearBtn>
        </Pill>
      </TopBar>

      {/* centre: back 10 / play / forward 10 */}
      <CenterLayer $off={controlsHidden || error}>
        <Round
          type='button'
          aria-label='Back 10 seconds'
          $size='clamp(2.2rem, 5.7cqw, 3.8rem)'
          $left='25%'
          onClick={() => seekBy(-SEEK_STEP)}
        >
          <SeekBackward10Icon />
        </Round>
        <Round
          type='button'
          aria-label={playing ? 'Pause video' : 'Play video'}
          $size='clamp(2.6rem, 6.3cqw, 4.2rem)'
          $left='50%'
          onClick={togglePlay}
        >
          {buffering ? <Spin /> : playing ? <PauseIcon /> : <PlayIcon />}
        </Round>
        <Round
          type='button'
          aria-label='Forward 10 seconds'
          $size='clamp(2.2rem, 5.7cqw, 3.8rem)'
          $left='75%'
          onClick={() => seekBy(SEEK_STEP)}
        >
          <SeekForward10Icon />
        </Round>
      </CenterLayer>

      {/* bottom: time + fullscreen above the progress bar */}
      <BottomBar $off={controlsHidden} $from='bottom'>
        <InfoRow>
          <TimePill>
            <span>
              {formatTime(currentTime)}
              <em> / {formatTime(duration)}</em>
              {title && <em className='ttl'> • {title}</em>}
            </span>
          </TimePill>
          <FsBtn
            type='button'
            aria-label={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
            title='Fullscreen (f)'
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </FsBtn>
        </InfoRow>
        <SeekWrap>
          <Slider
            label='Seek'
            value={currentTime}
            max={duration || 100}
            step={0.1}
            buffered={bufferedPct}
            onChange={(v) => {
              setScrubbing(true);
              setCurrentTime(v);
            }}
            onCommit={(v) => {
              if (videoRef.current) videoRef.current.currentTime = v;
              setScrubbing(false);
            }}
          />
        </SeekWrap>
      </BottomBar>

      {/* settings menu */}
      {settingsOpen && (
        <MenuWrap>
          <div className='sheet'>
            {menuView === 'main' && (
              <>
                {useLevels && (
                  <Row icon={<SettingsIcon />} label='Quality' value={qualityValue()} onClick={() => setMenuView('quality')} />
                )}
                {useSources && (
                  <Row
                    icon={<SettingsIcon />}
                    label='Quality'
                    value={sourceQuality === 'auto' ? 'Auto' : sourceQuality}
                    onClick={() => setMenuView('source')}
                  />
                )}
                <Row
                  icon={<VolumeHighIcon />}
                  label='Volume boost'
                  value={cors ? boostLabel(boost) : 'Unavailable'}
                  onClick={() => setMenuView('boost')}
                />
                {tracks.length > 0 && (
                  <Row
                    icon={<ClosedCaptionsIcon />}
                    label='Captions'
                    value={activeTrack?.label ?? 'Off'}
                    onClick={() => setMenuView('captions')}
                  />
                )}
                {tracks.length > 0 && (
                  <Row
                    icon={<ClosedCaptionsOnIcon />}
                    label='Caption style'
                    value={CAPTION_SIZES[captionSize].label}
                    onClick={() => setMenuView('style')}
                  />
                )}
                <Row
                  icon={<PlaybackSpeedCircleIcon />}
                  label='Speed'
                  value={speed === 1 ? 'Normal' : `${speed}x`}
                  onClick={() => setMenuView('speed')}
                />
                {autoplayOption && (
                  <Row
                    icon={<PlayIcon />}
                    label='Autoplay'
                    value={autoplayOption.value ? 'On' : 'Off'}
                    chevron={false}
                    onClick={() => autoplayOption.onChange(!autoplayOption.value)}
                  />
                )}
                {autoSkipOption && (
                  <Row
                    icon={<SeekForward10Icon />}
                    label='Auto skip intro/outro'
                    value={!intro && !outro ? 'No data' : autoSkipOption.value ? 'On' : 'Off'}
                    chevron={false}
                    onClick={() => autoSkipOption.onChange(!autoSkipOption.value)}
                  />
                )}
                {autoNextOption && (
                  <Row
                    icon={<SeekForward10Icon />}
                    label='Auto next episode'
                    value={autoNextOption.value ? 'On' : 'Off'}
                    chevron={false}
                    onClick={() => autoNextOption.onChange(!autoNextOption.value)}
                  />
                )}
              </>
            )}

            {menuView !== 'main' && (
              <button type='button' className='row' style={{ fontWeight: 800 }} onClick={() => setMenuView('main')}>
                <ChevronLeftIcon />
                {MENU_TITLES[menuView]}
              </button>
            )}

            {menuView === 'captions' && (
              <>
                <Opt label='Off' selected={captionId === null} onClick={() => setCaptionId(null)} />
                {tracks.map((t) => (
                  <Opt
                    key={trackId(t)}
                    label={t.label}
                    selected={captionId === trackId(t)}
                    onClick={() => setCaptionId(trackId(t))}
                  />
                ))}
              </>
            )}

            {menuView === 'style' && (
              <>
                <p className='cap'>Size</p>
                {(Object.keys(CAPTION_SIZES) as CaptionSize[]).map((key) => (
                  <Opt
                    key={key}
                    label={CAPTION_SIZES[key].label}
                    selected={captionSize === key}
                    onClick={() => {
                      setCaptionSize(key);
                      savePrefs(key, captionStyle);
                    }}
                  />
                ))}
                <p className='cap'>Background</p>
                {(Object.keys(CAPTION_STYLES) as CaptionStyle[]).map((key) => (
                  <Opt
                    key={key}
                    label={CAPTION_STYLES[key]}
                    selected={captionStyle === key}
                    onClick={() => {
                      setCaptionStyle(key);
                      savePrefs(captionSize, key);
                    }}
                  />
                ))}
              </>
            )}

            {menuView === 'boost' && (
              <>
                {cors ? (
                  BOOSTS.map((b) => (
                    <Opt key={b} label={boostLabel(b)} selected={boost === b} onClick={() => changeBoost(b)} />
                  ))
                ) : (
                  <p className='hint'>This video&apos;s server doesn&apos;t allow volume boost.</p>
                )}
                {cors && <p className='hint'>Raises the sound above 100%. Lower your device volume if it gets too loud.</p>}
              </>
            )}

            {menuView === 'quality' && (
              <>
                <Opt label='Auto' selected={quality === -1} onClick={() => changeQuality(-1)} />
                {levels.map((l) => (
                  <Opt
                    key={l.index}
                    label={levelLabel(l)}
                    selected={quality === l.index}
                    onClick={() => changeQuality(l.index)}
                  />
                ))}
                <p className='hint'>Auto picks the best quality your connection can handle.</p>
              </>
            )}

            {menuView === 'source' &&
              ['auto', ...sourceQualities].map((q) => (
                <Opt
                  key={q}
                  label={q === 'auto' ? 'Auto' : q}
                  selected={sourceQuality === q}
                  onClick={() => onSourceQuality?.(q)}
                />
              ))}

            {menuView === 'speed' &&
              SPEEDS.map((s) => (
                <Opt key={s} label={s === 1 ? 'Normal' : `${s}x`} selected={speed === s} onClick={() => changeSpeed(s)} />
              ))}
          </div>
        </MenuWrap>
      )}
    </Root>
  );
}
