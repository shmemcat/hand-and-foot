export const cardsHome = (
  import.meta.env.VITE_CARDS_HOME_URL?.trim() || "https://cards.shmem.dev/"
).replace(/\/?$/, "/");
export const cardsAccount = `${cardsHome}user/`;
