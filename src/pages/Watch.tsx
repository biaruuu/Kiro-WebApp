import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  FaStepBackward,
  FaStepForward,
  FaStar,
  FaInfoCircle,
  FaDownload,
} from 'react-icons/fa';
import StreamPlayer from '../components/Watch/Video/StreamPlayer';
import EpisodePanel from '../components/Watch/EpisodePanel';
import Shelf, { toShelfItems } from '../components/Details/Shelf';
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
// Styles
// ---------------------------------------------------------------------------
const Page = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24rem;
  gap: 1.25rem;
  align-items: start;
  max-width: 120rem;
  margin: 0 auto;

  @media (max-width: 1200px) {
    grid-template-columns: minmax(0, 1fr) 21rem;
  }
  @media (max-width: 1000px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Main = styled.div`
  min-width: 0;
`;

const Side = styled.div`
  min-width: 0;
  @media (min-width: 1001px) {
    position: sticky;
    top: 4.5rem;
  }
`;

const NowPlaying = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.9rem 0 0.4rem;

  h1 {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.3;
  }
  p {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--global-text-muted);
  }

  @media (max-width: 600px) {
    h1 {
      font-size: 1rem;
    }
  }
`;

const NavButtons = styled.div`
  display: flex;
  gap: 0.4rem;
  flex: none;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--global-border);
  border-radius: var(--global-border-radius);
  background: ${({ $primary }) =>
    $primary ? 'var(--primary-accent)' : 'var(--global-button-bg)'};
  color: ${({ $primary }) => ($primary ? '#fff' : 'var(--global-text)')};
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--primary-accent);
    color: #fff;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  @media (max-width: 500px) {
    padding: 0.5rem 0.65rem;
    span {
      display: none;
    }
  }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--global-secondary-bg);
  border: 1px solid var(--global-border);
  border-radius: calc(var(--global-border-radius) * 2);
`;

const Group = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--global-text-muted);
`;

const Segment = styled.div`
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--global-primary-bg);
  border: 1px solid var(--global-border);
`;

const SegBtn = styled.button<{ $active: boolean }>`
  padding: 0.35rem 0.9rem;
  border: none;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--global-text)')};
  background: ${({ $active }) => ($active ? 'var(--primary-accent)' : 'transparent')};
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  padding: 0.4rem 0.6rem;
  border-radius: var(--global-border-radius);
  border: 1px solid var(--global-border);
  background: var(--global-primary-bg);
  color: var(--global-text);
  font-size: 0.8rem;
  font-weight: 600;
`;

const Toggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--global-text);
  user-select: none;

  input {
    accent-color: var(--primary-accent);
    width: 1rem;
    height: 1rem;
  }
`;

const Notice = styled.div<{ $tone?: 'warn' | 'error' }>`
  margin-top: 0.75rem;
  padding: 0.65rem 0.9rem;
  border-radius: var(--global-border-radius);
  font-size: 0.85rem;
  border: 1px solid
    ${({ $tone }) => ($tone === 'error' ? '#f4433666' : '#d69e0066')};
  background: ${({ $tone }) => ($tone === 'error' ? '#f4433614' : '#d69e0014')};
  color: var(--global-text);
`;

const InfoCard = styled.section`
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: 1.25rem;
  margin-top: 1.25rem;
  padding: 1rem;
  background: var(--global-secondary-bg);
  border: 1px solid var(--global-border);
  border-radius: calc(var(--global-border-radius) * 2);

  img {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: var(--global-border-radius);
    background: var(--global-tertiary-bg);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
  }
  .desc {
    margin: 0.75rem 0;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--global-text);
    opacity: 0.85;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-line;
  }

  @media (max-width: 600px) {
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: 0.85rem;
    h2 {
      font-size: 1.05rem;
    }
    .desc {
      -webkit-line-clamp: 4;
      font-size: 0.82rem;
    }
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--global-tertiary-bg);
  color: var(--global-text);
  svg {
    color: #f5c518;
  }
