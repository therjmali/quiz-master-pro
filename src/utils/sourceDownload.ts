import { buildZip, triggerDownload } from './zipBuilder';

// Vite bundles these as raw text at build time — eager so they're immediately available
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite glob raw import
const SOURCE_FILES = import.meta.glob(
  '/src/**/*.{ts,tsx,css,md}',
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

export const SOURCE_FILE_COUNT = Object.keys(SOURCE_FILES).length;

export async function downloadSourceCode(): Promise<void> {
  const files: Record<string, string> = {};
  const ROOT = 'quiz-master-pro';

  // All source files
  for (const [path, content] of Object.entries(SOURCE_FILES)) {
    files[`${ROOT}${path}`] = content;
  }

  // Standalone project config files
  files[`${ROOT}/index.html`]           = INDEX_HTML;
  files[`${ROOT}/package.json`]         = PACKAGE_JSON;
  files[`${ROOT}/vite.config.ts`]       = VITE_CONFIG;
  files[`${ROOT}/tailwind.config.ts`]   = TAILWIND_CONFIG;
  files[`${ROOT}/postcss.config.js`]    = POSTCSS_CONFIG;
  files[`${ROOT}/tsconfig.json`]        = TSCONFIG;
  files[`${ROOT}/tsconfig.node.json`]   = TSCONFIG_NODE;
  files[`${ROOT}/.env.example`]         = ENV_EXAMPLE;

  // Mock Zite SDKs so the app runs standalone
  files[`${ROOT}/src/mocks/zite-auth-sdk.ts`]          = MOCK_AUTH;
  files[`${ROOT}/src/mocks/zite-file-upload-sdk.ts`]   = MOCK_UPLOAD;
  files[`${ROOT}/src/mocks/zite-endpoints-sdk.ts`]     = MOCK_ENDPOINTS;
  files[`${ROOT}/src/mocks/zite-integrations-backend-sdk.ts`] = MOCK_BACKEND_SDK;

  files[`${ROOT}/README.md`] = README;

  triggerDownload(buildZip(files), 'quiz-master-pro-source.zip');
}

// ─── Standalone project files ────────────────────────────────────────────────

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quiz Master Pro</title>
    <meta name="description" content="Premium Quiz Learning Platform" />
    <meta name="theme-color" content="#0F0F1A" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎯</text></svg>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const PACKAGE_JSON = JSON.stringify({
  name: "quiz-master-pro",
  version: "1.0.0",
  private: true,
  type: "module",
  scripts: {
    dev: "vite",
    build: "tsc && vite build",
    preview: "vite preview"
  },
  dependencies: {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "recharts": "^2.12.7",
    "lucide-react": "^0.395.0",
    "framer-motion": "^11.2.12",
    "zod": "^3.23.8",
    "date-fns": "^3.6.0",
    "sonner": "^1.5.0",
    "react-hook-form": "^7.52.0",
    "use-debounce": "^10.0.1",
    "@hookform/resolvers": "^3.6.0",
    "@tanstack/react-table": "^8.17.3",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "@radix-ui/react-accordion": "^1.2.0",
    "@radix-ui/react-alert-dialog": "^1.1.1",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-checkbox": "^1.1.1",
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^2.1.1",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-radio-group": "^1.2.0",
    "@radix-ui/react-scroll-area": "^1.1.0",
    "@radix-ui/react-select": "^2.1.1",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slider": "^1.2.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.1",
    "@radix-ui/react-tooltip": "^1.1.2"
  },
  devDependencies: {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "@tailwindcss/typography": "^0.5.13",
    "typescript": "^5.5.3",
    "vite": "^5.3.3",
    "path": "^0.12.7"
  }
}, null, 2);

const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Replace Zite platform SDKs with local mock implementations
      'zite-auth-sdk':                       path.resolve(__dirname, './src/mocks/zite-auth-sdk.ts'),
      'zite-file-upload-sdk':                path.resolve(__dirname, './src/mocks/zite-file-upload-sdk.ts'),
      'zite-endpoints-sdk':                  path.resolve(__dirname, './src/mocks/zite-endpoints-sdk.ts'),
      'zite-integrations-backend-sdk':       path.resolve(__dirname, './src/mocks/zite-integrations-backend-sdk.ts'),
    }
  }
})`;

const TAILWIND_CONFIG = `import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))', input: 'hsl(var(--input))', ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
        primary:     { DEFAULT: 'hsl(var(--primary))',     foreground: 'hsl(var(--primary-foreground))' },
        secondary:   { DEFAULT: 'hsl(var(--secondary))',   foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted:       { DEFAULT: 'hsl(var(--muted))',       foreground: 'hsl(var(--muted-foreground))' },
        accent:      { DEFAULT: 'hsl(var(--accent))',      foreground: 'hsl(var(--accent-foreground))' },
        card:        { DEFAULT: 'hsl(var(--card))',        foreground: 'hsl(var(--card-foreground))' },
        popover:     { DEFAULT: 'hsl(var(--popover))',     foreground: 'hsl(var(--popover-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
}

export default config`;

const POSTCSS_CONFIG = `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`;

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2020", useDefineForClassFields: true,
    lib: ["ES2020","DOM","DOM.Iterable"], module: "ESNext",
    skipLibCheck: true, moduleResolution: "bundler",
    allowImportingTsExtensions: true, resolveJsonModule: true,
    isolatedModules: true, noEmit: true, jsx: "react-jsx",
    strict: true, paths: { "@/*": ["./src/*"] }
  },
  include: ["src"],
  references: [{ path: "./tsconfig.node.json" }]
}, null, 2);

const TSCONFIG_NODE = JSON.stringify({
  compilerOptions: {
    composite: true, skipLibCheck: true,
    module: "ESNext", moduleResolution: "bundler", allowSyntheticDefaultImports: true
  },
  include: ["vite.config.ts"]
}, null, 2);

const ENV_EXAMPLE = `# AI API Keys — paste your real keys here and rename to .env
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_GEMINI_API_KEY=AIza...

# The app URL (set this to your hosted URL for the Android template)
VITE_APP_URL=http://localhost:5173
`;

// ─── Mock SDKs ───────────────────────────────────────────────────────────────

const MOCK_AUTH = `// Mock of Zite Auth SDK — uses localStorage for standalone mode
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'qmp_auth_user';

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email: string; firstName?: string; lastName?: string; displayName?: string } | undefined>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : undefined; }
    catch { return undefined; }
  });

  const loginWithRedirect = useCallback((_opts?: { redirectUrl?: string; initialView?: 'login' | 'signup' }) => {
    const email = prompt('Enter your email to sign in (standalone mode):');
    if (!email?.includes('@')) return;
    const u = { id: btoa(email).replace(/=/g, ''), email, firstName: email.split('@')[0], displayName: email.split('@')[0] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback((_opts?: { returnTo?: string }) => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(undefined);
  }, []);

  return { user, isLoading: false, loginWithRedirect, logout };
}`;

const MOCK_UPLOAD = `// Mock of Zite File Upload SDK — uses FileReader in standalone mode
export async function uploadFile({ data }: { data: File; filename: string }): Promise<{ fileUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve({ fileUrl: (e.target?.result as string) ?? '' });
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });
}`;

const MOCK_ENDPOINTS = `// Mock of Zite Endpoints SDK — localStorage-based data persistence
// For production, replace with real API calls to your backend.

