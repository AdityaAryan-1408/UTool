export let ONLINE_WALLPAPER_CACHE = {};

export function cacheOnlineWallpapers(cacheKey, items) {
  ONLINE_WALLPAPER_CACHE = { ...ONLINE_WALLPAPER_CACHE, [cacheKey]: items };
}

export const WALLPAPERS = [
  {
    id: 0,
    title: 'Cyberpunk Neon Metropolis',
    location: 'Neo Tokyo · Nightfall',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=2400&q=85',
    accent: {
      name: 'Electric Cyan',
      primary: '#00F2FE',
      primaryLight: '#38BDF8',
      primaryDark: '#0284C7',
      rgb: '0, 242, 254',
      bgAlpha: 'rgba(0, 242, 254, 0.18)',
      borderAlpha: 'rgba(0, 242, 254, 0.40)',
      activeText: '#04101E',
    }
  },
  {
    id: 1,
    title: 'Autumn Mountain Ridge',
    location: 'Dolomites, Italy',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=85',
    accent: {
      name: 'Sunset Orange',
      primary: '#EA580C',
      primaryLight: '#FB923C',
      primaryDark: '#9A3412',
      rgb: '234, 88, 12',
      bgAlpha: 'rgba(234, 88, 12, 0.15)',
      borderAlpha: 'rgba(234, 88, 12, 0.35)',
      activeText: '#FFFFFF',
    }
  },
  {
    id: 2,
    title: 'Serene Alpine Lake',
    location: 'Lake Como, Alps',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=85',
    accent: {
      name: 'Glacier Cyan',
      primary: '#06B6D4',
      primaryLight: '#22D3EE',
      primaryDark: '#0E7490',
      rgb: '6, 182, 212',
      bgAlpha: 'rgba(6, 182, 212, 0.15)',
      borderAlpha: 'rgba(6, 182, 212, 0.35)',
      activeText: '#000000',
    }
  },
  {
    id: 3,
    title: 'Neon Cyber City',
    location: 'Shinjuku, Tokyo',
    url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=2400&q=85',
    accent: {
      name: 'Neon Violet',
      primary: '#A855F7',
      primaryLight: '#C084FC',
      primaryDark: '#7E22CE',
      rgb: '168, 85, 247',
      bgAlpha: 'rgba(168, 85, 247, 0.15)',
      borderAlpha: 'rgba(168, 85, 247, 0.35)',
      activeText: '#FFFFFF',
    }
  },
  {
    id: 4,
    title: 'Obsidian Liquid Abstract',
    location: 'Minimalist Void',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2400&q=85',
    accent: {
      name: 'Emerald Mint',
      primary: '#10B981',
      primaryLight: '#34D399',
      primaryDark: '#047857',
      rgb: '16, 185, 129',
      bgAlpha: 'rgba(16, 185, 129, 0.15)',
      borderAlpha: 'rgba(16, 185, 129, 0.35)',
      activeText: '#000000',
    }
  },
];
