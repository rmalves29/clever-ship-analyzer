<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Creative matrix architecture
- Instagram creative matrix renders only the staged agent; keep its campaign-phase vocabulary consistent across prompts, validation schemas and reports so every stage uses the same contract.
- Keep the `rename-d3-shape-symbol` plugin in vite.config.ts: d3-shape's local `function Symbol` can hijack global `Symbol.for` in production bundles and blank chart pages.
