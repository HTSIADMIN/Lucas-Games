export type PlaceholderPlayer = {
  id: string;
  username: string;
  initials: string;
  avatarColor: string;
  rank: number;
  pin: string;
};

export const PLACEHOLDER_PLAYERS: PlaceholderPlayer[] = [
  { id: "lucas",  username: "Lucas",  initials: "LH", avatarColor: "var(--gold-300)",     rank: 1, pin: "0000" },
  { id: "bobby",  username: "Bobby",  initials: "BS", avatarColor: "var(--crimson-300)",  rank: 2, pin: "0000" },
  { id: "joey",   username: "Joey",   initials: "JS", avatarColor: "var(--sky-300)",      rank: 3, pin: "0000" },
  { id: "wyatt",  username: "Wyatt",  initials: "WT", avatarColor: "var(--cactus-300)",   rank: 4, pin: "0000" },
];
