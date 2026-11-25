import type { MemoryReferenceStore, StoredRow } from "./import-store.fixtures";

// One request as the Supabase client sent it.
export interface SentRequest {
  method: string;
  path: string;
  params: URLSearchParams;
  headers: Headers;
  body: unknown;
}

const REST = "/rest/v1/bank_reference_images";
const OBJECT = "/storage/v1/object/curriculum-reference/";
const LIST = "/storage/v1/object/list/curriculum-reference";

function matches(row: StoredRow, column: string, filter: string): boolean {
  const value = (row as unknown as Record<string, unknown>)[column] ?? null;
  if (filter === "is.null") return value === null;
  if (filter.startsWith("eq.")) return value === filter.slice(3);
  if (filter.startsWith("in.(")) {
    return filter.slice(4, -1).split(",").some((item) => item.replace(/^"|"$/g, "") === value);
  }
  throw new Error(`filter ${column}=${filter} is not modelled`);
}

// The database and the bucket behind the Supabase client, with the rows and objects of a memory store.
// It keeps every request, so that a test can see what the client really sends.
export class FakeSupabase {
  sent: SentRequest[] = [];
  // Set to make each request fail with this message.
  failWith: string | null = null;
  // Runs before a request is answered.
  onRequest?: (request: SentRequest) => void;

  constructor(readonly state: MemoryReferenceStore) {}

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const raw = init?.body;
    const body: unknown =
      typeof raw === "string" ? JSON.parse(raw) : raw ? new Uint8Array(await new Response(raw).arrayBuffer()) : null;
    const request: SentRequest = {
      method: init?.method ?? "GET",
      path: decodeURIComponent(url.pathname),
      params: url.searchParams,
      headers: new Headers(init?.headers),
      body,
    };
    this.sent.push(request);
    this.onRequest?.(request);
    if (this.failWith !== null) return json(500, { message: this.failWith });
    if (request.path === REST) return this.answerTable(request);
    if (request.path === LIST) return this.answerList(request);
    if (request.path.startsWith(OBJECT)) return this.answerObject(request, request.path.slice(OBJECT.length));
    throw new Error(`${request.method} ${request.path} is not modelled`);
  };

  private answerTable({ method, params, headers, body }: SentRequest): Response {
    const filters = [...params].filter(([key]) => !["select", "order", "offset", "limit", "on_conflict", "columns"].includes(key));
    const found = [...this.state.rows.values()].filter((row) => filters.every(([column, filter]) => matches(row, column, filter)));
    if (method === "GET") {
      const from = Number(params.get("offset") ?? 0);
      return json(200, found.slice(from, from + Number(params.get("limit") ?? 1000)));
    }
    if (method === "PATCH") {
      for (const row of found) this.state.rows.set(row.source_ref, { ...row, ...(body as Partial<StoredRow>) });
      return json(200, found);
    }
    const row = body as StoredRow;
    if (this.state.rows.has(row.source_ref)) {
      if (headers.get("prefer")?.includes("resolution=ignore-duplicates")) return json(201, []);
      throw new Error("an insert that merges is not modelled");
    }
    const at = "2026-01-02T03:04:05.123456+00:00";
    this.state.rows.set(row.source_ref, { ...row, id: `id-${row.source_ref}`, created_at: at, updated_at: at });
    return json(201, [row]);
  }

  private answerList({ body }: SentRequest): Response {
    const { prefix, search, limit, offset } = body as { prefix: string; search: string; limit: number; offset: number };
    const names = [...this.state.objects.keys()]
      .filter((path) => path.startsWith(`${prefix}/`))
      .map((path) => path.slice(prefix.length + 1))
      .filter((name) => !name.includes("/") && name.includes(search));
    return json(200, names.slice(offset, offset + limit).map((name) => ({ name })));
  }

  private answerObject({ method, headers, body }: SentRequest, path: string): Response {
    const object = this.state.objects.get(path);
    if (method === "GET") {
      return object ? new Response(new Uint8Array(object.bytes)) : json(404, { message: "Object not found" });
    }
    if (object && headers.get("x-upsert") !== "true") {
      return json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    }
    this.state.objects.set(path, { bytes: body as Uint8Array, contentType: headers.get("content-type") ?? "" });
    return json(200, { Key: path, Id: "id" });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
