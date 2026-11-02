import styled, { css, keyframes } from 'styled-components';
import { useMyList, type ListItem } from '../../hooks/watchlist';
import type { Anime } from '../../hooks/interface';

const pop = keyframes`
  0% { transform: scale(1); }
  40% { transform: scale(1.22); }
  100% { transform: scale(1); }
`;

const Btn = styled.button<{ $on: boolean; $variant: 'overlay' | 'hero' }>`
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  cursor: pointer;
  color: #fff;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;

  ${({ $variant }) =>
    $variant === 'hero'
      ? css`
          flex: none;
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 0.5rem;
          background: rgba(58, 58, 66, 0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          &:hover {
            background: rgba(86, 86, 96, 0.85);
          }
        `
      : css`
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          z-index: 3;
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 50%;
          background: rgba(20, 20, 27, 0.6);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          &:hover {
            background: rgba(20, 20, 27, 0.85);
          }
        `}

  ${({ $on }) =>
    $on &&
    css`
      background: #b7a9ff !important;
      color: #0b0b10;
      animation: ${pop} 0.35s ease;
    `}

  svg {
    width: 55%;
    height: 55%;
    overflow: visible;
  }
  .plus {
    transform-origin: 50% 50%;
    transition:
      transform 0.3s ease,
      opacity 0.2s ease;
    transform: ${({ $on }) => ($on ? 'rotate(90deg) scale(0.2)' : 'none')};
    opacity: ${({ $on }) => ($on ? 0 : 1)};
  }
  .check {
    stroke-dasharray: 22;
    stroke-dashoffset: ${({ $on }) => ($on ? 0 : 22)};
    transition: stroke-dashoffset 0.35s ease ${({ $on }) => ($on ? '0.12s' : '0s')};
  }
`;

type Source = Pick<Anime, 'id' | 'title' | 'image'> & {
  type?: string;
  releaseDate?: number | string | null;
};

export const ListButton = ({
  anime,
  variant = 'overlay',
}: {
  anime: Source;
  variant?: 'overlay' | 'hero';
}) => {
  const { has, toggle } = useMyList();
  const id = String(anime.id);
  const on = has(id);
  const title = anime.title?.english || anime.title?.romaji || 'Untitled';

  const item: Omit<ListItem, 'addedAt'> = {
    id,
    title,
    image: anime.image,
    type: anime.type,
    year: anime.releaseDate ?? null,
  };

  return (
    <Btn
      type='button'
      $on={on}
      $variant={variant}
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from My List` : `Add ${title} to My List`}
      title={on ? 'In My List' : 'Add to My List'}
      onClick={(e) => {
        // lives inside a <Link>: don't navigate
        e.preventDefault();
        e.stopPropagation();
        toggle(item);
      }}
    >
      <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round'>
        <g className='plus'>
          <path d='M12 5v14M5 12h14' />
        </g>
        <path className='check' d='M5 12.5l4.5 4.5L19 7.5' />
      </svg>
    </Btn>
  );
};
