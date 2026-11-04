import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styled, { css, keyframes } from 'styled-components';
import './GlassPlayer.css';
import {
  FiCheck,
  FiMaximize,
  FiMinimize,
  FiPause,
  FiPlay,
  FiRotateCcw,
  FiRotateCw,
  FiSettings,
  FiVolume2,
  FiVolumeX,
} from 'react-icons/fi';
import { FaForward } from 'react-icons/fa';
import { MdClosedCaption, MdClosedCaptionOff } from 'react-icons/md';
import { activeText, decodeText, isThumbnailTrack, parseCaptions, type Cue } from '../../../lib/captions';

export type GlassTrack = { url: string; label: string; srclang?: string; default?: boolean };
type Range = { start: number; end: number };

type Props = {
  src: string;
  type: 'hls' | 'mp4';
  title: string;
  poster?: string;
  tracks: GlassTrack[];
  startTime?: number;
  autoPlay: boolean;
  autoSkip: boolean;
  autoNext: boolean;
  intro?: Range;
  outro?: Range;
  /** quality labels that come from separate sources (used when the stream has no levels) */
  sourceQualities?: string[];
  sourceQuality?: string;
  onSourceQuality?: (label: string) => void;
  onReady?: () => void;
  onError?: () => void;
  onEnded: () => void;
  onNext: () => void;
  onProgress: (t: number, d: number) => void;
};

type Level = { index: number; height: number; bitrate: number };

const QUALITY_KEY = 'glass-quality';
const PREFS_KEY = 'glass-caption-prefs';
const SIZES = { S: 0.85, M: 1, L: 1.25, XL: 1.5 } as const;
type SizeKey = keyof typeof SIZES;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const inRange = (t: number, r?: Range) => !!r && r.end > r.start && t >= r.start && t < r.end - 1;

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

/* ---------- Liquid Glass ---------- */

const glass = css`
  position: relative;
  background: rgba(255, 255, 255, 0.34);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18),
    inset 0 0 18px rgba(255, 255, 255, 0.12),
    0 8px 28px rgba(0, 0, 0, 0.28);
  color: #17171a;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0) 55%);
  }
`;

const Root = styled.div<{ $idle: boolean }>`
  position: absolute;
  inset: 0;
  background: #000;
  overflow: hidden;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  font-family: 'Trebuchet MS', system-ui, sans-serif;
  ${(p) => p.$idle && 'cursor: none;'}

  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
`;

const Chrome = styled.div<{ $show: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.6rem 0.65rem 0.65rem;
  pointer-events: none;
  opacity: ${(p) => (p.$show ? 1 : 0)};
  transition: opacity 0.25s ease;
  background: ${(p) =>
    p.$show
      ? 'linear-gradient(180deg, rgba(0,0,0,.38), transparent 28%, transparent 62%, rgba(0,0,0,.5))'
      : 'none'};

  > * {
    pointer-events: ${(p) => (p.$show ? 'auto' : 'none')};
  }
`;

const TitlePill = styled.div`
  ${glass}
  align-self: flex-start;
  max-width: 78%;
  padding: 0.38rem 0.85rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Bottom = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const Pill = styled.div`
  ${glass}
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.2rem 0.3rem;
  border-radius: 999px;
`;

const Circle = styled.button`
  ${glass}
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.1rem;
`;

const IconBtn = styled.button<{ $on?: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: ${(p) => (p.$on ? 'rgba(255,255,255,.55)' : 'transparent')};
  color: inherit;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.4);
  }
  &:active {
    transform: scale(0.92);
  }
  small {
    position: absolute;
    font-size: 0.5rem;
    font-weight: 800;
    margin-top: 0.1rem;
  }
  svg {
    display: block;
  }
`;

const BarPill = styled.div`
  ${glass}
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  span {
    position: relative;
    min-width: 2.2rem;
  }
  span:last-child {
    text-align: right;
  }
`;

const Track = styled.div`
  position: relative;
  z-index: 1;
  flex: 1;
  height: 1.4rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
`;

const Rail = styled.div`
  position: relative;
  width: 100%;
  height: 0.28rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.2);
  overflow: visible;

  i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: inherit;
  }
  .buf {
    background: rgba(0, 0, 0, 0.18);
  }
  .fill {
    background: #17171a;
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 0.85rem;
    height: 0.85rem;
    margin: -0.425rem 0 0 -0.425rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }
