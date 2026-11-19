export const VIEWPORT_WIDTHS = [375, 768, 1024, 1280, 1440] as const;

export const VIEWPORTS = VIEWPORT_WIDTHS.map((width) => ({
  width,
  height: width < 768 ? 812 : 900,
}));

export const FORBIDDEN_VISIBLE_TOKENS = [
  "undefined",
  "null",
  "NaN",
  "[object Object]",
  "Lorem",
  "TODO",
  "YOUR_",
  "Invalid Date",
] as const;
