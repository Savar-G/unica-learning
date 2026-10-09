import { llmsTxt } from "@/lib/ai-summary";

// Summary for AI assistants (llmstxt.org). Built at build time from the page's own copy.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
