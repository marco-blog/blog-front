// E2E 피드 스텁 서버(007 research E18). 외부 블로그 시나리오가 인터넷 대신 이 서버의 RSS·Atom·HTML을 쓴다.
// Node 내장 node:http만 쓰고 127.0.0.1에만 바인딩한다. 상태는 메모리에만 둔다(서버를 다시 띄우면 비어 있음).
//
// 제공 경로(name은 시나리오마다 다른 이름):
//   GET /{name}/feed.xml   RSS 2.0(ETag, If-None-Match가 같으면 304)
//   GET /{name}/atom.xml   Atom 1.0
//   GET /{name}/           블로그 HTML(<link rel="alternate">, 소개란에 verifyCode)
//   GET /{name}/posts/{n}  원문 글(지운 글은 404)
//   GET /{name}/img/{n}.png 작은 PNG(64x48)
// 조작 API(시험 도구 tests/e2e/support/feedStub.ts가 부른다):
//   POST   /__stub/{name}            { title?, items?, verifyCode?, status? } — 블로그 상태를 정한다(덮어씀)
//   POST   /__stub/{name}/items      { n?, title, publishedAt?, categories?, image?, summary? } — 글 하나 더함(맨 앞)
//   DELETE /__stub/{name}/posts/{n}  원문 글을 지움(404)
//   GET    /__stub/{name}/hits       경로별 요청 수
//   GET    /__stub/health
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.E2E_FEED_STUB_PORT ?? 4610);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQklEQVR42u3PQQkAAAgEsAt2/TGWFfwKgxVYpn0tAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJXC5ySAOKTM4p9AAAAAElFTkSuQmCC",
  "base64",
);

/**
 * @typedef {{ n: number, title: string, publishedAt: string, categories: string[], image: boolean, summary: string, link: string }} Item
 * @typedef {{ title: string, items: Item[], verifyCode: string | null, status: number | null, removed: Set<number>, hits: Map<string, number> }} Blog
 * @typedef {{ n?: number, title?: string, publishedAt?: string, categories?: string[], image?: boolean, summary?: string }} ItemInput
 */

/** @type {Map<string, Blog>} */
const blogs = new Map();

/** @param {string} name @returns {Blog} */
function blog(name) {
  let state = blogs.get(name);
  if (!state) {
    state = {
      title: `Stub ${name}`,
      items: [],
      verifyCode: null,
      status: null,
      removed: new Set(),
      hits: new Map(),
    };
    blogs.set(name, state);
  }
  return state;
}

/** @param {unknown} value */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} name @param {Blog} state @param {ItemInput} item @returns {Item} */
function normalizeItem(name, state, item) {
  const n = item.n ?? state.items.reduce((max, it) => Math.max(max, it.n), 0) + 1;
  return {
    n,
    title: item.title ?? `Post ${n}`,
    publishedAt: item.publishedAt ?? new Date().toISOString(),
    categories: item.categories ?? [],
    image: Boolean(item.image),
    summary: item.summary ?? `Summary of ${item.title ?? n}`,
    link: `${BASE}/${name}/posts/${n}`,
  };
}

/** @param {string} name @param {Blog} state */
function rss(name, state) {
  const items = state.items
    .map((item) => {
      const categories = item.categories
        .map((c) => `<category>${escapeXml(c)}</category>`)
        .join("");
      const enclosure = item.image
        ? `<enclosure url="${BASE}/${name}/img/${item.n}.png" type="image/png" length="${PNG.length}"/>`
        : "";
      return `<item><title>${escapeXml(item.title)}</title><link>${item.link}</link><guid isPermaLink="false">${name}-${item.n}</guid><pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>${categories}${enclosure}<description>${escapeXml(item.summary)}</description></item>`;
    })
    .join("\n");
  const description = state.verifyCode
    ? `About ${escapeXml(state.title)} ${escapeXml(state.verifyCode)}`
    : `About ${escapeXml(state.title)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${escapeXml(state.title)}</title><link>${BASE}/${name}/</link><description>${description}</description>
${items}
</channel></rss>`;
}