`;

const Skeleton = styled.div<{ $h: string }>`
  height: ${({ $h }) => $h};
  border-radius: calc(var(--global-border-radius) * 2);
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
      { titleEnglish: anime?.title?.english, titleRomaji: anime?.title?.romaji },
      { ...currentEp, image: currentEp.image || anime?.image },
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
  const relations = toShelfItems(
    (anime?.relations ?? []).filter((r: any) => ANIME_FORMATS.includes(r.type)),
  );
  const recommendations = toShelfItems(
    (anime?.recommendations ?? []).filter((r: any) => ANIME_FORMATS.includes(r.type)),
  );

  return (
    <>
      <Page>
        <Main>
          {providers === null ? (
            <Skeleton $h='min(56vw, 38rem)' />
          ) : noSources ? (
            <Notice $tone='error'>
              <strong>No streaming sources found for this anime yet.</strong>
              <br />
              {providersError ||
                'None of the providers has episodes for it. It may be too new or not licensed for streaming.'}
              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
                <Btn onClick={() => setReloadKey((k) => k + 1)}>Retry</Btn>
                <Btn as={Link as any} to={`/anime/${animeId}`}>
                  Back to details
                </Btn>
              </div>
            </Notice>
          ) : (
            <>
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
                onProgress={(t, d) =>
                  currentEp && saveProgress(animeId, currentEp.number, t, d)
                }
              />

              <NowPlaying>
                <div>
                  <h1>{title}</h1>
                  <p>
                    {currentEp
                      ? `Episode ${currentEp.number}${currentEp.title ? ` — ${currentEp.title}` : ''}`
                      : ''}
                  </p>
                </div>
                <NavButtons>
                  <Btn onClick={goPrev} disabled={currentIndex <= 0} title='Previous (Shift+P)'>
                    <FaStepBackward /> <span>Prev</span>
                  </Btn>
                  <Btn
                    onClick={goNext}
                    disabled={currentIndex < 0 || currentIndex >= episodes.length - 1}
                    title='Next (Shift+N)'
                    $primary
                  >
                    <span>Next</span> <FaStepForward />
                  </Btn>
                </NavButtons>
              </NowPlaying>

              <Controls>
                <Group>
                  Audio
                  <Segment>
                    <SegBtn
                      $active={audio === 'sub'}
                      disabled={!hasAudio.sub}
                      onClick={() => changeAudio('sub')}
                    >
                      SUB
                    </SegBtn>
                    <SegBtn
                      $active={audio === 'dub'}
                      disabled={!hasAudio.dub}
                      onClick={() => changeAudio('dub')}
                    >
                      DUB
                    </SegBtn>
                  </Segment>
                </Group>

                {providerOptions.length > 0 && (
                  <Group>
                    Source
                    <Select
                      value={activeProvider?.provider}
                      onChange={(e) => changeProvider(e.target.value)}
                      aria-label='Provider'
                    >
                      {providerOptions.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {providerLabel(p.provider)} ({p[audio].length})
                        </option>
                      ))}
                    </Select>
                  </Group>
                )}

                <Toggle>
                  <input
                    type='checkbox'
                    checked={autoPlay}
                    onChange={(e) => {
                      setAutoPlay(e.target.checked);
                      writeFlag('autoPlay', e.target.checked);
                    }}
                  />
                  Autoplay
                </Toggle>
                <Toggle>
                  <input
                    type='checkbox'
                    checked={autoNext}
                    onChange={(e) => {
                      setAutoNext(e.target.checked);
                      writeFlag('autoNext', e.target.checked);
                    }}
                  />
                  Auto next
                </Toggle>
                <Toggle>
                  <input
                    type='checkbox'
                    checked={autoSkip}
                    onChange={(e) => {
                      setAutoSkip(e.target.checked);
                      writeFlag('autoSkip', e.target.checked);
                    }}
                  />
                  Auto skip intro/outro
                </Toggle>

                {watch?.downloads?.[0] && (
                  <Btn as='a' {...({ href: watch.downloads[0].url, target: '_blank', rel: 'noreferrer' } as any)}>
                    <FaDownload /> <span>Download</span>
                  </Btn>
                )}
              </Controls>

              {audio !== audioPref && (
                <Notice $tone='warn'>
                  {audioPref.toUpperCase()} isn’t available for this anime, so{' '}
                  {audio.toUpperCase()} is selected.
                </Notice>
              )}
              {providerNotice && <Notice $tone='warn'>{providerNotice}</Notice>}
            </>
          )}

          <InfoCard>
            {anime ? (
              <img src={anime.image} alt={`${title} poster`} />
            ) : (
              <Skeleton $h='12rem' />
            )}
            <div>
              <h2>{title}</h2>
              {anime ? (
                <>
                  <Chips>
                    {anime.rating ? (
                      <Chip>
                        <FaStar /> {(anime.rating / 10).toFixed(1)}
                      </Chip>
                    ) : null}
                    {anime.type && <Chip>{anime.type.replace('_', ' ')}</Chip>}
                    {anime.releaseDate && <Chip>{anime.releaseDate}</Chip>}
                    {anime.status && <Chip>{anime.status}</Chip>}
                    {anime.totalEpisodes ? <Chip>{anime.totalEpisodes} eps</Chip> : null}
                    {(anime.genres ?? []).slice(0, 4).map((g) => (
                      <Chip key={g}>{g}</Chip>
                    ))}
                  </Chips>
                  <p className='desc'>{anime.description}</p>
                  <Btn as={Link as any} to={`/anime/${animeId}`}>
                    <FaInfoCircle /> Full details
                  </Btn>
                </>
              ) : (
                <Skeleton $h='6rem' />
              )}
            </div>
          </InfoCard>

          <Shelf title='Related' items={relations} />
          <Shelf title='You might also like' items={recommendations} />
        </Main>

        <Side>
          {providers === null ? (
            <Skeleton $h='28rem' />
          ) : (
            <EpisodePanel
              episodes={episodes}
              currentNumber={currentEp?.number}
              watched={watched}
              fallbackImage={anime?.cover || anime?.image}
              onSelect={selectEpisode}
            />
          )}
        </Side>
      </Page>
    </>
  );
}
