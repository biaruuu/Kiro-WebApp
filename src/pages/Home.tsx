import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { HomeCarousel } from '../components/Home/HomeCarousel';
import { EpisodeCard } from '../components/Home/EpisodeCard';
import {
  LatestEpisodes,
  type RecentAnime,
} from '../components/Home/LatestEpisodes';
import { HomeSideBar } from '../components/Home/HomeSideBar';
import { Link } from 'react-router-dom';
import { FaRegStar } from 'react-icons/fa';
import {
  fetchPopularAnime,
  fetchRecentEpisodes,
  fetchTopAiringAnime,
  fetchTopAnime,
  fetchTrendingAnime,
  fetchUpcomingSeasons,
} from '../hooks/useApi';
import type { Anime } from '../hooks/interface';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const Page = styled.div`
  display: flex;
  flex-direction: column;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 2.5rem;
  max-width: 105rem;
  width: 100%;
  margin: 0 auto;
  padding-top: 1.75rem;

  @media (min-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) 25rem;
    align-items: start;
  }
  @media (min-width: 1600px) {
    grid-template-columns: minmax(0, 1fr) 29rem;
  }
`;

const Main = styled.div`
  min-width: 0;
`;

const Side = styled.aside`
  min-width: 0;
`;

const Browse = styled.section`
  max-width: 105rem;
  width: 100%;
  margin: 0.5rem auto 0;
`;

const BrowseHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;

  h2 {
    margin: 0;
    font-size: clamp(1.45rem, 4.6vw, 1.9rem);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
`;

const Tabs = styled.div`
  display: inline-flex;
  gap: 0.4rem;
  padding: 0.3rem;
  border-radius: 999px;
  border: 1.5px solid var(--global-border);
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 0.65rem 1.2rem;
  border: none;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#0b0b10' : 'var(--global-text)')};
  background: ${({ $active }) => ($active ? '#b7a9ff' : 'transparent')};
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  @media (max-width: 420px) {
    padding: 0.55rem 0.85rem;
    font-size: 0.85rem;
  }
`;

const PosterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4rem 0.9rem;

  @media (min-width: 700px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.8rem 1.2rem;
  }
  @media (min-width: 1000px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  @media (min-width: 1500px) {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
`;

const Poster = styled(Link)<{ $color?: string }>`
  display: block;
  min-width: 0;
  text-decoration: none;
  color: var(--global-text);

  .art {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: 1rem;
    overflow: hidden;
    background: var(--global-secondary-bg);
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition:
      transform 0.35s ease,
      filter 0.25s ease;
  }
  .art::after {
    content: '';
    position: absolute;
    inset: 55% 0 0;
    background: linear-gradient(to top, rgba(8, 8, 12, 0.9), transparent);
  }
  &:hover .art img {
    transform: scale(1.06);
    filter: brightness(0.65);
  }
  .tags {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    color: #fff;
    font-size: 0.95rem;
    font-weight: 700;
  }
  .tags span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .name {
    margin: 0.75rem 0 0.2rem;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 0.2s ease;
  }
  .sub {
    margin: 0;
    font-size: 0.88rem;
    color: var(--global-text-muted);
  }
  &:hover .name {
    color: ${({ $color }) => $color || 'var(--primary-accent)'};
  }
`;

const PosterSkeleton = styled.div`
  aspect-ratio: 2 / 3.5;
  border-radius: 1rem;
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

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1.25rem auto 0;
  max-width: 105rem;
  padding: 0.9rem 1.1rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(244, 67, 54, 0.4);
  background: rgba(244, 67, 54, 0.1);
  color: var(--global-text);
  font-size: 0.95rem;

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.6rem;
    background: var(--primary-accent);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
`;

// ---------------------------------------------------------------------------
type TabKey = 'trending' | 'popular' | 'topRated';

interface HomeData {
  trending: Anime[];
  popular: Anime[];
  topRated: Anime[];
  topAiring: Anime[];
  upcoming: Anime[];
  recent: RecentAnime[];
}

const EMPTY: HomeData = {
  trending: [],
  popular: [],
  topRated: [],
  topAiring: [],
  upcoming: [],
  recent: [],
};

const readTab = (): TabKey => {
  try {
    const saved = JSON.parse(localStorage.getItem('home tab') || 'null');
    if (
      saved &&
      Date.now() - saved.timestamp < 24 * 3600 * 1000 &&
      ['trending', 'popular', 'topRated'].includes(saved.tab)
    ) {
      return saved.tab;
    }
  } catch {
    /* ignore */
  }
  return 'trending';
};

const Home = () => {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TabKey>(readTab);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const count = window.innerWidth > 500 ? 24 : 15;
    // allSettled: one failing list never blanks the whole page.
    const results = await Promise.allSettled([
      fetchTrendingAnime(1, 24),
      fetchPopularAnime(1, count),
      fetchTopAnime(1, count),
      fetchTopAiringAnime(1, 10),
      fetchUpcomingSeasons(1, 10),
      fetchRecentEpisodes(),
    ]);
    if (results.every((r) => r.status === 'rejected')) setFailed(true);

    const list = (i: number): Anime[] => {
      const r = results[i];
      return r.status === 'fulfilled' && Array.isArray((r.value as any)?.results)
        ? (r.value as any).results
        : [];
    };
    setData({
      trending: list(0),
      popular: list(1),
      topRated: list(2),
      topAiring: list(3),
      upcoming: list(4),
      recent: list(5) as RecentAnime[],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, attempt]);

  useEffect(() => {
    document.title = 'AniMallu | Watch HD Anime for Free';
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'home tab',
        JSON.stringify({ tab, timestamp: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }, [tab]);

  const browse =
    tab === 'trending' ? data.trending : tab === 'popular' ? data.popular : data.topRated;

  return (
    <Page>
      <HomeCarousel data={data.trending} loading={loading} />

      {failed && (
        <ErrorBanner>
          <span>Couldn’t load anime right now. Check your connection and try again.</span>
          <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </ErrorBanner>
      )}

      <Body>
        <Main>
          <EpisodeCard />
          <LatestEpisodes items={data.recent} loading={loading} />
        </Main>
        <Side>
          <HomeSideBar title='Top Airing' animeData={data.topAiring} loading={loading} />
          <HomeSideBar title='Upcoming' animeData={data.upcoming} loading={loading} />
        </Side>
      </Body>

      <Browse>
        <BrowseHeader>
          <h2>Browse</h2>
          <Tabs role='tablist'>
            {(
              [
                ['trending', 'Trending'],
                ['popular', 'Popular'],
                ['topRated', 'Top Rated'],
              ] as [TabKey, string][]
            ).map(([key, label]) => (
              <Tab
                key={key}
                role='tab'
                aria-selected={tab === key}
                $active={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </Tab>
            ))}
          </Tabs>
        </BrowseHeader>
        <PosterGrid>
          {loading
            ? Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} />)
            : browse.map((a) => {
                const name = a.title.english || a.title.romaji || 'Untitled';
                return (
                  <Poster
                    key={a.id}
                    to={`/anime/${a.id}`}
                    $color={a.color || undefined}
                    title={name}
                  >
                    <div className='art'>
                      <img src={a.image} alt={name} loading='lazy' />
                      <div className='tags'>
                        <span>{a.type ? a.type.replace('_', ' ') : ''}</span>
                        {a.rating ? (
                          <span>
                            <FaRegStar /> {a.rating}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className='name'>{name}</p>
                    <p className='sub'>
                      {[a.releaseDate, a.totalEpisodes ? `${a.totalEpisodes} eps` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </Poster>
                );
              })}
        </PosterGrid>
      </Browse>
    </Page>
  );
};

export default Home;
