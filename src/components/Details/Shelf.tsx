import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { FaStar } from 'react-icons/fa';

export interface ShelfItem {
  id: string;
  title: string;
  image: string;
  meta?: string;
  rating?: number | null;
}

const Section = styled.section`
  margin-top: 2rem;

  h2 {
    margin: 0 0 0.9rem;
    font-size: 1.15rem;
  }
`;

const Row = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 9.5rem;
  gap: 0.9rem;
  overflow-x: auto;
  padding-bottom: 0.75rem;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;

  @media (max-width: 700px) {
    grid-auto-columns: 7.25rem;
    gap: 0.65rem;
  }
`;

const Card = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  text-decoration: none;
  color: var(--global-text);
  scroll-snap-align: start;

  .poster {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: var(--global-border-radius);
    overflow: hidden;
    background: var(--global-secondary-bg);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.25s ease;
  }
  &:hover img {
    transform: scale(1.05);
  }
  .rating {
    position: absolute;
    top: 0.4rem;
    left: 0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 0.3rem;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
  }
  .rating svg {
    color: #f5c518;
  }
  strong {
    font-size: 0.85rem;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  small {
    color: var(--global-text-muted);
    font-size: 0.72rem;
  }
  &:hover strong {
    color: var(--primary-accent);
  }
`;

export default function Shelf({
  title,
  items,
}: {
  title: string;
  items: ShelfItem[];
}) {
  if (!items.length) return null;
  return (
    <Section>
      <h2>{title}</h2>
      <Row>
        {items.map((item) => (
          <Card key={item.id} to={`/anime/${item.id}`} title={item.title}>
            <div className='poster'>
              <img src={item.image} alt={item.title} loading='lazy' />
              {item.rating ? (
                <span className='rating'>
                  <FaStar /> {(item.rating / 10).toFixed(1)}
                </span>
              ) : null}
            </div>
            <strong>{item.title}</strong>
            {item.meta && <small>{item.meta}</small>}
          </Card>
        ))}
      </Row>
    </Section>
  );
}

// Build shelf items from the `relations` / `recommendations` arrays on Anime.
export const toShelfItems = (list: any[] = []): ShelfItem[] =>
  list
    .filter((x) => x && x.id && x.image)
    .map((x) => ({
      id: String(x.id),
      title: x.title?.english || x.title?.romaji || x.title?.userPreferred || 'Untitled',
      image: x.image,
      rating: x.rating,
      meta: [x.relationType ? String(x.relationType).replace(/_/g, ' ') : null, x.type]
        .filter(Boolean)
        .join(' · '),
    }));
