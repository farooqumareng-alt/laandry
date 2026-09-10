/**
 * Laandry design tokens.
 *
 * Pure data — no React/React Native dependency — so this package is safe to
 * import from apps/api (e.g. for email templates) as well as apps/app and
 * apps/admin. Shared RN + web components come in a later phase once
 * apps/app's Expo/React Native version is pinned; putting a peer dependency
 * on react-native here before that would risk a duplicate-React install.
 *
 * Palette: warm paper ground, ink-green text, a muted teal accent ("clean"
 * without being a mint cliché), and a brass secondary reserved for
 * sequence/phase markers and small emphasis — never as a second UI accent.
 */

export const color = {
  light: {
    paper: "#F5F3EE",
    paperRaised: "#FFFFFF",
    ink: "#1F2421",
    inkSoft: "#5B6660",
    inkFaint: "#8A9490",
    line: "#DEDAD0",
    lineStrong: "#C7C2B5",
    accent: "#2F6B63",
    accentInk: "#FFFFFF",
    accentSoft: "#E4EEEC",
    brass: "#9C7233",
    danger: "#A34B3F",
    dangerSoft: "#F5E5E1",
  },
  dark: {
    paper: "#15201C",
    paperRaised: "#1B2723",
    ink: "#E9EDE9",
    inkSoft: "#9FB0A8",
    inkFaint: "#6E7C75",
    line: "#2B3833",
    lineStrong: "#3B4A44",
    accent: "#6BB2A4",
    accentInk: "#0C1613",
    accentSoft: "#20302B",
    brass: "#D5A960",
    danger: "#D98D7E",
    dangerSoft: "#33201C",
  },
} as const;

export type ColorScheme = keyof typeof color;
export type ColorTokens = (typeof color)["light"];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Type scale. `family` names are logical roles, not literal font files —
 * each app maps them to its own loaded fonts (web: @font-face / Google
 * Fonts link; native: expo-font). Display carries brand personality
 * sparingly; body stays a highly legible workhorse face.
 */
export const type = {
  family: {
    display: "displayFont",
    body: "bodyFont",
    mono: "monoFont",
  },
  scale: {
    display: { size: 32, lineHeight: 38, weight: "600" },
    h1: { size: 26, lineHeight: 32, weight: "600" },
    h2: { size: 20, lineHeight: 26, weight: "600" },
    body: { size: 16, lineHeight: 24, weight: "400" },
    bodySmall: { size: 14, lineHeight: 20, weight: "400" },
    caption: { size: 12, lineHeight: 16, weight: "500" },
  },
} as const;
