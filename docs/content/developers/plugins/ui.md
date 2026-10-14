---
title: UI and styling
description: Use Betelgeuse's own components and design tokens so your plugin looks native in every theme.
---
Your plugin renders with the app's React and can use the app's components and colours, so it fits in, in light and dark mode and every palette.

## Components

Import them from `@betelgeuse/plugin-api/ui` (the app provides them; they aren't bundled into your plugin):

```tsx
import { Button, Switch, TextInput, SettingRow, Popover, MenuItem, MenuDivider, EmptyState } from "@betelgeuse/plugin-api/ui";
```

| Component | Use |
|---|---|
| `Button` | `variant`: `primary`, `default`, `ghost` or `danger`; optional `icon`. |
| `Switch` | An on/off toggle: `checked`, `onChange`, `label` (for screen readers). |
| `TextInput` | A text field, styled like the app's. |
| `SettingRow` | A settings row: `label`, `hint`, and the control as children. |
| `Popover` | A floating panel anchored to an element or a point; closes on outside click and Escape. |
| `MenuItem`, `MenuDivider` | Rows for menus inside a `Popover`. |
| `EmptyState` | A centred icon, title and message for empty views. |

```tsx
<SettingRow label="Daily goal" hint="Words per day.">
  <TextInput type="number" value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
</SettingRow>
```

## Styling with Tailwind

The example plugin is set up for [Tailwind CSS](https://tailwindcss.com) with the app's design tokens. `src/styles.css`:

```css
@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities" layer(utilities);
@import "@betelgeuse/plugin-api/theme.css";
@source "./";
```

Import it from `main.tsx` (`import "./styles.css"`). The build writes only the classes you use into `dist/styles.css`, and the app loads it with your plugin (and removes it when the plugin is turned off). There's no CSS reset in it: the app has already done that.

The tokens follow the theme automatically:

| Classes | Colour |
|---|---|
| `text-ink`, `text-muted`, `text-faint` | Text: main, secondary, hints |
| `bg-surface`, `bg-side`, `bg-raised`, `bg-hover` | Page, sidebar, cards and menus, hover |
| `border-line` | Borders and dividers |
| `text-accent`, `bg-accent`, `bg-accent-soft` | The person's accent colour |

For anything else, the app's CSS variables are available: `var(--c-red-text)`, `var(--c-blue-bg)` and the other colours (`gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`), and `shadow-[var(--shadow-pop)]` for floating panels.

## Icons

Pass any React element as an icon: an emoji in a `<span>`, or an icon component. To use [Lucide](https://lucide.dev) icons like the app does, add `lucide-react` to your plugin's dependencies; only the icons you import are bundled.

## Guidelines

- Match the app: sentence-case labels, short hints under settings, `text-sm` for body text.
- Fill views edge to edge and scroll inside them; keep panels compact (they sit inside pages).
- Never hard-code colours: use the tokens, so dark mode and palettes work.
