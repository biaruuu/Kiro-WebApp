import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  FaPlay,
  FaStar,
  FaClock,
  FaCalendarAlt,
  FaYoutube,
  FaTimes,
} from 'react-icons/fa';
import Shelf, { toShelfItems } from '../components/Details/Shelf';
import { fetchAnimeData } from '../hooks/useApi';
import {
  fetchProviderEpisodes,
  providerLabel,
  type ProviderEpisodes,
} from '../hooks/anivexa';
import { getLastWatchedNumber } from '../hooks/watchStorage';
import type { Anime } from '../hooks/interface';

const ANIME_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'];

const Page = styled.div`
  max-width: 100rem;
  margin: 0 auto;
`;

const Hero = styled.section<{ $banner?: string }>`
  position: relative;
  border-radius: calc(var(--global-border-radius) * 3);
  overflow: hidden;
  background: var(--global-secondary-bg);
  isolation: isolate;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background: ${({ $banner }) => ($banner ? `url(${$banner})` : 'none')} center /
      cover no-repeat;
    filter: blur(2px);
    transform: scale(1.03);
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(to top, var(--global-primary-bg) 8%, rgba(8, 8, 8, 0.55) 60%, rgba(8, 8, 8, 0.35)),
      linear-gradient(to right, rgba(8, 8, 8, 0.75), transparent 70%);
  }
`;

const HeroInner = styled.div`
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: 1.75rem;
  align-items: end;
  padding: 7rem 1.75rem 1.75rem;
  color: #f5f5f5;

  @media (max-width: 800px) {
    grid-template-columns: 8.5rem minmax(0, 1fr);
    gap: 1rem;
    padding: 5rem 1rem 1rem;
  }
  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
    padding-top: 3.5rem;
  }
`;

const Poster = styled.img`
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: calc(var(--global-border-radius) * 2);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.55);
  background: var(--global-tertiary-bg);

  @media (max-width: 520px) {
    width: 9.5rem;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(1.4rem, 3.4vw, 2.4rem);
  line-height: 1.15;
`;

const Native = styled.p`
  margin: 0.35rem 0 0.9rem;
  font-size: 0.95rem;
  opacity: 0.75;
`;

const Chips = styled.div<{ $center?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 1rem;

  @media (max-width: 520px) {
    justify-content: center;
  }
`;

const Chip = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: ${({ $accent }) =>
    $accent ? 'var(--primary-accent)' : 'rgba(255, 255, 255, 0.12)'};
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;

  svg {
    color: #f5c518;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;

  @media (max-width: 520px) {
    justify-content: center;
  }
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.4rem;
  border-radius: var(--global-border-radius);
  border: 1px solid ${({ $primary }) => ($primary ? 'transparent' : 'rgba(255,255,255,0.25)')};
  background: ${({ $primary }) => ($primary ? '#f5f5f5' : 'rgba(20, 20, 24, 0.7)')};
  color: ${({ $primary }) => ($primary ? '#101014' : '#fff')};
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.15s ease, background-color 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    background: ${({ $primary }) => ($primary ? '#fff' : 'var(--primary-accent)')};
  }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1.75rem;
  margin-top: 1.5rem;
  align-items: start;

  @media (max-width: 1000px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Card = styled.section`
  background: var(--global-secondary-bg);
  border: 1px solid var(--global-border);
  border-radius: calc(var(--global-border-radius) * 2);
  padding: 1.1rem 1.25rem;

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  & + & {
    margin-top: 1.25rem;
  }
`;

const Synopsis = styled.p<{ $open: boolean }>`
  margin: 0;
  line-height: 1.65;
  font-size: 0.95rem;
  white-space: pre-line;
  opacity: 0.9;
  ${({ $open }) =>
    $open
      ? ''
      : `display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;`}
`;

const TextBtn = styled.button`
  margin-top: 0.5rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-accent);
  font-weight: 700;
  cursor: pointer;
`;

const InfoList = styled.dl`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.6rem 1rem;
  margin: 0;
  font-size: 0.88rem;

  dt {
    color: var(--global-text-muted);
  }
  dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
    overflow-wrap: anywhere;
  }
`;

const Availability = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
`;

const Badge = styled.span<{ $on: boolean }>`
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  color: ${({ $on }) => ($on ? '#fff' : 'var(--global-text-muted)')};
  background: ${({ $on }) => ($on ? 'var(--primary-accent)' : 'var(--global-tertiary-bg)')};
`;

const EpGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.2rem, 1fr));
  gap: 0.45rem;
`;

const EpCell = styled(Link)`
  display: grid;
  place-items: center;
  height: 2.6rem;
  border-radius: var(--global-border-radius);
  border: 1px solid var(--global-border);
  background: var(--global-button-bg);
  color: var(--global-text);
  font-weight: 700;
  font-size: 0.85rem;
  text-decoration: none;

  &:hover {
    background: var(--primary-accent);
    color: #fff;
  }