const DB_KEY = 'qmp_quiz_results';
const getDB  = (): any[] => { try { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); } catch { return []; } };
const saveDB = (d: any[]) => localStorage.setItem(DB_KEY, JSON.stringify(d));

export async function saveQuizResult(input: any) {
  const db = getDB();
  const record = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  db.unshift(record);
  saveDB(db);
  return { success: true, id: record.id };
}
export async function getQuizHistory(_input: any) { return { results: getDB() }; }
export async function deleteQuizResult(input: { id: string }) {
  saveDB(getDB().filter((r: any) => r.id !== input.id));
  return { success: true };
}
export async function generateQuiz(_input: any) {
  throw new Error('generateQuiz requires a real AI backend. Add your VITE_ANTHROPIC_API_KEY to .env and update src/api/generateQuiz.ts.');
}
export async function explainQuestion(_input: any) {
  throw new Error('explainQuestion requires a real AI backend.');
}
export async function generateNotes(_input: any) {
  throw new Error('generateNotes requires a real AI backend.');
}

// Types
export type SaveQuizResultInputType  = any;  export type SaveQuizResultOutputType  = { success: boolean; id: string };
export type GetQuizHistoryInputType  = any;  export type GetQuizHistoryOutputType  = { results: any[] };
export type DeleteQuizResultInputType = { id: string }; export type DeleteQuizResultOutputType = { success: boolean };
export type GenerateQuizInputType    = any;  export type GenerateQuizOutputType    = any;
export type ExplainQuestionInputType = any;  export type ExplainQuestionOutputType = any;
export type GenerateNotesInputType   = any;  export type GenerateNotesOutputType   = any;`;

const MOCK_BACKEND_SDK = `// Mock of Zite Integrations Backend SDK
// This file should only be imported in backend files (src/api/)
// In standalone mode, these are replaced with localStorage stubs.
export const createEndpoint = (config: any) => config;
export const Anthropic = { createMessage: async () => { throw new Error('Backend SDK not available in standalone mode'); } };
export const Gemini    = { generateContent: async () => { throw new Error('Backend SDK not available in standalone mode'); } };`;

// ─── README ──────────────────────────────────────────────────────────────────

const README = `# 🎯 Quiz Master Pro — Standalone Source Code

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open http://localhost:5173 in your browser.

