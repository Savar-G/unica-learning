import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];
const TAGS = new Set("div span p h1 h2 h3 h4 h5 h6 main header footer aside nav section article table caption colgroup col thead tbody tfoot tr td th figure figcaption output meter progress blockquote code pre mark sub sup ul ol li dl dt dd b strong em i small time br hr details summary label fieldset legend input select option textarea button a img dialog svg path rect circle line polyline polygon g title".split(" "));
const ATTRS = new Set("id class data-look role style title lang dir hidden open datetime scope colspan rowspan width height viewbox fill stroke stroke-width stroke-linecap stroke-linejoin d x y x1 y1 x2 y2 cx cy r rx ry points transform xmlns value placeholder checked selected type readonly".split(" "));
const CONTROLS = new Set(["button", "input", "select", "textarea", "fieldset"]);

/** Parse and allow-list static React output. Never trust a future component to stay free of active HTML. */
export function readOnlyPreviewMarkup(markup: string): string {
  const tree = parseFragment(markup);
  const visit = (nodes: Node[]): Node[] => nodes.flatMap(node => {
    if (node.nodeName === "#text") return [node];
    if (!("tagName" in node)) return [];
    const element = node as Element;
    if (element.tagName === "form") element.tagName = element.nodeName = "div";
    if (!TAGS.has(element.tagName)) return [];
    const staticImage = element.tagName === "img" && element.attrs.find(a => a.name === "src")?.value === "/desk/maya.webp";
    element.attrs = element.attrs.filter(a => (ATTRS.has(a.name.toLowerCase()) || a.name.startsWith("aria-"))
      && !(a.name === "style" && /url\s*\(|@import|expression\s*\(/i.test(a.value)));
    const attr = (name: string, value: string) => { element.attrs = element.attrs.filter(a => a.name !== name); element.attrs.push({ name, value }); };
    if (element.tagName === "a") { attr("role", "link"); attr("aria-disabled", "true"); attr("tabindex", "0"); }
    if (CONTROLS.has(element.tagName)) { attr("disabled", ""); attr("aria-disabled", "true"); }
    if (element.tagName === "button") attr("type", "button");
    // Only text and code-owned static pictures are needed. No sample ID can become an image request.
    if (element.tagName === "img") { attr("alt", ""); if (staticImage) attr("src", "/desk/maya.webp"); }
    element.childNodes = visit(element.childNodes);
    return [element];
  });
  tree.childNodes = visit(tree.childNodes);
  return serialize(tree);
}

export interface PreviewStyles { links: string[]; inline: string[]; origin: string; className?: string }
const escapeAttribute = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** No scripts, forms, network APIs, frame children, or navigation URLs enter the frame document. */
export function parentPreviewDocument(markup: string, styles: PreviewStyles): string {
  const origin = new URL(styles.origin).origin;
  const links = styles.links.flatMap(href => {
    const url = new URL(href, origin);
    return url.origin === origin && url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".css")
      ? [`<link rel="stylesheet" href="${escapeAttribute(url.href)}">`] : [];
  }).join("");
  const css = styles.inline.map(s => s.replace(/<\/style/gi, "<\\/style")).join("\n");
  const csp = `default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; style-src 'unsafe-inline' ${origin}/_next/static/; font-src ${origin}/_next/static/ data:; img-src data: ${origin}/desk/maya.webp`;
  return `<!doctype html><html lang="en-CA" class="${escapeAttribute(styles.className ?? "")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}"><title>Parent dashboard</title>${links}<style>${css}</style></head><body>${readOnlyPreviewMarkup(markup)}</body></html>`;
}