`;

const CharRow = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(15rem, 1fr);
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;

  @media (min-width: 1000px) {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    overflow: visible;
  }
`;

const CharCard = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.5rem;
  border-radius: var(--global-border-radius);
  background: var(--global-primary-bg);
  border: 1px solid var(--global-border);

  .side {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }
  .side.right {
    flex-direction: row-reverse;
    text-align: right;
  }
  img {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    object-fit: cover;
    flex: none;
    background: var(--global-tertiary-bg);
  }
  strong {
    display: block;
    font-size: 0.8rem;
    line-height: 1.2;
  }
  small {
    color: var(--global-text-muted);
    font-size: 0.7rem;
  }
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.85);

  .box {
    position: relative;
    width: min(60rem, 100%);
    aspect-ratio: 16 / 9;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: var(--global-border-radius);
  }
  button {
    position: absolute;
    top: -2.75rem;
    right: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: var(--global-border-radius);
    background: #222;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  }
`;

const Shimmer = styled.div<{ $h: string }>`
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

const formatDate = (d?: { year?: number; month?: number; day?: number }) => {
  if (!d?.year) return '—';
  const date = new Date(d.year, (d.month ?? 1) - 1, d.day ?? 1);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: d.month ? 'short' : undefined,
    day: d.day ? 'numeric' : undefined,
  });
};

