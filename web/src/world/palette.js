// Pastel renk paleti. Bütün dünya renkleri buradan gelir.
import { Color } from "three";

const c = (hex) => new Color(hex);

export const SKY = {
  day: { top: c("#7ec4ea"), horizon: c("#d9eef7") },
  sunset: { top: c("#8b8fd6"), horizon: c("#f7b98f") },
  night: { top: c("#141c3a"), horizon: c("#2e3766") },
};

export const WATER = c("#5cc3d6");
export const DEEP_WATER = c("#2f8fb3");
export const SEABED = c("#3d9fb8");
export const SAND = c("#f1dcae");
export const WET_SAND = c("#d9c08c");
export const GRASS = c("#9fd486");
export const GRASS_DARK = c("#7cbf6f");
export const HILL = c("#8cc47a");
export const ROCK = c("#a9b39a");
export const ROAD = c("#efe4d6");
export const AVENUE = c("#e3d6c6");
export const PLAZA = c("#f6eee6");
export const FIELD = [c("#e9d27a"), c("#c9dc7e"), c("#e6b86f")];

export const WALLS = ["#f7b2bd", "#ffd59e", "#a8e0d1", "#b5d3f3", "#d4c1f0", "#fbe3a6", "#f9c9a8", "#c8e6b4"].map(c);
export const ROOFS = ["#e07a6f", "#d4886a", "#c96f7c", "#7a9cc6", "#8a7fc0", "#5fa79a"].map(c);
export const TREES = ["#6dbb6a", "#5aa95f", "#86c97a", "#4f9d6c", "#9ccf6e"].map(c);
export const CLOTHES = ["#e0607a", "#f2944a", "#3fa796", "#4a7fd1", "#8a62d1", "#e8b93a", "#5f9f4a", "#d4644f", "#3d5a6b", "#c4489f"].map(c);
export const SKIN = ["#f6d5c0", "#eabf9f", "#d29d7a", "#a8735a", "#7a5140"].map(c);

export const WINDOW_DAY = c("#9fb7cc");
export const WINDOW_NIGHT = c("#ffd98a");
export const WINDOW_DARK = c("#3a4664");
