import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import {
  handleSocialProofDataRequest,
  handleSocialProofLoaderRequest,
} from "./lib/popup-social-proof.server";

const SOCIAL_PROOF_DATA_PATH = "/api/popup/social-proof";
const SOCIAL_PROOF_LOADER_PATH = "/api/popup/social-proof-loader.js";

const publicSocialProofMiddleware = createMiddleware().server(async ({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === SOCIAL_PROOF_DATA_PATH) return handleSocialProofDataRequest(request);
  if (pathname === SOCIAL_PROOF_LOADER_PATH) return handleSocialProofLoaderRequest(request);
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("SERVER_FN_ERROR:", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [publicSocialProofMiddleware, errorMiddleware, csrfMiddleware],
}));
