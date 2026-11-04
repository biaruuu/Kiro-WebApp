import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import './PlayerStyles.css';
import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import { FaForward } from 'react-icons/fa';
import { FiCheck, FiSettings } from 'react-icons/fi';
import {
  orderStreams,
  type StreamSource,
  type WatchData,
} from '../../../hooks/anivexa';

const STALL_TIMEOUT_MS = 20000;

const Wrapper = styled.div`
  width: 100%;
`;

const Stage = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 0;
  overflow: hidden;

  @media (min-width: 700px) {
    border-radius: 0.9rem;
  }

  .player {
    width: 100%;
    height: 100%;
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  text-align: center;
  color: var(--global-text);
  background: radial-gradient(circle at center, #15151c, #000);
  font-size: 0.9rem;
`;

const Spinner = styled.div`
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--primary-accent);
  animation: ${spin} 0.8s linear infinite;
`;

const SkipButton = styled.button`
  position: absolute;
  right: 0.75rem;
  bottom: 4.5rem;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(10, 10, 14, 0.8);
  backdrop-filter: blur(6px);
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    background: var(--primary-accent);
  }
  @media (max-width: 500px) {
    bottom: 3.5rem;
    font-size: 0.75rem;
    padding: 0.45rem 0.7rem;
  }
`;

const QualityWrap = styled.div`
  position: absolute;
  z-index: 6;
  top: 0.6rem;
  right: 0.6rem;
`;

const QualityBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(10, 10, 14, 0.62);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
`;

const QualityMenu = styled.div`
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  min-width: 8rem;
  padding: 0.3rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(20, 20, 26, 0.96);
  box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.55);

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: #fff;
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  button.on {
    color: #b7a9ff;
  }
`;

type Props = {
  watch: WatchData | null;
  loading: boolean;
  error: string | null;
  poster?: string;
  title: string;
  startTime?: number;
  autoPlay: boolean;
  autoNext: boolean;
  autoSkip: boolean;
  onEnded: () => void;
  /** every server of this source failed: let the page try another provider */
  onExhausted?: () => void;
  onProgress: (currentTime: number, duration: number) => void;
};

const isSkippable = (t: number, r?: { start: number; end: number }) =>
  !!r && r.end > r.start && t >= r.start && t < r.end - 1;