## What's Included

| Path | Description |
|------|-------------|
| \`src/components/\` | All React UI components |
| \`src/hooks/\` | Custom React hooks |
| \`src/utils/\` | Utility functions |
| \`src/types/\` | TypeScript type definitions |
| \`src/api/\` | Backend endpoint logic (see below) |
| \`src/mocks/\` | Mock Zite SDK replacements |

## Zite Platform → Standalone

This app was built on the Zite platform. The following mocks replace Zite's cloud SDKs:

| Zite SDK | Mock Replacement | Storage |
|----------|-----------------|---------|
| \`zite-auth-sdk\` | \`src/mocks/zite-auth-sdk.ts\` | localStorage |
| \`zite-file-upload-sdk\` | \`src/mocks/zite-file-upload-sdk.ts\` | FileReader (base64) |
| \`zite-endpoints-sdk\` | \`src/mocks/zite-endpoints-sdk.ts\` | localStorage |

## Re-enabling AI Features

1. Copy \`.env.example\` → \`.env\`
2. Add your API keys to \`.env\`
3. Update \`src/api/generateQuiz.ts\`, \`src/api/explainQuestion.ts\`, \`src/api/generateNotes.ts\`
   to call the Anthropic/Gemini APIs directly using \`import.meta.env.VITE_ANTHROPIC_API_KEY\`

## Re-enabling Cloud Storage

Replace \`src/mocks/zite-endpoints-sdk.ts\` with real API calls to:
- Supabase, Firebase, PocketBase, or your own backend
- The endpoint signatures are already defined in the mock file

## Build for Production

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Deploy

Drop the \`dist/\` folder to Netlify, Vercel, Cloudflare Pages, or any static host.

## Android APK

Use the **Download Android Project** button in the app to get the Android Studio template,
then build the APK in Android Studio.

## Requirements

- Node.js 18+
- npm or pnpm

## Tech Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS · shadcn/ui · Recharts · Framer Motion · Zod
`;
