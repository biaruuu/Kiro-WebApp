import { useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronRight,
  FaClosedCaptioning,
  FaRegCalendarAlt,
  FaRegStar,
} from 'react-icons/fa';
import type { Anime } from '../../hooks/interface';

const Panel = styled.section`
  border: 1.5px solid var(--global-border);
  border-radius: 1.4rem;
  padding: 0.35rem 0.9rem 0.9rem;
  margin-bottom: 1.5rem;
  background: transparent;
`;

const PanelHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 1.1rem 0.4rem;
  border: none;
  background: none;
  color: var(--global-text);
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;

  svg {
    font-size: 1rem;
    transition: transform 0.25s ease;
  }
  &[aria-expanded='true'] svg {
    transform: rotate(90deg);
  }

  @media (max-width: 500px) {
    font-size: 1.3rem;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

const Item = styled(Link)<{ $bg?: string }>`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 1rem;
  min-height: 6rem;
  border-radius: 1rem;
  overflow: hidden;
  text-decoration: none;
  color: var(--global-text);
  background: var(--global-secondary-bg);
  isolation: isolate;
  transition: transform 0.15s ease;

  /* faded banner artwork on the right-hand side of the row */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background: ${({ $bg }) => ($bg ? `url(${$bg})` : 'none')} right center / cover no-repeat;
    opacity: 0.55;
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      to right,
      var(--global-secondary-bg) 38%,
      color-mix(in srgb, var(--global-secondary-bg) 55%, transparent) 70%,
      transparent
    );
  }
  &:hover {
    transform: translateX(2px);
  }

  .thumb {
    flex: none;
    width: 4.9rem;
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
    gap: 0.6rem;
    padding: 0.7rem 0.9rem 0.7rem 0;
  }
  .title {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    font-size: 1.12rem;
    font-weight: 600;
    line-height: 1.3;
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
    gap: 0.4rem;
  }
`;

const Dot = styled.i<{ $color: string }>`
  flex: none;
  width: 0.7rem;
  height: 0.7rem;
  margin-top: 0.4rem;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--global-tertiary-bg) 85%, transparent);
  color: var(--global-text-muted);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;

  svg {
    font-size: 0.85rem;
  }
`;

const MoreBar = styled.button`
  display: grid;
  place-items: center;
  width: 100%;
  height: 2.9rem;
  margin-top: 0.7rem;
  border: none;
  border-radius: 0.9rem;
  background: var(--global-secondary-bg);
  color: var(--global-text-muted);
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
  padding: 1rem 0.4rem 0.5rem;
  color: var(--global-text-muted);
`;

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
              {shown.map((anime) => {
                const name = anime.title.english || anime.title.romaji || 'Untitled';
                const episodes = anime.currentEpisode || anime.totalEpisodes;
                return (
                  <Item
                    key={anime.id}
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
                        {episodes ? (
                          <Chip>
                            <FaClosedCaptioning /> {episodes}
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
              })}
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