`;

const Center = styled.button<{ $show: boolean }>`
  ${glass}
  position: absolute;
  z-index: 5;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  width: 4.2rem;
  height: 4.2rem;
  margin: -2.1rem 0 0 -2.1rem;
  padding: 0;
  border-radius: 50%;
  font-size: 1.9rem;
  cursor: pointer;
  opacity: ${(p) => (p.$show ? 1 : 0)};
  pointer-events: ${(p) => (p.$show ? 'auto' : 'none')};
  transition: opacity 0.2s ease;

  svg {
    margin-left: 0.15rem;
  }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;

const Spinner = styled.div`
  position: absolute;
  z-index: 3;
  left: 50%;
  top: 50%;
  width: 2.6rem;
  height: 2.6rem;
  margin: -1.3rem 0 0 -1.3rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: ${spin} 0.8s linear infinite;
  pointer-events: none;
`;

const SkipPill = styled.button`
  ${glass}
  position: absolute;
  z-index: 6;
  right: 0.75rem;
  bottom: 6.4rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.95rem;
  border-radius: 999px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
`;

/* Crunchyroll-style captions: bold white Trebuchet MS with a heavy black outline. */
const Caption = styled.div<{ $lift: boolean; $size: number }>`
  position: absolute;
  z-index: 2;
  left: 4%;
  right: 4%;
  bottom: ${(p) => (p.$lift ? '6.6rem' : '5%')};
  text-align: center;
  pointer-events: none;
  transition: bottom 0.25s ease;
  font-family: 'Trebuchet MS', Verdana, sans-serif;
  font-weight: 700;
  font-size: ${(p) => p.$size}px;
  line-height: 1.22;
  color: #fff;
  -webkit-text-stroke: 0.1em #000;
  paint-order: stroke fill;
  text-shadow:
    0 0 0.12em #000,
    0.06em 0.06em 0 #000,
    -0.06em 0.06em 0 #000,
    0.06em -0.06em 0 #000,
    -0.06em -0.06em 0 #000,
    0 0.08em 0.14em rgba(0, 0, 0, 0.85);
  white-space: pre-line;
`;

const Panel = styled.div`
  ${glass}
  position: absolute;
  z-index: 7;
  right: 0.65rem;
  bottom: 6.2rem;
  width: min(17rem, calc(100% - 1.3rem));
  max-height: calc(100% - 7.6rem);
  overflow-y: auto;
  padding: 0.7rem 0.75rem 0.8rem;
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.5);

  h4 {
    position: relative;
    margin: 0.55rem 0 0.35rem;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  h4:first-child {
    margin-top: 0;
  }
  .chips {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.32rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.35);
    color: #17171a;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }
  button.on {
    background: #17171a;
    border-color: #17171a;
    color: #fff;
  }
`;

/* ---------- component ---------- */

