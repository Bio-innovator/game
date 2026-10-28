import { TECH_BY_ID } from "../data/techs.js";

export function getResearchStatus(state, techId) {
  const tech = TECH_BY_ID[techId];
  if (!tech) return { status: "missing", canResearch: false };
  if (state.techs.includes(techId)) return { status: "unlocked", canResearch: false };
  const missing = tech.requires.filter((required) => !state.techs.includes(required));
  if (missing.length > 0) return { status: "locked", canResearch: false, missing };
  if (state.data < tech.cost) return { status: "expensive", canResearch: false };
  return { status: "available", canResearch: true };
}
