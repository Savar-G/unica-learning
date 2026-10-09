import { pricingMarkdown } from "@/lib/ai-summary";

// Plans and terms in plain markdown, for AI agents that compare products. Built at build time.
export const dynamic = "force-static";

export function GET() {
  return new Response(pricingMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