export default function Details() {
  const { animeId = '' } = useParams();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderEpisodes[] | null>(null);
  const [open, setOpen] = useState(false);
  const [trailer, setTrailer] = useState(false);

  useEffect(() => {
    let alive = true;
    setAnime(null);
    setError(null);
    setOpen(false);
    fetchAnimeData(animeId)
      .then((a) => alive && setAnime(a as Anime))
      .catch((e) => alive && setError(e?.message || 'Could not load this anime.'));
    return () => {
      alive = false;
    };
  }, [animeId]);

  useEffect(() => {
    let alive = true;
    setProviders(null);
    fetchProviderEpisodes(animeId)
      .then((p) => alive && setProviders(p))
      .catch(() => alive && setProviders([]));
    return () => {
      alive = false;
    };
  }, [animeId]);

  const title = anime?.title?.english || anime?.title?.romaji || 'Anime';

  useEffect(() => {
    document.title = anime ? `${title} | AniMallu` : 'AniMallu';
  }, [anime, title]);

  const subEpisodes = useMemo(
    () => providers?.find((p) => p.sub.length)?.sub ?? [],
    [providers],
  );
  const dubEpisodes = useMemo(
    () => providers?.find((p) => p.dub.length)?.dub ?? [],
    [providers],
  );
  const gridEpisodes = subEpisodes.length ? subEpisodes : dubEpisodes;

  const last = getLastWatchedNumber(animeId);
  const watchUrl = `/watch/${animeId}${last ? `?ep=${last}` : ''}`;

  if (error) {
    return (
      <Page>
        <Card>
          <h2>Couldn’t load this anime</h2>
          <p>{error}</p>
          <ActionBtn as={Link as any} to='/home' $primary>
            Back home
          </ActionBtn>
        </Card>
      </Page>
    );
  }

  if (!anime) {
    return (
      <Page>
        <Shimmer $h='26rem' />
        <div style={{ height: '1.5rem' }} />
        <Shimmer $h='14rem' />
      </Page>
    );
  }

  const next = (anime as any).nextAiringEpisode;
  const youtubeId = anime.trailer?.site === 'youtube' ? anime.trailer.id : null;
  const relations = toShelfItems(
    (anime.relations ?? []).filter((r: any) => ANIME_FORMATS.includes(r.type)),
  );
  const recommendations = toShelfItems(
    (anime.recommendations ?? []).filter((r: any) => ANIME_FORMATS.includes(r.type)),
  );

  return (
    <Page>
      <Hero $banner={anime.cover || anime.image}>
        <HeroInner>
          <Poster src={anime.image} alt={`${title} poster`} />
          <div>
            <Title>{title}</Title>
            {anime.title.native && <Native>{anime.title.native}</Native>}
            <Chips>
              {anime.rating ? (
                <Chip>
                  <FaStar /> {(anime.rating / 10).toFixed(1)}
                </Chip>
              ) : null}
              {anime.type && <Chip $accent>{anime.type.replace('_', ' ')}</Chip>}
              {anime.status && <Chip>{anime.status}</Chip>}
              {anime.releaseDate && (
                <Chip>
                  <FaCalendarAlt /> {anime.releaseDate}
                </Chip>
              )}
              {anime.duration ? (
                <Chip>
                  <FaClock /> {anime.duration} min
                </Chip>
              ) : null}
              {anime.totalEpisodes ? <Chip>{anime.totalEpisodes} episodes</Chip> : null}
              {(anime.genres ?? []).map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </Chips>
            <Actions>
              <ActionBtn as={Link as any} to={watchUrl} $primary>
                <FaPlay /> {last ? `Continue EP ${last}` : 'Watch now'}
              </ActionBtn>
              {youtubeId && (
                <ActionBtn onClick={() => setTrailer(true)}>
                  <FaYoutube /> Trailer
                </ActionBtn>
              )}
            </Actions>
          </div>
        </HeroInner>
      </Hero>

      <Body>
        <div>
          <Card>
            <h2>Synopsis</h2>
            <Synopsis $open={open}>{anime.description || 'No synopsis available.'}</Synopsis>
            {(anime.description?.length ?? 0) > 350 && (
              <TextBtn onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</TextBtn>
            )}
          </Card>

          <Card>
            <h2>Episodes</h2>
            {providers === null ? (
              <Shimmer $h='5rem' />
            ) : gridEpisodes.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--global-text-muted)' }}>
                No streaming sources found yet
                {anime.status === 'Not yet aired' ? ' — this title hasn’t aired.' : '.'}
              </p>
            ) : (
              <>
                <Availability>
                  <Badge $on={subEpisodes.length > 0}>SUB · {subEpisodes.length}</Badge>
                  <Badge $on={dubEpisodes.length > 0}>DUB · {dubEpisodes.length}</Badge>
                  <Badge $on>{providers.length} sources</Badge>
                </Availability>
                <EpGrid>
                  {gridEpisodes.slice(0, 120).map((ep) => (
                    <EpCell
                      key={ep.id}
                      to={`/watch/${animeId}?ep=${ep.number}`}
                      title={ep.title || `Episode ${ep.number}`}
                    >
                      {ep.number}
                    </EpCell>
                  ))}
                </EpGrid>
                {gridEpisodes.length > 120 && (
                  <TextBtn as={Link as any} to={watchUrl}>
                    View all {gridEpisodes.length} episodes
                  </TextBtn>
                )}
              </>
            )}
          </Card>

          {(anime.characters ?? []).length > 0 && (
            <Card>
              <h2>Characters</h2>
              <CharRow>
                {anime.characters.slice(0, 12).map((c: any) => {
                  const va = c.voiceActors?.[0];
                  return (
                    <CharCard key={c.id}>
                      <div className='side'>
                        <img src={c.image} alt={c.name.userPreferred} loading='lazy' />
                        <div>
                          <strong>{c.name.userPreferred}</strong>
                          <small>{c.role}</small>
                        </div>
                      </div>
                      {va && (
                        <div className='side right'>
                          <img src={va.image} alt={va.name.userPreferred} loading='lazy' />
                          <div>
                            <strong>{va.name.userPreferred}</strong>
                            <small>{va.language}</small>
                          </div>
                        </div>
                      )}
                    </CharCard>
                  );
                })}
              </CharRow>
            </Card>
          )}
        </div>

        <aside>
          <Card>
            <h2>Information</h2>
            <InfoList>
              <dt>Format</dt>
              <dd>{anime.type?.replace('_', ' ') || '—'}</dd>
              <dt>Status</dt>
              <dd>{anime.status || '—'}</dd>
              <dt>Episodes</dt>
              <dd>{anime.totalEpisodes ?? '—'}</dd>
              <dt>Duration</dt>
              <dd>{anime.duration ? `${anime.duration} min` : '—'}</dd>
              <dt>Season</dt>
              <dd>
                {anime.season
                  ? `${anime.season.charAt(0)}${anime.season.slice(1).toLowerCase()} ${anime.releaseDate ?? ''}`
                  : '—'}
              </dd>
              <dt>Aired</dt>
              <dd>{formatDate(anime.startDate)}</dd>
              <dt>Ended</dt>
              <dd>{anime.status === 'Ongoing' ? 'Airing' : formatDate(anime.endDate)}</dd>
              <dt>Studio</dt>
              <dd>{(anime.studios ?? []).join(', ') || '—'}</dd>
              <dt>Country</dt>
              <dd>{anime.countryOfOrigin || '—'}</dd>
              {next && (
                <>
                  <dt>Next episode</dt>
                  <dd>
                    EP {next.episode} ·{' '}
                    {new Date(next.airingTime * 1000).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </dd>
                </>
              )}
              {providers && providers.length > 0 && (
                <>
                  <dt>Sources</dt>
                  <dd>{providers.map((p) => providerLabel(p.provider)).join(', ')}</dd>
                </>
              )}
            </InfoList>
          </Card>
        </aside>
      </Body>

      <Shelf title='Related' items={relations} />
      <Shelf title='You might also like' items={recommendations} />

      {trailer && youtubeId && (
        <Modal onClick={() => setTrailer(false)}>
          <div className='box' onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setTrailer(false)}>
              <FaTimes /> Close
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
              title={`${title} trailer`}
              allow='autoplay; encrypted-media; picture-in-picture'
              allowFullScreen
            />
          </div>
        </Modal>
      )}
    </Page>
  );
}
