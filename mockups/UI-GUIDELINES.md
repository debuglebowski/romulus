# Romulus UI Guidelines

## Philosophy
Clean, modern, and minimal. The UI should feel intuitive and get out of the way, letting the game mechanics shine. We use shadcn/ui as our foundation with small tweaks for personality.

## Color Palette

### Primary
- **Indigo** `#4f46e5` — buttons, highlights, active states
- **Red** `#ef4444` — destructive actions, warnings

### Neutrals
- **White** `#ffffff` — backgrounds
- **Zinc 50** `#fafafa` — subtle backgrounds
- **Zinc 100** `#f4f4f5` — muted backgrounds, hover states
- **Zinc 400** `#a1a1aa` — muted text
- **Zinc 900** `#18181b` — primary text

### In-Game HUD
The in-game HUD uses a dark theme for contrast against the game map:
- **Zinc 950** `#09090b` — HUD panel backgrounds
- **Zinc 900** `#18181b` — HUD surface elements
- **Zinc 800** `#27272a` — HUD borders

## Typography

### Font
- **Inter** — used throughout for a clean, readable experience
- System fonts as fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`

### Hierarchy
- Title/Logo: 4xl-5xl, font-bold, tracking-tight
- Page headers: xl, font-semibold
- Section headers: sm, font-medium
- Body: Default size, normal weight

### Text Style
- Use sentence case for all text (not UPPERCASE)
- Avoid excessive letter-spacing
- Keep text concise and scannable

## UI Elements

### Buttons
- Rounded corners (8px default)
- Solid fill for primary, outline for secondary
- Sentence case labels
- Smooth hover transitions

### Inputs
- Rounded borders
- Indigo ring on focus
- Placeholder text in muted color

### Cards & Panels
- Subtle rounded corners
- Thin borders
- Light shadow optional

### Tables
- Clean horizontal dividers
- Subtle hover states
- Good whitespace between rows

## Interactions & Motion

### Principles
- Smooth and subtle, never jarring
- Ease-in-out curves
- Duration: 150-200ms for micro-interactions

### Transitions
- Hover states: 150ms ease
- Color changes: `transition-colors`
- Modals: Fade in smoothly

### Feedback
- Buttons: Immediate visual response on hover/press
- Use toast notifications for success/error states

## Spacing

### Scale
Use Tailwind's default spacing scale:
- Tight: 2-4 (8-16px)
- Default: 4-6 (16-24px)
- Loose: 8+ (32px+)

### Layout
- Generous whitespace
- Content centered, max-width constrained
- Consistent padding on containers (p-4)

## Design Principles

### What to Embrace
- Rounded corners for a friendly feel
- Ample whitespace
- Clear visual hierarchy
- Consistent component styling via shadcn

### What to Avoid
- Harsh, sharp corners everywhere
- ALL CAPS text styling
- Overly dark or dramatic colors
- Cluttered layouts

## In-Game UI

The in-game HUD (stats bar, panels, modals) uses a dark theme to contrast with the game map:

- Dark backgrounds (zinc-950, zinc-900)
- Light text (white, zinc-100)
- Indigo accent for primary actions
- Rounded corners consistent with rest of app
- Good contrast for readability