/** @param {string} name @param {Blog} state */
function atom(name, state) {
  const entries = state.items
    .map(
      (item) =>
        `<entry><title>${escapeXml(item.title)}</title><link rel="alternate" href="${item.link}"/><id>urn:stub:${name}:${item.n}</id><updated>${item.publishedAt}</updated><summary>${escapeXml(item.summary)}</summary>${item.categories
          .map((c) => `<category term="${escapeXml(c)}"/>`)
          .join("")}</entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeXml(state.title)}</title><link rel="alternate" href="${BASE}/${name}/"/><id>urn:stub:${name}</id><updated>${new Date().toISOString()}</updated>
${entries}
</feed>`;
}

/** @param {string} name @param {Blog} state */
function html(name, state) {
  const intro = state.verifyCode ? `<p class="intro">${escapeXml(state.verifyCode)}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(state.title)}</title>
<link rel="alternate" type="application/rss+xml" href="/${name}/feed.xml"></head>
<body><h1>${escapeXml(state.title)}</h1>${intro}</body></html>`;
}

/**
 * @param {import("node:http").ServerResponse} res @param {number} status @param {string} type
 * @param {string | Buffer} body @param {Record<string, string>} [headers]
 */
function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
}

/** @param {import("node:http").IncomingMessage} req @returns {Promise<any>} */
function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (/** @type {Buffer} */ chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "__stub") {
    if (parts[1] === "health") {
      return send(res, 200, "text/plain", "ok");
    }
    const name = parts[1];
    if (!name) {
      return send(res, 404, "text/plain", "not found");
    }
    const state = blog(name);
    if (req.method === "POST" && parts.length === 2) {
      const body = await readJson(req);
      state.title = body.title ?? state.title;
      state.verifyCode = body.verifyCode ?? null;
      state.status = body.status ?? null;
      if (Array.isArray(body.items)) {
        state.items = [];
        for (const item of body.items) {
          state.items.push(normalizeItem(name, state, item));
        }
      }
      return send(res, 200, "application/json", JSON.stringify({ ok: true }));
    }
    if (req.method === "POST" && parts[2] === "items") {
      const item = normalizeItem(name, state, await readJson(req));
      state.items.unshift(item);
      return send(res, 200, "application/json", JSON.stringify(item));
    }
    if (req.method === "DELETE" && parts[2] === "posts") {
      state.removed.add(Number(parts[3]));
      return send(res, 200, "application/json", JSON.stringify({ ok: true }));
    }
    if (req.method === "GET" && parts[2] === "hits") {
      return send(
        res,
        200,
        "application/json",
        JSON.stringify(Object.fromEntries(state.hits.entries())),
      );
    }
    return send(res, 404, "text/plain", "not found");
  }

  const name = parts[0];
  if (!name || !blogs.has(name)) {
    return send(res, 404, "text/plain", "not found");
  }
  const state = blog(name);
  state.hits.set(url.pathname, (state.hits.get(url.pathname) ?? 0) + 1);
  const rest = parts.slice(1);

  if (rest[0] === "feed.xml" || rest[0] === "atom.xml") {
    if (state.status) {
      return send(res, state.status, "text/plain", "forced");
    }
    const body = rest[0] === "feed.xml" ? rss(name, state) : atom(name, state);
    const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    const type = rest[0] === "feed.xml" ? "application/rss+xml" : "application/atom+xml";
    return send(res, 200, `${type}; charset=utf-8`, body, { ETag: etag });
  }
  if (rest.length === 0) {
    return send(res, 200, "text/html; charset=utf-8", html(name, state));
  }
  if (rest[0] === "posts" && rest[1]) {
    const n = Number(rest[1]);
    const item = state.items.find((it) => it.n === n);
    if (!item || state.removed.has(n)) {
      return send(res, 404, "text/plain", "gone");
    }
    return send(
      res,
      200,
      "text/html; charset=utf-8",
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(item.title)}</title></head><body><h1>${escapeXml(item.title)}</h1><p>${escapeXml(item.summary)}</p></body></html>`,
    );
  }
  if (rest[0] === "img" && rest[1]) {
    return send(res, 200, "image/png", PNG, { "Content-Length": String(PNG.length) });
  }
  return send(res, 404, "text/plain", "not found");
});

server.listen(PORT, HOST, () => {
  console.log(`feed stub listening on ${BASE}`);
});
