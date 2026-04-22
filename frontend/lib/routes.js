export const ROUTE_CONFIG = {
  profileBadgesBase: '/profile/badges',
  hashtagBase: '/discover/hashtag',
};

export const appRoutes = {
  profileBadges: () => ROUTE_CONFIG.profileBadgesBase,
  hashtag: (tag) => `${ROUTE_CONFIG.hashtagBase}/${encodeURIComponent(String(tag || '').toLowerCase())}`,
};
