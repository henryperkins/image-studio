# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Media Studio is a full-stack application for generating images and videos using Azure OpenAI services. The project uses a monorepo structure with separate `web` (React frontend) and `server` (Fastify API) packages.

## Development Commands

### Root Level
- `pnpm dev` - Start both web and server in development mode concurrently
- `pnpm build` - Build both web and server for production
- `pnpm start` - Start the production server

### Server (`/server`)
- `pnpm dev` - Start server in development mode with hot reload (tsx watch)
- `pnpm build` - Build server using tsup (outputs to `dist/`)
- `pnpm start` - Start production server from `dist/index.js`

### Web (`/web`)
- `pnpm dev` - Start Vite development server on port 5173
- `pnpm build` - Build web app for production using Vite
- `pnpm preview` - Preview production build

## Architecture

### Server Architecture (Fastify API)
- **Framework**: Fastify with TypeScript
- **Port**: 8787 (configurable via PORT env var)
- **Main routes**:
  - `/api/images/generate` - Generate images using Azure OpenAI gpt-image-1
  - `/api/vision/describe` - Analyze images using Azure OpenAI GPT-4.1 vision
  - `/api/videos/sora/generate` - Generate videos using Azure OpenAI Sora (preview)
  - `/api/library/images` - Library management (list/delete images)
  - `/static/images/` - Serve generated images
- **Data storage**: Local filesystem (`data/images/` directory with `manifest.json`)
- **Key dependencies**: `fastify`, `@fastify/cors`, `@fastify/static`, `zod`, `dotenv`

### Web Architecture (React + Vite)
- **Framework**: React 19 with TypeScript
- **Styling**: TailwindCSS 4.x
- **Build tool**: Vite 7.x
- **Main components**:
  - `App.tsx` - Main layout with image/video mode switching and library panel
  - `ImageCreator.tsx` - Image generation interface
  - `SoraCreator.tsx` - Video generation interface
- **API communication**: Hardcoded to `http://localhost:8787`

### Data Flow
1. Images generated via Azure OpenAI are saved to `server/data/images/`
2. Metadata stored in `manifest.json` with unique IDs
3. Images served via static file endpoint `/static/images/`
4. Library panel allows selecting images for Sora video references
5. Vision API analyzes selected images to improve Sora prompts

## Environment Configuration

The server requires Azure OpenAI environment variables:
- `AZURE_OPENAI_ENDPOINT` (required)
- `AZURE_OPENAI_API_KEY` or `AZURE_OPENAI_BEARER`
- `AZURE_OPENAI_IMAGE_DEPLOYMENT` (for gpt-image-1)
- `AZURE_OPENAI_VISION_DEPLOYMENT` (for GPT-4.1)
- Various API version configurations

## Key Technical Details

- **File types**: Supports PNG and JPEG image formats
- **Image sizes**: 1024x1024, 1536x1024, 1024x1536
- **Video constraints**: Sora generates up to 20 seconds, max 1920x1920 resolution
- **CORS**: Server configured for web client on port 5173
- **Error handling**: Zod validation with structured error responses
- **Logging**: Fastify built-in logging for debugging

## UI/UX Design Patterns

### Accessibility (WCAG 2.1 Compliance)
- **Keyboard Navigation**: Full keyboard support with arrow keys for tabs, Ctrl+Enter for form submission
- **ARIA Patterns**: Proper roles, labels, and live regions for screen readers
- **Focus Management**: Logical focus flow, no focus stealing by notifications
- **Touch Targets**: Minimum 48x48px on mobile devices via `min-h-[48px]` classes

### Responsive Design
- **Mobile-First**: Collapsible library drawer on mobile with toggle button
- **Breakpoints**: 
  - `sm:` (640px) - Form layout adjustments
  - `md:` (768px) - Desktop grid layout, reduced touch targets
  - `lg:` (1024px) - Three-column form layouts
- **Grid Layouts**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` pattern

### Error Handling & Recovery
- **Retry Mechanism**: Exponential backoff with max 3 retries
- **Error Classification**: Network vs rate limit vs general errors
- **User Feedback**: Detailed error messages with actionable recovery options
- **Loading States**: Skeleton loaders and progress indicators

### Form Validation & Feedback
- **Inline Validation**: Real-time feedback below inputs
- **Helper Text**: Dynamic hints based on input state
- **Disabled State Explanations**: `aria-describedby` for context
- **Visual Indicators**: Border colors, icons for validation states

### Component Patterns

#### Toast Notifications (non-intrusive)
- Uses ARIA live regions (`role="alert"`)
- Doesn't steal focus from current task
- Auto-dismiss with pause on hover
- Success/error type differentiation

#### Loading States
- Skeleton components for content placeholders
- Progress bars for long operations
- Animated spinners in buttons during actions
- `animate-pulse` for skeleton effects

#### Interactive Elements
- Hover states with `hover:` modifiers
- Focus rings for keyboard navigation
- Disabled states with reduced opacity
- Transitions for smooth interactions (`transition-all duration-200`)

### State Management
- URL-based routing for deep linking (`?view=images|sora`)
- Local state for UI controls
- Loading states for async operations
- Optimistic UI updates where appropriate

### CSS Utilities & Classes
- **Custom classes**:
  - `.btn` - Base button styles with touch target support
  - `.input` - Form input styles with consistent padding
  - `.card` - Container with dark theme styling
  - `.skeleton` - Loading placeholder animation
  - `.fade-in` - Smooth appearance animation
- **Dark Theme**: Neutral color palette (`neutral-800`, `neutral-600`, etc.)
- **Spacing**: Consistent use of Tailwind spacing scale
- **Animation**: Custom keyframes for slide-in, fade-in effects

### Mobile Optimizations
- Collapsible panels to save screen space
- Stacked layouts on small screens
- Larger touch targets for interactive elements
- Simplified navigation with drawer pattern

### Performance Considerations
- Lazy loading images with `loading="lazy"`
- Debounced/throttled interactions where needed
- Optimistic UI updates for better perceived performance
- Request animation frame for focus management