export default function GlassPlayer({
  src,
  type,
  title,
  poster,
  tracks,
  startTime = 0,
  autoPlay,
  autoSkip,
  autoNext,
  intro,
  outro,
  sourceQualities = [],
  sourceQuality = 'auto',
  onSourceQuality,
  onReady,
  onError,
  onEnded,
  onNext,
  onProgress,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastReport = useRef(0);
  const resumed = useRef(false);
  const draggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [show, setShow] = useState(true);
  const [panel, setPanel] = useState(false);
  const [full, setFull] = useState(false);
  const [boxH, setBoxH] = useState(360);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [liveLevel, setLiveLevel] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [size, setSize] = useState<SizeKey>('M');
  const [offset, setOffset] = useState(0);

  const isHls = type === 'hls';

  // saved caption size
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (p.size in SIZES) setSize(p.size as SizeKey);
    } catch {
      /* ignore */
    }
  }, []);

  // keep the caption size proportional to the player
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----- source (hls.js / native / mp4) ----- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    let native = false;
    resumed.current = false;
    setLevels([]);
    setLevel(-1);
    setLiveLevel(-1);
    setWaiting(true);
    setTime(0);

    if (!isHls) {
      v.src = src;
      return () => {
        cancelled = true;
        v.removeAttribute('src');
        v.load();
      };
    }

    import('hls.js')
      .then(({ default: Hls }: any) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (v.canPlayType('application/vnd.apple.mpegurl')) {
            native = true;
            v.src = src;
          } else onError?.();
          return;
        }
        let net = 0;
        let media = 0;
        const hls = new Hls({ enableWorker: true, maxBufferLength: 40, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
          const best = new Map<number, Level>();
          data.levels.forEach((l: any, index: number) => {
            const key = l.height || Math.round(l.bitrate / 1000);
            const have = best.get(key);
            if (!have || l.bitrate > have.bitrate) {
              best.set(key, { index, height: l.height || 0, bitrate: l.bitrate });
            }
          });
          const list = [...best.values()].sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
          setLevels(list);
          try {
            const saved = Number(localStorage.getItem(QUALITY_KEY));
            const hit = saved ? list.find((l) => l.height === saved) : undefined;
            if (hit) {
              hls.currentLevel = hit.index;
              setLevel(hit.index);
            }
          } catch {
            /* start on Auto */
          }
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, d: any) => setLiveLevel(d.level));
        hls.on(Hls.Events.FRAG_LOADED, () => {
          net = 0;
          media = 0;
        });
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && net < 3) {
            net += 1;
            window.setTimeout(() => hlsRef.current === hls && hls.startLoad(), 500 * net);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && media < 3) {
            media += 1;
            if (media === 2) hls.swapAudioCodec();
            hls.recoverMediaError();
          } else onError?.();
        });
        hls.loadSource(src);
        hls.attachMedia(v);
      })
      .catch(() => onError?.());

    return () => {
      cancelled = true;
      const h = hlsRef.current;
      hlsRef.current = null;
      h?.destroy();
      if (native) {
        v.removeAttribute('src');
        v.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isHls]);

  /* ----- captions (fetched and parsed here, drawn by us) ----- */
  const usable = useMemo(() => tracks.filter((t) => t?.url), [tracks]);
  useEffect(() => {
    const pick = usable.find((t) => /^en/i.test(t.srclang || '') && t.default) || usable.find((t) => t.default) || usable.find((t) => /^en/i.test(t.srclang || '')) || usable[0];
    setTrackUrl(pick?.url ?? null);
  }, [usable]);

  useEffect(() => {
    setCues([]);
    if (!trackUrl) return;
    const ctl = new AbortController();
    fetch(trackUrl, { signal: ctl.signal })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        const parsed = parseCaptions(decodeText(buf));
        if (!isThumbnailTrack(parsed.cues)) setCues(parsed.cues);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [trackUrl]);

  const captionText = trackUrl ? activeText(cues, time + offset) : '';

  /* ----- controls visibility ----- */
  const wake = useCallback(() => {
    setShow(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !draggingRef.current) setShow(false);
    }, 3200);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (!playing) {
      window.clearTimeout(hideTimer.current);
      setShow(true);
    } else wake();
  }, [playing, wake]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  /* ----- actions ----- */
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);
  const seekBy = (d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + d));
    wake();
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFull = async () => {
    const el = rootRef.current;
    const v = videoRef.current as any;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el && document.fullscreenEnabled) {
        await el.requestFullscreen();
        try {
          await (screen.orientation as any)?.lock?.('landscape');
        } catch {
          /* not supported */
        }
      } else v?.webkitEnterFullscreen?.();
    } catch {
      /* refused */
    }
  };
  const pickLevel = (index: number) => {
    const h = hlsRef.current;
    if (!h) return;
    h.currentLevel = index;
    setLevel(index);
    try {
      const height = levels.find((l) => l.index === index)?.height;
      if (index === -1 || !height) localStorage.removeItem(QUALITY_KEY);
      else localStorage.setItem(QUALITY_KEY, String(height));
    } catch {
      /* ignore */
    }
  };
  const pickSpeed = (s: number) => {
    if (videoRef.current) videoRef.current.playbackRate = s;
    setSpeed(s);
  };
  const pickSize = (s: SizeKey) => {
    setSize(s);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ size: s }));
    } catch {
      /* ignore */
    }
  };

  /* ----- seek bar ----- */
  const seekFromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const r = e.currentTarget.getBoundingClientRect();
    if (!v || !v.duration) return;
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    v.currentTime = p * v.duration;
    setTime(v.currentTime);
  };

  /* ----- keyboard ----- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /input|textarea|select/i.test(t.tagName)) return;
      const inside = root.contains(document.activeElement) || document.fullscreenElement === root;
      if (!inside && !root.matches(':hover')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') toggle();
      else if (k === 'arrowleft' || k === 'j') seekBy(-10);
      else if (k === 'arrowright' || k === 'l') seekBy(10);
      else if (k === 'f') void toggleFull();
      else if (k === 'm') toggleMute();
      else if (k === 'c') setTrackUrl((u) => (u ? null : usable[0]?.url ?? null));
      else return;
      e.preventDefault();
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, usable, wake]);

  /* ----- media events ----- */
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    if (!draggingRef.current) setTime(t);
    if (v.buffered.length) {
      let end = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= t + 0.5) end = Math.max(end, v.buffered.end(i));
      }
      setBuffered(end);
    }
    if (autoSkip) {
      if (inRange(t, intro)) v.currentTime = intro!.end;
      else if (inRange(t, outro) && !autoNext) v.currentTime = outro!.end;
    }
    const now = Date.now();
    if (now - lastReport.current > 4000 && v.duration > 0) {
      lastReport.current = now;
      onProgress(t, v.duration);
    }
  };
  const onCanPlay = () => {
    setWaiting(false);
    onReady?.();
    const v = videoRef.current;
    if (v && !resumed.current) {
      resumed.current = true;
      if (startTime > 5) v.currentTime = startTime;
      if (autoPlay) void v.play().catch(() => {});
    }
  };

  const levelLabel = (l: Level) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`);
  const liveHeight = liveLevel >= 0 ? hlsRef.current?.levels?.[liveLevel]?.height : 0;
  const useLevels = levels.length > 1;
  const captionSize = Math.min(40, Math.max(13, (boxH / 100) * 5.2)) * SIZES[size];

  const showIntroSkip = !autoSkip && inRange(time, intro);
  const showOutroSkip = !autoSkip && inRange(time, outro);
  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <Root
      ref={rootRef}
      tabIndex={0}
      $idle={!show && playing}
      onMouseMove={wake}
      onTouchStart={wake}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        crossOrigin='anonymous'
        onClick={() => {
          if (panel) setPanel(false);
          else if (!show) wake();
          else toggle();
        }}
        onDoubleClick={toggleFull}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={onCanPlay}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={onTimeUpdate}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onEnded={() => {
          const v = videoRef.current;
          if (v) onProgress(v.duration, v.duration);
          setPlaying(false);
          if (autoNext) onEnded();
        }}
        onError={() => {
          if (!isHls || !hlsRef.current) onError?.();
        }}
      />

      {captionText && (
        <Caption $lift={show} $size={captionSize}>
          {captionText}
        </Caption>
      )}

      {waiting && <Spinner />}

      <Center
        $show={!playing && !waiting}
        onClick={toggle}
        aria-label='Play'
      >
        <FiPlay />
      </Center>

      {showIntroSkip && (
        <SkipPill onClick={() => videoRef.current && (videoRef.current.currentTime = intro!.end)}>
          <FaForward /> Skip Intro
        </SkipPill>
      )}
      {showOutroSkip && (
        <SkipPill
          onClick={() => {
            if (autoNext) onNext();
            else if (videoRef.current) videoRef.current.currentTime = outro!.end;
          }}
        >
          <FaForward /> {autoNext ? 'Next Episode' : 'Skip Outro'}
        </SkipPill>
      )}

      {panel && show && (
        <Panel onClick={(e) => e.stopPropagation()}>
          <h4>Quality</h4>
          <div className='chips'>
            {useLevels ? (
              <>
                <button className={level === -1 ? 'on' : ''} onClick={() => pickLevel(-1)}>
                  Auto{level === -1 && liveHeight ? ` ${liveHeight}p` : ''}
                </button>
                {levels.map((l) => (
                  <button key={l.index} className={level === l.index ? 'on' : ''} onClick={() => pickLevel(l.index)}>
                    {levelLabel(l)}
                  </button>
                ))}
              </>
            ) : sourceQualities.length > 1 ? (
              ['auto', ...sourceQualities].map((q) => (
                <button key={q} className={sourceQuality === q ? 'on' : ''} onClick={() => onSourceQuality?.(q)}>
                  {q === 'auto' ? 'Auto' : q}
                </button>
              ))
            ) : (
              <button className='on'>
                <FiCheck /> Auto
              </button>
            )}
          </div>

          <h4>Speed</h4>
          <div className='chips'>
            {SPEEDS.map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => pickSpeed(s)}>
                {s === 1 ? 'Normal' : `${s}×`}
              </button>
            ))}
          </div>

          {usable.length > 0 && (
            <>
              <h4>Captions</h4>
              <div className='chips'>
                <button className={!trackUrl ? 'on' : ''} onClick={() => setTrackUrl(null)}>
                  Off
                </button>
                {usable.map((t, i) => (
                  <button key={t.url} className={trackUrl === t.url ? 'on' : ''} onClick={() => setTrackUrl(t.url)}>
                    {t.label || `Track ${i + 1}`}
                  </button>
                ))}
              </div>
              <h4>Caption size</h4>
              <div className='chips'>
                {(Object.keys(SIZES) as SizeKey[]).map((k) => (
                  <button key={k} className={size === k ? 'on' : ''} onClick={() => pickSize(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <h4>Caption timing {offset ? `(${offset > 0 ? '+' : ''}${offset.toFixed(1)}s)` : ''}</h4>
              <div className='chips'>
                <button onClick={() => setOffset((o) => Math.round((o - 0.5) * 10) / 10)}>−0.5s</button>
                <button onClick={() => setOffset(0)}>Reset</button>
                <button onClick={() => setOffset((o) => Math.round((o + 0.5) * 10) / 10)}>+0.5s</button>
              </div>
            </>
          )}
        </Panel>
      )}

      <Chrome $show={show} onClick={(e) => e.target === e.currentTarget && (panel ? setPanel(false) : toggle())}>
        <TitlePill>{title}</TitlePill>

        <Bottom>
          <BarPill>
            <span>{fmt(time)}</span>
            <Track
              onPointerDown={(e) => {
                draggingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromEvent(e);
              }}
              onPointerMove={(e) => draggingRef.current && seekFromEvent(e)}
              onPointerUp={() => {
                draggingRef.current = false;
                wake();
              }}
              onPointerCancel={() => (draggingRef.current = false)}
            >
              <Rail>
                <i className='buf' style={{ width: `${bufPct}%` }} />
                <i className='fill' style={{ width: `${pct}%` }} />
                <span className='knob' style={{ left: `${pct}%`, minWidth: 0 }} />
              </Rail>
            </Track>
            <span>{fmt(duration)}</span>
          </BarPill>

          <Row>
            <Pill>
              <IconBtn onClick={() => seekBy(-10)} aria-label='Back 10 seconds'>
                <FiRotateCcw />
                <small>10</small>
              </IconBtn>
              <IconBtn onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <FiPause /> : <FiPlay />}
              </IconBtn>
              <IconBtn onClick={() => seekBy(10)} aria-label='Forward 10 seconds'>
                <FiRotateCw />
                <small>10</small>
              </IconBtn>
            </Pill>

            <Row style={{ justifyContent: 'flex-end' }}>
              <Pill>
                {usable.length > 0 && (
                  <IconBtn
                    $on={!!trackUrl}
                    onClick={() => setTrackUrl(trackUrl ? null : usable[0].url)}
                    aria-label='Captions'
                  >
                    {trackUrl ? <MdClosedCaption /> : <MdClosedCaptionOff />}
                  </IconBtn>
                )}
                <IconBtn onClick={toggleMute} aria-label='Mute'>
                  {muted ? <FiVolumeX /> : <FiVolume2 />}
                </IconBtn>
                <IconBtn onClick={toggleFull} aria-label='Fullscreen'>
                  {full ? <FiMinimize /> : <FiMaximize />}
                </IconBtn>
              </Pill>
              <Circle onClick={() => setPanel((v) => !v)} aria-label='Settings'>
                <FiSettings />
              </Circle>
            </Row>
          </Row>
        </Bottom>
      </Chrome>
    </Root>
  );
}
