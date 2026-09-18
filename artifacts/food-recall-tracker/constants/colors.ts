/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#10233f',
    tint: '#2563eb',

    // Core surfaces
    background: '#ffffff',
    foreground: '#10233f',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#10233f',

    // Primary action color (buttons, links, active states)
    primary: '#2563eb',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#eff6ff',
    secondaryForeground: '#1e40af',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#f2f6fb',
    mutedForeground: '#5b6b82',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#eaf2ff',
    accentForeground: '#1e40af',

    // Destructive actions (delete, error states)
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#dbe5f0',
    input: '#cbd8e8',

    // Food safety status colors
    success: '#16a34a',
    successSoft: '#ecfdf3',
    warning: '#ca8a04',
    warningSoft: '#fffbeb',
    dangerSoft: '#fef2f2',
    blueSoft: '#eff6ff',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
