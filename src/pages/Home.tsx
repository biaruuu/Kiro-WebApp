import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { HomeCarousel } from '../components/Home/HomeCarousel';
import { EpisodeCard } from '../components/Home/EpisodeCard';
import {
  LatestEpisodes,
  type RecentAnime,
} from '../components/Home/LatestEpisodes';
import { HomeSideBar } from '../components/Home/HomeSideBar';
import {
  fetchRecentEpisodes,
  fetchTopAiringAnime,
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
  gap: 0 2rem;
  max-width: 105rem;
  width: 100%;
  margin: 0 auto;
  padding-top: 1.25rem;

  @media (min-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) 24rem;
    align-items: start;
  }
  @media (min-width: 1600px) {
    grid-template-columns: minmax(0, 1fr) 27rem;
  }
`;

const Main = styled.div`
  min-width: 0;
`;

const Side = styled.aside`
  min-width: 0;
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
interface HomeData {
  trending: Anime[];
  topAiring: Anime[];
  upcoming: Anime[];
  recent: RecentAnime[];
}

const EMPTY: HomeData = { trending: [], topAiring: [], upcoming: [], recent: [] };

const Home = () => {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    // allSettled: one failing list never blanks the whole page.
    const results = await Promise.allSettled([
      fetchTrendingAnime(1, 24),
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
      topAiring: list(1),
      upcoming: list(2),
      recent: list(3) as RecentAnime[],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, attempt]);

  useEffect(() => {
    document.title = 'AniMallu | Watch HD Anime for Free';
  }, []);

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

    </Page>
  );
};

export default Home;
