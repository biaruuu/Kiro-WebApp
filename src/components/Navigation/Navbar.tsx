import React, { useRef, useEffect, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  useNavigate,
  useSearchParams,
  Link,
  useLocation,
} from 'react-router-dom';
import { DropDownSearch } from '../../index'; // Assuming this is a local component not exported through index.ts
import { fetchAdvancedSearch, type Anime } from '../..'; // Adjust the import path to point to your index.ts correctly
import { FiSun, FiMoon, FiX, FiMenu } from 'react-icons/fi';
import { GoCommandPalette } from 'react-icons/go';
import { IoIosSearch } from 'react-icons/io';

const fadeInAnimation = (color: string) => keyframes`
  from { background-color: transparent; }
  to { background-color: ${color}; }
`;

const slideDownAnimation2 = keyframes`
  0% { opacity: 0; transform: translateY(-20px); max-height: 0; }
  100% { opacity: 1; transform: translateY(0); max-height: 500px; } /* Example max-height */
`;

const StyledNavbar = styled.div<{ $isExtended?: boolean; $solid: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  text-align: center;
  margin: 0;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1.25rem 0.6rem;
  background-color: ${({ $solid }) =>
    $solid ? 'var(--global-primary-bg-tr)' : 'transparent'};
  backdrop-filter: ${({ $solid }) => ($solid ? 'blur(14px)' : 'none')};
  -webkit-backdrop-filter: ${({ $solid }) => ($solid ? 'blur(14px)' : 'none')};
  border-bottom: 1px solid
    ${({ $solid }) => ($solid ? 'var(--global-border)' : 'transparent')};
  color: ${({ $solid }) => ($solid ? 'var(--global-text)' : '#fff')};
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease;

  @media (max-width: 500px) {
    padding-left: 1rem;
    padding-right: 1rem;
  }
`;

const NavbarWrapper = styled.div`
  max-width: 105rem;
  margin: auto;
`;

const TopContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
`;

const LogoImg = styled(Link)<{ $solid: boolean }>`
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  text-decoration: none;
  color: ${({ $solid }) => ($solid ? 'var(--global-text)' : '#fff')};
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s ease;

  small {
    margin-left: 0.15rem;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0;
    vertical-align: baseline;
    opacity: 0.8;
  }
  &:hover {
    opacity: 0.85;
  }
  &:active {
    opacity: 0.7;
  }

  @media (max-width: 500px) {
    font-size: 1.4rem;
  }
`;

const InputContainer = styled.div<{ $isVisible: boolean }>`
  display: flex;
  flex: 1;
  max-width: 35rem;
  height: 1.2rem;
  align-items: center;
  padding: 0.6rem;
  border-radius: var(--global-border-radius);
  background-color: var(--global-div);
  animation: ${fadeInAnimation('var(--global-div)')} 0.1s ease-out;
  animation: ${slideDownAnimation2} 0.5s ease;

  @media (max-width: 1000px) {
    max-width: 30rem;
  }

  @media (max-width: 500px) {
    max-width: 100%;
    margin-top: 1rem;
    display: ${({ $isVisible }) => ($isVisible ? 'flex' : 'none')};
  }
`;

const RightContent = styled.div`
  gap: 0.25rem;
  display: flex;
  align-items: center;
  height: auto;
`;

const Icon = styled.div<{ $isFocused: boolean }>`
  margin: 0;
  padding: 0 0.25rem;
  color: var(--global-text);
  opacity: ${({ $isFocused }) => ($isFocused ? 1 : 0.5)};
  font-size: 1.2rem;
  transition: opacity 0.2s;
  max-height: 100%;
  display: flex;
  align-items: center;
`;

const SearchInput = styled.input`
  background: transparent;
  border: none;
  color: var(--global-text);
  display: inline-block;
  font-size: 0.85rem;
  outline: 0;
  padding: 0;
  max-height: 100%;
  display: flex;
  align-items: center;
  padding-top: 0;
  width: 100%;
  transition:
    border-color 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out;
`;

const ClearButton = styled.button<{ $query: string }>`
  background: transparent;
  border: none;
  color: var(--global-text);
  font-size: 1.2rem;
  cursor: pointer;
  opacity: ${({ $query }) => ($query ? 0.5 : 0)};
  visibility: ${({ $query }) => ($query ? 'visible' : 'hidden')};
  transition:
    color 0.2s,
    opacity 0.2s;
  max-height: 100%;
  display: flex;
  align-items: center;

  &:hover,
  &:active,
  &:focus {
    color: var(--global-text);
    opacity: 1;
  }
`;

const StyledButton = styled.button<{ $solid?: boolean }>`
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ $solid }) => ($solid ? 'var(--global-text)' : '#fff')};
  font-size: 1.4rem;
  cursor: pointer;
  opacity: 0.85;
  transition:
    opacity 0.2s ease,
    transform 0.1s ease,
    background-color 0.2s ease;

  &:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.18);
  }
  &:active {
    transform: scale(0.9);
  }
`;

const MenuBackdrop = styled.button`
  position: fixed;
  inset: 0;
  z-index: 99;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  cursor: default;
`;

const MenuPanel = styled.nav`
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 1rem;
  z-index: 101;
  width: min(18rem, calc(100vw - 2rem));
  padding: 0.5rem;
  text-align: left;
  border-radius: 1.1rem;
  border: 1px solid var(--global-border);
  background: var(--global-secondary-bg);
  color: var(--global-text);
  box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.45);
  animation: ${slideDownAnimation2} 0.2s ease;

  a,
  button {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.85rem 0.9rem;
    border: none;
    border-radius: 0.7rem;
    background: transparent;
    color: inherit;
    font-size: 1rem;
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  a:hover,
  button:hover {
    background: var(--global-tertiary-bg);
  }
  hr {
    margin: 0.4rem 0.5rem;
    border: none;
    border-top: 1px solid var(--global-border);
  }
`;

const SlashToggleBtn = styled.div<{ $isFocused: boolean }>`
  font-size: 1.2rem;
  cursor: pointer;
  opacity: ${({ $isFocused }) => ($isFocused ? 1 : 0.5)};

  &:hover,
  &:active,
  &:focus {
    opacity: 1;
  }

  @media (max-width: 1000px) {
    display: none;
  }
`;

const detectUserTheme = () => {
  if (
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return true;
  }
  return false;
};

const saveThemePreference = (isDarkMode: boolean) => {
  localStorage.setItem('themePreference', isDarkMode ? 'dark' : 'light');
};

const getInitialThemePreference = () => {
  const storedThemePreference = localStorage.getItem('themePreference');

  if (storedThemePreference) {
    return storedThemePreference === 'dark';
  }

  return detectUserTheme();
};

export const Navbar = () => {
  const [isPaddingExtended, setIsPaddingExtended] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [inputContainerWidth, setInputContainerWidth] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const navbarRef = useRef(null);
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for the dropdown container
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const debounceTimeout = useRef<Timer | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState({
    isSearchFocused: false,
    searchQuery: searchParams.get('query') || '',
    isDropdownOpen: false,
  });
  const [isInputVisible, setIsInputVisible] = useState(false); // Default to false
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 500);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const isHome = location.pathname === '/' || location.pathname === '/home';
  // Transparent over the home hero; solid everywhere else / once scrolled.
  const solid =
    !isHome || scrolled || menuOpen || isInputVisible || search.isDropdownOpen;
  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) return;

    try {
      const fetchedData = await fetchAdvancedSearch(query, 1, 5); // Fetch first 5 results for the dropdown
      const formattedResults = fetchedData.results.map((anime: Anime) => ({
        id: anime.id, // Make sure to include the ID field
        title: anime.title,
        image: anime.image,
        type: anime.type,
        totalEpisodes: anime.totalEpisodes,
        rating: anime.rating,
      }));
      setSearchResults(formattedResults);
    } catch (error) {
      console.error('Failed to fetch search results:', error);
      setSearchResults([]);
    }
  };

  const handleCloseDropdown = () => {
    setSearch((prevState) => ({
      ...prevState,
      isDropdownOpen: false,
    }));
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node)
    ) {
      handleCloseDropdown();
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(getInitialThemePreference());

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
  }, [isDarkMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === '/' && inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();
        setSearch((prevState) => ({
          ...prevState,
          isSearchFocused: true,
        }));
      } else if (e.key === 'Escape' && inputRef.current) {
        inputRef.current.blur();
        setSearch((prevState) => ({
          ...prevState,
          isSearchFocused: false,
        }));
        handleCloseDropdown(); // Close dropdown on Escape key
      } else if (e.shiftKey && e.key.toLowerCase() === 'd') {
        if (document.activeElement !== inputRef.current) {
          e.preventDefault();
          toggleTheme();
        }
      }
    },
    [search, isDarkMode],
  );

  useEffect(() => {
    const listener = handleKeyDown as EventListener;
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    setSearch({ ...search, searchQuery: searchParams.get('query') || '' });
  }, [searchParams]);

  const navigateWithQuery = useCallback(
    (value: string) => {
      if (location.pathname == '/search') {
        const params = new URLSearchParams();

        params.set('query', value);
        setSearchParams(params, { replace: true });
      } else {
        navigate(value ? `/search?query=${value}` : '/search');
      }
    },
    [navigate],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch({ ...search, searchQuery: newValue });

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(() => {
      fetchSearchResults(newValue);
      setSearch((prevState) => ({
        ...prevState,
        isDropdownOpen: true,
      }));
    }, 300);
  };

  const handleKeyDownOnInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent default form submission behavior
      if (selectedIndex !== null && searchResults[selectedIndex]) {
        // Navigate to the selected search result if it exists
        const animeId = searchResults[selectedIndex].id;
        navigate(`/anime/${animeId}`);
        handleCloseDropdown();
      } else {
        // Fallback to navigating with the search query if the selected index is not in searchResults
        navigateWithQuery(search.searchQuery);
      }
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      setSearch((prevState) => ({
        ...prevState,
        isDropdownOpen: false,
      }));
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }
  };

  useEffect(() => {
    // Function to update the width
    const updateWidth = () => {
      if (inputContainerRef.current) {
        setInputContainerWidth(inputContainerRef.current.offsetWidth);
      }
    };

    // Update width on mount
    updateWidth();

    // Add event listener for window resize
    window.addEventListener('resize', updateWidth);

    // Cleanup function to remove the event listener
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    // This effect runs when the location.pathname changes or enter is pressed (Hide the InputContainer)
    if (isMobileView) {
      setIsInputVisible(false);
    }
  }, [location.pathname, isMobileView]);

  const handleClearSearch = () => {
    setSearch((prevState) => ({
      ...prevState,
      searchQuery: '',
    }));
    setSearchResults([]);
    setSearch((prevState) => ({
      ...prevState,
      isDropdownOpen: false, // Close dropdown when search is cleared
    }));
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const toggleTheme = () => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode);
    saveThemePreference(newIsDarkMode);
  };
  useEffect(() => {
    function handleResize() {
      setIsMobileView(window.innerWidth < 500);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  //navigate to profile
  const navigateToProfile = () => {
    // Check if the current location's pathname is not '/profile' before navigating
    if (location.pathname !== '/profile') {
      navigate('/profile');
    }
  };

  return (
    <>
      <StyledNavbar $isExtended={isPaddingExtended} $solid={solid} ref={navbarRef}>
        <NavbarWrapper>
          <TopContainer>
            <LogoImg
              title='AniMallu'
              to='/home'
              $solid={solid}
              onClick={() => window.scrollTo(0, 0)}
            >
              AniMallu
            </LogoImg>

            {/* Render InputContainer within the navbar for screens larger than 500px */}
            {!isMobileView && (
              <InputContainer
                ref={inputContainerRef}
                $isVisible={isInputVisible}
              >
                <Icon $isFocused={search.isSearchFocused}>
                  <IoIosSearch />
                </Icon>
                <SearchInput
                  type='text'
                  placeholder='Search Anime'
                  value={search.searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDownOnInput}
                  onFocus={() => {
                    setSearch((prevState) => ({
                      ...prevState,
                      isDropdownOpen: true,
                      isSearchFocused: true,
                    }));
                  }}
                  ref={inputRef}
                  aria-label='Search Anime'
                />
                <DropDownSearch
                  searchResults={searchResults}
                  onClose={handleCloseDropdown}
                  isVisible={search.isDropdownOpen}
                  selectedIndex={selectedIndex}
                  setSelectedIndex={setSelectedIndex}
                  searchQuery={search.searchQuery}
                  containerWidth={inputContainerWidth}
                />

                <ClearButton
                  $query={search.searchQuery}
                  onClick={handleClearSearch}
                  aria-label='Clear Search'
                >
                  <FiX />
                </ClearButton>
                <Icon $isFocused={search.isSearchFocused}>
                  <GoCommandPalette />
                </Icon>
              </InputContainer>
            )}
            <RightContent>
              {isMobileView && (
                <StyledButton
                  $solid={solid}
                  onClick={() => {
                    setIsInputVisible((prev) => !prev);
                    setIsPaddingExtended((prev) => !prev); // Toggle padding extension when toggling input visibility
                  }}
                  aria-label='Toggle Search Input'
                >
                  <IoIosSearch />
                </StyledButton>
              )}
              <StyledButton
                $solid={solid}
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <FiX /> : <FiMenu />}
              </StyledButton>
            </RightContent>
          </TopContainer>

          {isMobileView && isInputVisible && (
            <InputContainer $isVisible={isInputVisible}>
              <Icon $isFocused={search.isSearchFocused}>
                <IoIosSearch />
              </Icon>
              <SearchInput
                type='text'
                placeholder='Search Anime'
                value={search.searchQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDownOnInput}
                onFocus={() => {
                  setSearch((prevState) => ({
                    ...prevState,
                    isDropdownOpen: true,
                    isSearchFocused: true,
                  }));
                }}
                ref={inputRef}
              />
              <DropDownSearch
                searchResults={searchResults}
                onClose={handleCloseDropdown}
                isVisible={search.isDropdownOpen}
                selectedIndex={selectedIndex}
                setSelectedIndex={setSelectedIndex}
                searchQuery={search.searchQuery}
                containerWidth={inputContainerWidth}
              />

              <ClearButton
                $query={search.searchQuery}
                onClick={handleClearSearch}
              >
                <FiX />
              </ClearButton>
              <SlashToggleBtn $isFocused={search.isSearchFocused}>
                <GoCommandPalette />
              </SlashToggleBtn>
            </InputContainer>
          )}
        </NavbarWrapper>
        {menuOpen && (
          <MenuPanel aria-label='Main menu'>
            <Link to='/home'>Home</Link>
            <Link to='/search'>Browse &amp; Search</Link>
            <Link to='/profile'>Settings</Link>
            <Link to='/about'>About</Link>
            <Link to='/pptos'>Privacy &amp; Terms</Link>
            <hr />
            <button onClick={toggleTheme}>
              {isDarkMode ? <FiSun /> : <FiMoon />}{' '}
              {isDarkMode ? 'Light mode' : 'Dark mode'}
            </button>
          </MenuPanel>
        )}
      </StyledNavbar>
      {menuOpen && (
        <MenuBackdrop aria-label='Close menu' onClick={() => setMenuOpen(false)} />
      )}
      {/* Conditionally render InputContainer below the navbar for mobile view when visibility is toggled */}
    </>
  );
};
