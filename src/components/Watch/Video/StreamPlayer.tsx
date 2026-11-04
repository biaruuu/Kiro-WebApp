import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import GlassPlayer from '../Player/GlassPlayer';
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
  /** the player's own settings menu toggles these */
  onFlag?: (key: 'autoPlay' | 'autoNext' | 'autoSkip', value: boolean) => void;
};

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
  onFlag,
}: Props) {
  const stallTimer = useRef<number | undefined>(undefined);
  // the viewer's answer to "Continue watching?" (kept across server switches)
  const resumeChoice = useRef<'resume' | 'start' | null>(null);

  const servers = useMemo(() => orderStreams(watch?.streams ?? []), [watch]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [quality, setQuality] = useState('auto');

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
    resumeChoice.current = null;
    setQuality('auto');
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
    content = (
      <GlassPlayer
        key={`${watch.episode}-${index}`}
        src={current.url}
        type={current.type === 'mp4' ? 'mp4' : 'hls'}
        title={title}
        poster={poster}
        tracks={tracks}
        startTime={resumeChoice.current === 'start' ? 0 : startTime}
        confirmResume={resumeChoice.current === null && startTime > 5}
        onResumeChoice={(c) => {
          resumeChoice.current = c;
        }}
        autoPlay={autoPlay}
        intro={intro}
        outro={outro}
        autoplayOption={onFlag ? { value: autoPlay, onChange: (v) => onFlag('autoPlay', v) } : undefined}
        autoNextOption={onFlag ? { value: autoNext, onChange: (v) => onFlag('autoNext', v) } : undefined}
        autoSkipOption={onFlag ? { value: autoSkip, onChange: (v) => onFlag('autoSkip', v) } : undefined}
        sourceQualities={qualities}
        sourceQuality={quality}
        onSourceQuality={chooseQuality}
        onReady={clearStall}
        onFail={() => tryNext(index)}
        onEnded={() => {
          if (autoNext) onEnded();
        }}
        onProgress={onProgress}
      />
    );
  }

  return (
    <Wrapper>
      <Stage>
        {content}
      </Stage>

    </Wrapper>
  );
}
