export const CATEGORY_COLORS = {
  person: "#4aff9e",
  project: "#4a9eff",
  location: "#ffdd4a",
  infrastructure: "#ff9e4a",
  agent: "#9e4aff",
  companies: "#ff4a9e",
  credential: "#ff4a4a",
  decision: "#4affff",
  event: "#ffaa4a",
  preference: "#aa9eff",
  procedure: "#9eff4a",
  other: "#8888aa",
};

export const CATEGORY_LABELS = {
  person: "People",
  project: "Projects",
  location: "Locations",
  infrastructure: "Infra",
  agent: "Agents",
  companies: "Companies",
  credential: "Credentials",
  decision: "Decisions",
  event: "Events",
  preference: "Preferences",
  procedure: "Procedures",
  other: "Other",
};

export const NODE_TYPES = {
  normal: { label: "Normal", icon: "📄" },
  credential: { label: "Credential", icon: "🔒" },
  archived: { label: "Archived", icon: "📦" },
};

export const COLOR_PALETTE = [
  // Row 1: Primary vivid
  "#ff4a4a", "#ff9e4a", "#ffdd4a", "#4aff4a", "#4affa0",
  "#4affff", "#4a9eff", "#4a4aff", "#9e4aff", "#ff4aff",
  // Row 2: Saturated mid
  "#ff7070", "#ffb347", "#e6e64a", "#70ff70", "#47ffb3",
  "#70e0ff", "#709eff", "#8870ff", "#c870ff", "#ff70c8",
  // Row 3: Soft/muted
  "#ff9999", "#ffcc80", "#e0e080", "#80e0a0", "#80d4c0",
  "#80ccff", "#99aaff", "#bb99ff", "#dd80cc", "#cc8899",
];

// Legacy aliases for backward compatibility (remove after full migration)
export const GROUP_COLORS = CATEGORY_COLORS;
export const GROUP_LABELS = CATEGORY_LABELS;
