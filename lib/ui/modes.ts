// How each Game Mode looks in the site (tiles, badges, pickers). Pure data, safe anywhere.
// The playable list and rules live in lib/modes/ (F13/F20); this is only presentation.
// Spec: docs/design/design-system.md § Mode themes, overnight-decisions §4 and §13.

export type ModeUiId = "dive" | "apogee" | "leap" | "pairs" | "blitz" | "arena";

export type ModeUi = {
  id: ModeUiId;
  name: string;
  tagline: string;
  rules: string; //   one-liner for the picker
  accent: string; //  CSS colour
  accent2: string; // secondary colour for the mini-scene
  verb: string; //    the Play button's word
  icon: string; //    a single glyph for small badges
};

export const MODE_UI: Record<ModeUiId, ModeUi> = {
  dive: {
    id: "dive",
    name: "Dive",
    tagline: "Rarer answers sink deeper.",
    rules: "7 prompts · 25 s each · type any answer",
    accent: "#4de3ff",
    accent2: "#ff5d8f",
    verb: "BEGIN DESCENT",
    icon: "▼",
  },
  apogee: {
    id: "apogee",
    name: "Apogee",
    tagline: "Rarer answers fly higher.",
    rules: "7 prompts · 25 s each · score in km",
    accent: "#ff7a3d",
    accent2: "#8fd3ff",
    verb: "LAUNCH",
    icon: "▲",
  },
  leap: {
    id: "leap",
    name: "Leap",
    tagline: "Answer right, jump higher.",
    rules: "10 questions · 15 s · 3 hearts",
    accent: "#3ddc97",
    accent2: "#ffd84d",
    verb: "START CLIMB",
    icon: "◆",
  },
  pairs: {
    id: "pairs",
    name: "Pairs",
    tagline: "Match terms before the clock runs out.",
    rules: "2 boards · 6 pairs · 60 s each",
    accent: "#ff9f43",
    accent2: "#9d7bff",
    verb: "DEAL",
    icon: "◧",
  },
  blitz: {
    id: "blitz",
    name: "Blitz",
    tagline: "60 seconds of true or false.",
    rules: "60 s · combos after 5 in a row",
    accent: "#ff3df0",
    accent2: "#3dfcff",
    verb: "GO",
    icon: "ϟ",
  },
  arena: {
    id: "arena",
    name: "Arena",
    tagline: "Shoot the right answer.",
    rules: "10 targets · 20 s · wrong hits cost 3 s",
    accent: "#ff4d6d",
    accent2: "#4de3ff",
    verb: "ENTER ARENA",
    icon: "✛",
  },
};

export const MODE_UI_LIST: ModeUi[] = Object.values(MODE_UI);

export function modeUi(id: string): ModeUi {
  return (MODE_UI as Record<string, ModeUi>)[id] ?? MODE_UI.dive;
}
