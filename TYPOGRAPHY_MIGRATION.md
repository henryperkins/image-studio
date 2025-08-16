# Typography System Migration Guide

## Overview

A comprehensive typography system has been implemented for AI Media Studio, introducing:
- Variable fonts (Inter, Source Serif 4, JetBrains Mono)
- Modular scale based on Perfect Fourth (1.333)
- React Typography components
- CSS custom properties for tokens
- OpenType features for numeric data
- Accessibility improvements

## Quick Start

To view the typography specimen page, navigate to: `/?view=typography`

## Migration Steps

### 1. Replace HTML Headings

**Before:**
```tsx
<h1 className="text-2xl font-semibold">Title</h1>
<h2 className="text-lg font-medium">Subtitle</h2>
```

**After:**
```tsx
import { Heading } from './typography';

<Heading level={1}>Title</Heading>
<Heading level={2}>Subtitle</Heading>
```

### 2. Replace Text Elements

**Before:**
```tsx
<p className="text-sm text-neutral-400">Description</p>
<span className="text-xs text-red-400">Error message</span>
```

**After:**
```tsx
import { Text } from './typography';

<Text size="sm" tone="muted">Description</Text>
<Text size="xs" tone="danger">Error message</Text>
```

### 3. Replace Form Labels

**Before:**
```tsx
<label className="text-sm">Field Name</label>
```

**After:**
```tsx
import { Label } from './typography';

<Label htmlFor="field-id">Field Name</Label>
```

### 4. Replace Code/Monospace

**Before:**
```tsx
<code className="text-neutral-300">filename.txt</code>
```

**After:**
```tsx
import { Mono } from './typography';

<Mono>filename.txt</Mono>
```

### 5. Handle Numeric Data

**Before:**
```tsx
<td className="text-right">1,234</td>
```

**After:**
```tsx
import { Numeric } from './typography';

<td><Numeric align="end">1,234</Numeric></td>
```

## Typography Components API

### Heading
```tsx
<Heading 
  level={1-6}           // H1-H6 
  serif={boolean}       // Use serif for display
  weight="semibold"     // regular|medium|semibold|bold
  tone="default"        // default|muted|danger|success|warning
  clamp={2}            // Line clamp number
/>
```

### Text
```tsx
<Text
  size="base"          // xs|sm|base|md|lg
  longform={false}     // Enable serif with oldstyle numerals
  mono={false}         // Use monospace font
  numeric={false}      // Enable tabular numerals
  weight="regular"     // regular|medium|semibold|bold
  tone="default"       // default|muted|danger|success|warning
  truncate={1|2}       // Truncate lines
  as="p"              // HTML element to render
/>
```

### Label
```tsx
<Label
  htmlFor="id"         // Form field ID
  required={false}     // Show required asterisk
  size="sm"           // sm|xs
  uppercase={true}     // Apply small-caps
  tone="muted"        // default|muted|danger|success|warning
/>
```

### Mono
```tsx
<Mono
  wrap={false}         // Allow text wrapping
  tone="default"       // default|muted|danger|success|warning
/>
```

### Numeric
```tsx
<Numeric
  align="end"         // start|end|center
  size="base"         // sm|base|md|lg
  mono={false}        // Force monospace
  tone="default"      // default|muted|danger|success|warning
/>
```

## CSS Classes (When Components Aren't Suitable)

### Headings
- `.heading-1` through `.heading-6`
- `.display` - Large serif display heading

### Text Variants
- `.text-body` - Base body text
- `.text-longform` - Serif body with oldstyle numerals
- `.text-small` - Small UI text
- `.text-caption` - Extra small caption text
- `.text-muted` - Muted color helper

### Utilities
- `.font-numeric` - Tabular numerals with slashed zero
- `.font-mono` - Monospace with proper features
- `.caps` or `.label` - Small caps for labels
- `.truncate-1` - Single line truncation
- `.truncate-2` - Two line truncation

## Accessibility Checklist

- ✅ Minimum font size: 14px for UI, 12px for captions (with increased weight)
- ✅ Contrast ratios: ≥4.5:1 for body text, ≥3:1 for large text
- ✅ Focus rings: Visible on all interactive elements
- ✅ Touch targets: Minimum 48x48px on mobile
- ✅ Screen reader support: Proper ARIA labels and semantic HTML

## Performance Notes

- Variable fonts reduce HTTP requests
- `font-display: swap` ensures fast initial paint
- Fonts preloaded in HTML `<head>`
- Google Fonts CDN with proper caching

## Testing

1. Run build to check TypeScript: `pnpm build`
2. View specimen page: `http://localhost:5174/?view=typography`
3. Test responsive breakpoints: 320px, 768px, 1024px, 1440px
4. Verify tabular numerals in data tables
5. Check font loading performance in Network tab

## Future Enhancements

- [ ] Add ESLint rule for typography quote replacement
- [ ] Implement widow/orphan control utility
- [ ] Add Storybook stories for components
- [ ] Create automated visual regression tests
- [ ] Add CJK font support for internationalization