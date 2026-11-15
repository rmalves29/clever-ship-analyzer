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

## Purchase recovery flow
- `automation_kind = purchase_recovery` is handled by `purchase-recovery.ts` (pure rules) and `purchase-recovery.server.ts`, tracked in `purchase_recovery_attempts`, never in `whatsapp_automation_runs`: attempts may have no CRM customer and need per-attempt link, cutoff and phone-level dedup.
- It only processes through the scheduled `/api/automations/tick` on the armed `recoveryAllowedHost`, with both Meta templates APPROVED, and the queue worker re-runs the same guards right before each send; keep both checks so preview/manual runs and stale queue items can never send.
