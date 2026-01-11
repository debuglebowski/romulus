# Romulus UI Guidelines

## Philosophy
Ancient gravitas meets modern minimalism. Every element should feel like it belongs to Rome while remaining clean and scannable.

## Color Palette

### Primary
- **Gold** `#D4AF37` — buttons, highlights, active states
- **Crimson** `#8B0000` — accents, warnings, enemy indicators

### Neutrals
- **Parchment** `#F5F0E6` — light backgrounds, text on dark
- **Charcoal** `#1A1A1A` — dark backgrounds
- **Stone** `#4A4A4A` — secondary text, borders

## Typography

### Fonts
- **Headings**: Serif (Trajan Pro, Cinzel, or similar Roman-style)
- **Body**: Same serif, lighter weight

### Hierarchy
- Title/Logo: Large, uppercase, tracked out
- Section headers: Uppercase, gold underline
- Body: Sentence case, regular weight

## UI Elements

### Buttons
- Outlined style with thin gold borders
- Transparent fill, slight fill on hover
- Uppercase text, letter-spacing
- Subtle glow or border-thicken on hover

```
┌─────────────┐     ┌─────────────┐
│    PLAY     │  →  │░░░ PLAY ░░░│
└─────────────┘     └─────────────┘
    default              hover
```

### Inputs
- Thin bordered boxes
- Gold border on focus
- Placeholder text in muted stone color

### Lists/Tables
- Thin horizontal dividers
- No heavy borders
- Hover states with subtle gold tint

## Interactions & Motion

### Principles
- Smooth and fluid, never jarring
- Ease-in-out curves (not linear)
- Duration: 150-300ms for micro, 300-500ms for page transitions

### Transitions
- Page changes: Fade or subtle slide
- Hover states: 150ms ease
- Modals: Fade in + slight scale up

### Feedback
- Buttons: Immediate visual response
- Actions: Brief gold flash/pulse on success

## Spacing

### Scale
Use consistent spacing multiples (e.g., 4px base):
- Tight: 8px
- Default: 16px
- Loose: 32px
- Section: 64px

### Layout
- Generous whitespace
- Content centered, max-width constrained
- Breathing room around interactive elements

## Atmosphere

### What to Avoid
- Busy patterns or textures
- Rounded corners (too friendly/modern)
- Bright/saturated colors
- Heavy drop shadows

### What to Embrace
- Sharp corners or subtle bevels
- Thin lines and borders
- Uppercase for emphasis
- Negative space as a design element
