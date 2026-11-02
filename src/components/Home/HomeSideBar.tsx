import { useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronRight,
  FaClosedCaptioning,
  FaMicrophone,
  FaRegCalendarAlt,
  FaRegStar,
} from 'react-icons/fa';
import type { Anime } from '../../hooks/interface';
import { useAudioCounts } from '../../hooks/extras';

const Panel = styled.section`
  border: 1px solid var(--global-border);
  border-radius: 1rem;
  padding: 0.1rem 0.6rem 0.6rem;
  margin-bottom: 1.1rem;
`;

const PanelHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.85rem 0.35rem;
  border: none;
  background: none;
  color: var(--global-text);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;

  svg {
    font-size: 0.7rem;
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(90deg);
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`;

const Item = styled(Link)<{ $bg?: string }>`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0.7rem;
  min-height: 5.2rem;
  border-radius: 0.8rem;
  overflow: hidden;
  text-decoration: none;
  color: var(--global-text);
  background: var(--global-secondary-bg);
  isolation: isolate;

  /* faded banner artwork on the right-hand side of the row */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background: ${({ $bg }) => ($bg ? `url(${$bg})` : 'none')} right center / cover no-repeat;
    opacity: 0.5;
    filter: grayscale(0.35);
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      to right,
      var(--global-secondary-bg) 35%,
      color-mix(in srgb, var(--global-secondary-bg) 60%, transparent) 70%,
      transparent
    );
  }

  .thumb {
    flex: none;
    width: 3.6rem;
    background: var(--global-tertiary-bg);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem 0.5rem 0;
  }
  .title {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    font-size: 0.86rem;
    font-weight: 500;
    line-height: 1.35;
  }
  .title span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  @media (min-width: 700px) {
    min-height: 5.8rem;
    .thumb {
      width: 4rem;
    }
    .title {
      font-size: 0.95rem;
    }
  }
`;

const Dot = styled.i<{ $color: string }>`
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  margin-top: 0.4rem;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.24rem 0.38rem;
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--global-tertiary-bg) 85%, transparent);
  color: var(--global-text-muted);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  svg {
    font-size: 0.72rem;
  }
`;

const MoreBar = styled.button`
  display: grid;
  place-items: center;
  width: 100%;
  height: 2.2rem;
  margin-top: 0.45rem;
  border: none;
  border-radius: 0.7rem;
  background: var(--global-secondary-bg);
  color: var(--global-text-muted);
  font-size: 0.8rem;
  cursor: pointer;

  svg {
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
  &:hover {
    color: var(--global-text);
  }
`;

const Empty = styled.p`
  margin: 0;
  padding: 0.8rem 0.35rem 0.4rem;
  font-size: 0.9rem;
  color: var(--global-text-muted);
`;

const Row = ({ anime }: { anime: Anime }) => {
  const name = anime.title.english || anime.title.romaji || 'Untitled';
  const aired = anime.status !== 'Not yet aired';
  const counts = useAudioCounts(anime.id, aired);
  const sub = counts?.sub || anime.currentEpisode || anime.totalEpisodes || 0;
  const dub = counts?.dub || 0;
  return (
    <Item
      to={`/anime/${anime.id}`}
      $bg={anime.cover && anime.cover !== anime.image ? anime.cover : anime.image}
      title={name}
    >
      <div className='thumb'>
        <img src={anime.image} alt={name} loading='lazy' />
      </div>
      <div className='body'>
        <div className='title'>
          <Dot $color={dotColor(anime.status)} />
          <span>{name}</span>
        </div>
        <div className='chips'>
          {anime.type && <Chip>{anime.type.replace('_', ' ')}</Chip>}
          {anime.releaseDate ? (
            <Chip>
              <FaRegCalendarAlt /> {anime.releaseDate}
            </Chip>
          ) : null}
          {sub ? (
            <Chip>
              <FaClosedCaptioning /> {sub}
            </Chip>
          ) : null}
          {dub ? (
            <Chip>
              <FaMicrophone /> {dub}
            </Chip>
          ) : null}
          {anime.rating ? (
            <Chip>
              <FaRegStar /> {anime.rating}
            </Chip>
          ) : null}
        </div>
      </div>
    </Item>
  );
};

const dotColor = (status?: string) => {
  switch (status) {
    case 'Ongoing':
      return 'var(--ongoing-dot-color)';
    case 'Completed':
      return 'var(--completed-indicator-color)';
    case 'Cancelled':
      return 'var(--cancelled-indicator-color)';
    case 'Not yet aired':
      return 'var(--not-yet-aired-indicator-color)';
    default:
      return 'var(--default-indicator-color)';
  }
};

const PREVIEW = 5;

export const HomeSideBar = ({
  title,
  animeData,
  loading = false,
  defaultOpen = true,
}: {
  title: string;
  animeData: Anime[];
  loading?: boolean;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? animeData : animeData.slice(0, PREVIEW);

  return (
    <Panel>
      <PanelHeader aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <FaChevronRight /> {title}
      </PanelHeader>

      {open && (
        <>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : animeData.length === 0 ? (
            <Empty>Nothing to show right now.</Empty>
          ) : (
            <List>
              {shown.map((anime) => (
                <Row key={anime.id} anime={anime} />
              ))}
            </List>
          )}

          {animeData.length > PREVIEW && (
            <MoreBar
              aria-expanded={expanded}
              aria-label={expanded ? 'Show fewer' : 'Show more'}
              onClick={() => setExpanded((v) => !v)}
            >
              <FaChevronDown />
            </MoreBar>
          )}
        </>
      )}
    </Panel>
  );
};
