// * ==== Components ====
// TODO Basic UI Components
export { Navbar } from './components/Navigation/Navbar';
export { Footer } from './components/Navigation/Footer';
export { DropDownSearch } from './components/Navigation/DropSearch';
export { SearchFilters } from './components/Navigation/SearchFilters';
export { ShortcutsPopup } from './components/ShortcutsPopup';
export { ThemeProvider, useTheme } from './components/ThemeContext';

// TODO Cards
export * from './components/Cards/CardGrid';
export { default as CardItem } from './components/Cards/CardItem';

// TODO Home Page Specific
export { EpisodeCard } from './components/Home/EpisodeCard';
export { HomeCarousel } from './components/Home/HomeCarousel';
export { HomeSideBar } from './components/Home/HomeSideBar';

// TODO Skeletons for Loading States
export {
  SkeletonCard,
  SkeletonSlide,
  SkeletonPlayer,
} from './components/Skeletons/Skeletons';

// TODO Watching Anime Functionality
export { default as StreamPlayer } from './components/Watch/Video/StreamPlayer';
export { default as EpisodePanel } from './components/Watch/EpisodePanel';
export { default as Shelf } from './components/Details/Shelf';

// * ==== Hooks ====
// TODO Utilizing API and Other Functionalities
export * from './hooks/useApi';
export * from './hooks/interface';
export * from './hooks/useScroll';
export * from './hooks/useSeason';

// * ==== Pages ====
// TODO Main Pages of the Application
export { default as Home } from './pages/Home';
export { default as Search } from './pages/Search';
export { default as Details } from './pages/Details';
export { default as Watch } from './pages/Watch';
export { default as Profile } from './pages/Profile';
export { default as About } from './pages/About';
export { default as PolicyTerms } from './pages/PolicyTerms';
export { default as Page404 } from './pages/404';
