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
import { FaForward, FaServer } from 'react-icons/fa';
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

const ServerBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.6rem;
  padding: 0 0.4rem;
  font-size: 0.78rem;
  color: var(--global-text-muted);

  svg {
    flex: none;
  }
`;

const ServerChip = styled.button<{ $active: boolean; $failed: boolean }>`
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid
    ${({ $active }) => ($active ? 'var(--primary-accent)' : 'var(--global-border)')};
  background: ${({ $active }) =>
    $active ? 'var(--primary-accent)' : 'var(--global-button-bg)'};
  color: ${({ $active }) => ($active ? '#fff' : 'var(--global-text)')};
  opacity: ${({ $failed, $active }) => ($failed && !$active ? 0.45 : 1)};
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--primary-accent);
    color: #fff;
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

  // New episode -> start over on the best server.
  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
    setTime(0);
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
        <strong>No working server found</strong>
        <span>
          {servers.length
            ? 'Every server failed to load. Try another provider or audio track.'
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

      {servers.length > 0 && (
        <ServerBar>
          <FaServer />
          Server
          {servers.map((s, i) => (
            <ServerChip
              key={`${s.server}-${s.type}-${i}`}
              $active={i === index}
              $failed={failed.has(i)}
              onClick={() => {
                setFailed((prev) => {
                  const n = new Set(prev);
                  n.delete(i);
                  return n;
                });
                setIndex(i);
              }}
              title={s.server}
            >
              {s.server}
              {s.type === 'embed' ? ' · embed' : s.quality ? ` · ${s.quality}` : ''}
            </ServerChip>
          ))}
        </ServerBar>
      )}
    </Wrapper>
  );
}
