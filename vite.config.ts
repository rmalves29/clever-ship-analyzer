// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// d3-shape declares `export default function Symbol(...)`, a module-level binding that shadows
// the global `Symbol`. In some production bundles the bundler wired `Symbol.for(...)` calls from
// other modules (react-is, @mui/x-internals) to that d3 function, crashing charts with
// "W.for is not a function". Renaming the local function removes the collision entirely.
const renameD3ShapeSymbol = {
  name: "rename-d3-shape-symbol",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!/[\\/]d3-shape[\\/]src[\\/]symbol\.js$/.test(id)) return null;
    return { code: code.replace(/function Symbol\(/, "function d3ShapeSymbol("), map: null };
  },
};

export default defineConfig({
  vite: {
    plugins: [renameD3ShapeSymbol],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // @emotion/babel-plugin: lets MUI's `sx` prop and styled() calls generate stable class names
  // and better dev labels, needed as we bring MUI components into the app (migração Materio).
  react: {
    babel: {
      plugins: ["@emotion/babel-plugin"],
    },
  },
});