export default function StreamPlayer({
  watch,
  loading,
  error,
  poster,
  title,
  startTime = 0,
  autoPlay,
  autoNext,
  autoSkip,
  onEnded,
  onExhausted,
  onProgress,
}: Props) {
  const player = useRef<MediaPlayerInstance>(null);
  const stallTimer = useRef<number | undefined>(undefined);
  const lastReport = useRef(0);
  const resumed = useRef(false);

  const servers = useMemo(() => orderStreams(watch?.streams ?? []), [watch]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [time, setTime] = useState(0);
  const [quality, setQuality] = useState('auto');
  const [qualityOpen, setQualityOpen] = useState(false);

  // Distinct quality labels offered by separate sources (an HLS master playlist
  // already has its own Auto / 1080p / 720p menu inside the player).
  const qualities = useMemo(() => {
    const seen = new Map<string, number>();
    for (const sv of servers) {
      if (sv.type === 'embed') continue;
      const n = parseInt(String(sv.quality ?? ''), 10);
      if (n > 0 && !seen.has(`${n}p`)) seen.set(`${n}p`, n);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  }, [servers]);

  const chooseQuality = (label: string) => {
    setQuality(label);
    setQualityOpen(false);
    const i =
      label === 'auto'
        ? 0
        : servers.findIndex((sv) => sv.type !== 'embed' && `${parseInt(String(sv.quality), 10)}p` === label);
    if (i >= 0) {
      setFailed(new Set());
      setIndex(i);
    }
  };

  // New episode -> start over on the best server.
  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
    setTime(0);
    setQuality('auto');
    setQualityOpen(false);
    resumed.current = false;
  }, [watch]);

  const current: StreamSource | undefined = servers[index];

  const clearStall = () => {
    if (stallTimer.current) window.clearTimeout(stallTimer.current);
    stallTimer.current = undefined;
  };

  const tryNext = useCallback(
    (from: number) => {
      clearStall();
      setFailed((prev) => new Set(prev).add(from));
      const next = servers.findIndex((_, i) => i > from && !failed.has(i));
      if (next !== -1) setIndex(next);
    },
    [servers, failed],
  );

  // Watchdog: if a native source never becomes playable, move on.
  useEffect(() => {
    clearStall();
    if (current && current.type !== 'embed') {
      stallTimer.current = window.setTimeout(
        () => tryNext(index),
        STALL_TIMEOUT_MS,
      );
    }
    return clearStall;
  }, [current, index, tryNext]);

  const tracks = useMemo(() => {
    const list = current?.subtitles?.length
      ? current.subtitles
      : (watch?.subtitles ?? []);
    // Skip the thumbnail-preview VTT some providers list as a "subtitle".
    return list.filter((t) => t?.url && !/thumb|sprite|storyboard/i.test(t.url));
  }, [current, watch]);

  const intro = current?.intro;
  const outro = current?.outro;

  const handleTimeUpdate = () => {
    const p = player.current;
    if (!p) return;
    const t = p.currentTime;
    setTime(t);

    if (autoSkip) {
      if (isSkippable(t, intro)) p.currentTime = intro!.end;
      else if (isSkippable(t, outro) && !autoNext) p.currentTime = outro!.end;
    }

    const now = Date.now();
    if (now - lastReport.current > 4000 && p.duration > 0) {
      lastReport.current = now;
      onProgress(t, p.duration);
    }
  };

  const handleCanPlay = () => {
    clearStall();
    const p = player.current;
    if (p && !resumed.current && startTime > 5) {
      resumed.current = true;
      p.currentTime = startTime;
    }
  };

  const handleEnded = () => {
    if (player.current) onProgress(player.current.duration, player.current.duration);
    if (autoNext) onEnded();
  };

  const handleProviderChange = (provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) provider.config = {};
  };

  const showIntroSkip = !autoSkip && isSkippable(time, intro);
  const showOutroSkip = !autoSkip && isSkippable(time, outro);

  const allFailed = servers.length > 0 && failed.size >= servers.length;

  useEffect(() => {
    if (allFailed) onExhausted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFailed]);

  let content;
  if (loading) {
    content = (
      <Overlay>
        <Spinner />
        Loading episode…
      </Overlay>
    );
  } else if (error || !watch) {
    content = (
      <Overlay>
        <strong>Couldn’t load this episode</strong>
        <span>{error || 'No streaming data available.'}</span>
      </Overlay>
    );
  } else if (!current || allFailed) {
    content = (
      <Overlay>
        <strong>Couldn’t play this episode</strong>
        <span>
          {servers.length
            ? 'None of the sources for this provider loaded. Try another provider or audio track.'
            : 'This episode has no sources yet. Try another provider.'}
        </span>
      </Overlay>
    );
  } else if (current.type === 'embed') {
    content = (
      <iframe
        key={current.url}
        src={current.url}
        title={title}
        allowFullScreen
        allow='autoplay; fullscreen; picture-in-picture'
        referrerPolicy='origin'
      />
    );
  } else {
    const mediaType =
      current.type === 'mp4' ? 'video/mp4' : 'application/x-mpegurl';
    content = (
      <MediaPlayer
        key={`${watch.episode}-${index}`}
        className='player'
        title={title}
        src={
          { src: current.url, type: mediaType } as any
        }
        autoplay={autoPlay}
        crossorigin
        playsinline
        aspectRatio='16/9'
        load='eager'
        posterLoad='eager'
        streamType='on-demand'
        keyTarget='player'
        ref={player}
        onProviderChange={handleProviderChange}
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => tryNext(index)}
      >
        <MediaProvider>
          {poster && <Poster className='vds-poster' src={poster} alt='' />}
          {tracks.map((t, i) => (
            <Track
              key={t.url}
              src={t.url}
              kind='subtitles'
              label={t.label}
              lang={t.srclang || 'en'}
              default={t.default ?? i === 0}
            />
          ))}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    );
  }

  return (
    <Wrapper>
      <Stage>
        {content}
        {qualities.length > 1 && current && current.type !== 'embed' && (
          <QualityWrap>
            <QualityBtn onClick={() => setQualityOpen((v) => !v)} aria-label='Quality'>
              <FiSettings /> {quality === 'auto' ? 'Auto' : quality}
            </QualityBtn>
            {qualityOpen && (
              <QualityMenu>
                {['auto', ...qualities].map((q) => (
                  <button key={q} className={q === quality ? 'on' : ''} onClick={() => chooseQuality(q)}>
                    {q === 'auto' ? 'Auto' : q}
                    {q === quality && <FiCheck />}
                  </button>
                ))}
              </QualityMenu>
            )}
          </QualityWrap>
        )}
        {showIntroSkip && (
          <SkipButton onClick={() => (player.current!.currentTime = intro!.end)}>
            <FaForward /> Skip Intro
          </SkipButton>
        )}
        {showOutroSkip && (
          <SkipButton
            onClick={() => {
              if (autoNext) onEnded();
              else player.current!.currentTime = outro!.end;
            }}
          >
            <FaForward /> {autoNext ? 'Next Episode' : 'Skip Outro'}
          </SkipButton>
        )}
      </Stage>

    </Wrapper>
  );
}
