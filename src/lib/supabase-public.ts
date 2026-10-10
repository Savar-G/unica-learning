// Project "pagewise" (cdjobwsyzndtltzfpyqa). Shared by the server, the proxy and the browser, so all three talk to one project.
// The publishable key is public by design: row-level security decides what each request can do (see supabase/migrations/).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://cdjobwsyzndtltzfpyqa.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_QkL33gGZ-E1gOVdnLJsUEg_RgrRyqUs";
