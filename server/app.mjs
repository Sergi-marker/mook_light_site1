// Serveur de Animots : application web, comptes, quotas, abonnements Stripe, partage de vidéos.

import { createServer } from "node:http";
import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { openDb } from "./db.mjs";
import { hashPassword, verifyPassword, newToken, tokenHash, EMAIL_RE, passwordProblem } from "./auth.mjs";
import { PLANS, planOf, checkExport, dayKey, publicPlan } from "./plans.mjs";
import { createStripe, verifyWebhook, planFromSubscription } from "./stripe.mjs";
import { createMailer } from "./mail.mjs";
import { sharePage, notFoundPage, resetPage, legalPage } from "./pages.mjs";

const SESSION_DAYS = 30;
const STATIC_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" };

class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

export function createApp(cfg) {
  const db = openDb(cfg.dbFile);
  const videoDir = join(cfg.dataDir, "videos");
  mkdirSync(videoDir, { recursive: true });
  const stripe = cfg.stripe?.secretKey ? createStripe({ secretKey: cfg.stripe.secretKey, fetchImpl: cfg.fetchImpl }) : null;
  const sendMail = createMailer({ resendKey: cfg.resendKey, from: cfg.mailFrom, fetchImpl: cfg.fetchImpl, log: cfg.log ?? console.log });
  const now = () => (cfg.now ? cfg.now() : Date.now());
  const publicUrl = (cfg.publicUrl ?? "").replace(/\/$/, "");

  // ---------- requêtes SQL ----------
  const q = {
    userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    userById: db.prepare("SELECT * FROM users WHERE id = ?"),
    userByCustomer: db.prepare("SELECT * FROM users WHERE stripe_customer = ?"),
    insertUser: db.prepare("INSERT INTO users (email, pass_hash, name, created_at) VALUES (?, ?, ?, ?)"),
    setPassword: db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?"),
    setPlan: db.prepare("UPDATE users SET plan = ?, plan_until = ?, stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?"),
    setCustomer: db.prepare("UPDATE users SET stripe_customer = ? WHERE id = ?"),
    deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"),
    session: db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
    purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
    exportsToday: db.prepare("SELECT COUNT(*) AS n FROM exports WHERE user_id = ? AND day = ?"),
    insertExport: db.prepare("INSERT INTO exports (user_id, day, duration, created_at) VALUES (?, ?, ?, ?)"),
    cancelExport: db.prepare("DELETE FROM exports WHERE id = ? AND user_id = ? AND created_at > ?"),
    insertVideo: db.prepare("INSERT INTO videos (id, user_id, title, file, mime, size, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
    video: db.prepare("SELECT videos.*, users.plan AS owner_plan, users.plan_until AS owner_plan_until FROM videos JOIN users ON users.id = videos.user_id WHERE videos.id = ?"),
    myVideos: db.prepare("SELECT id, title, size, duration, views, created_at FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 200"),
    userVideoFiles: db.prepare("SELECT file FROM videos WHERE user_id = ?"),
    deleteVideo: db.prepare("DELETE FROM videos WHERE id = ? AND user_id = ?"),
    addView: db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?"),
    insertReset: db.prepare("INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)"),
    reset: db.prepare("SELECT * FROM resets WHERE token_hash = ? AND expires_at > ?"),
    deleteResets: db.prepare("DELETE FROM resets WHERE user_id = ?"),
    seenEvent: db.prepare("SELECT 1 FROM stripe_events WHERE id = ?"),
    insertEvent: db.prepare("INSERT INTO stripe_events (id, received_at) VALUES (?, ?)"),
  };

  // ---------- outils ----------
  const limiter = new Map();
  function rateLimit(req, key, max, windowMs) {
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const k = `${key}:${ip}`;
    const t = now();
    const e = limiter.get(k);
    if (!e || e.reset < t) { limiter.set(k, { n: 1, reset: t + windowMs }); return; }
    if (++e.n > max) throw new HttpError(429, "TOO_MANY_REQUESTS");
  }

  function cookies(req) {
    return Object.fromEntries(String(req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter((p) => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)]));
  }

  function sessionCookie(token, maxAge) {
    return `vs_session=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secureCookies ? "; Secure" : ""}`;
  }

  function startSession(res, userId) {
    const token = newToken();
    q.insertSession.run(tokenHash(token), userId, now() + SESSION_DAYS * 86400e3);
    res.setHeader("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400));
  }

  function currentUser(req) {
    const token = cookies(req).vs_session;
    if (!token) return null;
    const s = q.session.get(tokenHash(token), now());
    return s ? q.userById.get(s.user_id) ?? null : null;
  }

  function requireUser(req) {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, "LOGIN_REQUIRED");
    return u;
  }

  async function readBody(req, limit = 1e6) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      // Trop gros : on lit quand même la fin (sans la garder) pour pouvoir répondre proprement.
      if (size <= limit) chunks.push(c);
    }
    if (size > limit) throw new HttpError(413, "TOO_LARGE");
    return Buffer.concat(chunks).toString("utf8");
  }

  async function readJson(req) {
    const raw = await readBody(req);
    try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "BAD_JSON"); }
  }

  function send(res, status, body, headers = {}) {
    const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
    res.writeHead(status, { "Content-Type": isJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
    res.end(isJson ? JSON.stringify(body) : body);
  }

  function usage(user) {
    const plan = planOf(user, now());
    const today = user ? q.exportsToday.get(user.id, dayKey(now(), cfg.timeZone)).n : 0;
    return { plan: publicPlan(plan), today, remaining: Number.isFinite(plan.dailyVideos) ? Math.max(0, plan.dailyVideos - today) : null };
  }

  function me(user) {
    if (!user) return { user: null, ...usage(null) };
    return {
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, planUntil: user.plan_until, hasBilling: !!user.stripe_customer },
      ...usage(user),
    };
  }

  /** Les requêtes qui modifient quelque chose doivent venir de notre page (protection CSRF). */
  function checkOrigin(req) {
    const ct = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    // Un autre site ne peut envoyer (sans accord CORS) que ces trois types de contenu.
    if (!ct || ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"].includes(ct)) throw new HttpError(415, "BAD_CONTENT_TYPE");
    const origin = req.headers.origin;
    if (origin && publicUrl && origin !== publicUrl && origin !== new URL(publicUrl).origin) throw new HttpError(403, "BAD_ORIGIN");
  }

  function setPlan(userId, plan, until, subscriptionId) {
    q.setPlan.run(plan, until, subscriptionId ?? null, userId);
  }

  function absolute(path) {
    return `${publicUrl}${path}`;
  }

  // ---------- routes API ----------
  const routes = {
    "GET /api/config": () => ({
      plans: Object.values(PLANS).map(publicPlan),
      billing: !!stripe || !!cfg.devBilling,
      devBilling: !!cfg.devBilling,
      ads: cfg.ads?.client ? { client: cfg.ads.client, slot: cfg.ads.slot } : null,
      sharing: true,
    }),

    "POST /api/auth/signup": async (req, res) => {
      rateLimit(req, "auth", 20, 10 * 60e3);
      const { email, password, name } = await readJson(req);
      const mail = String(email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(mail) || mail.length > 200) throw new HttpError(400, "BAD_EMAIL");
      const pwErr = passwordProblem(password);
      if (pwErr) throw new HttpError(400, pwErr);
      if (q.userByEmail.get(mail)) throw new HttpError(409, "EMAIL_TAKEN");
      let r;
      try {
        r = q.insertUser.run(mail, hashPassword(password), String(name ?? "").trim().slice(0, 80), now());
      } catch (e) {
        // Deux inscriptions simultanées avec la même adresse : la base refuse la seconde.
        if (/UNIQUE/i.test(String(e?.message))) throw new HttpError(409, "EMAIL_TAKEN");
        throw e;
      }
      startSession(res, Number(r.lastInsertRowid));
      return me(q.userById.get(Number(r.lastInsertRowid)));
    },

    "POST /api/auth/login": async (req, res) => {
      rateLimit(req, "auth", 20, 10 * 60e3);
      const { email, password } = await readJson(req);
      const u = q.userByEmail.get(String(email ?? "").trim().toLowerCase());
      if (!u || !verifyPassword(String(password ?? ""), u.pass_hash)) throw new HttpError(401, "BAD_LOGIN");
      startSession(res, u.id);
      return me(u);
    },

    "POST /api/auth/logout": async (req, res) => {
      const token = cookies(req).vs_session;
      if (token) q.deleteSession.run(tokenHash(token));
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      return { ok: true };
    },

    "POST /api/auth/forgot": async (req) => {
      rateLimit(req, "forgot", 5, 30 * 60e3);
      const { email } = await readJson(req);
      const u = q.userByEmail.get(String(email ?? "").trim().toLowerCase());
      // Même réponse que l'adresse existe ou non (on ne révèle pas qui a un compte).
      if (u) {
        const token = newToken();
        q.insertReset.run(tokenHash(token), u.id, now() + 3600e3);
        await sendMail({
          to: u.email,
          subject: "Animots : nouveau mot de passe",
          text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${absolute(`/reset?token=${token}`)}\n\nSi vous n'avez rien demandé, ignorez ce message.`,
        }).catch((e) => (cfg.log ?? console.error)(`E-mail non envoyé : ${e.message}`));
      }
      return { ok: true };
    },

    "POST /api/auth/reset": async (req, res) => {
      rateLimit(req, "auth", 20, 10 * 60e3);
      const { token, password } = await readJson(req);
      const r = q.reset.get(tokenHash(String(token ?? "")), now());
      if (!r) throw new HttpError(400, "BAD_TOKEN");
      const pwErr = passwordProblem(password);
      if (pwErr) throw new HttpError(400, pwErr);
      q.setPassword.run(hashPassword(password), r.user_id);
      q.deleteResets.run(r.user_id);
      q.deleteUserSessions.run(r.user_id);
      startSession(res, r.user_id);
      return { ok: true };
    },

    "GET /api/me": (req) => me(currentUser(req)),

    "DELETE /api/me": async (req, res) => {
      const u = requireUser(req);
      const { password } = await readJson(req);
      if (!verifyPassword(String(password ?? ""), u.pass_hash)) throw new HttpError(401, "BAD_LOGIN");
      for (const v of q.userVideoFiles.all(u.id)) { try { unlinkSync(join(videoDir, v.file)); } catch { /* déjà supprimé */ } }
      q.deleteUser.run(u.id);
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      return { ok: true };
    },

    /** À appeler juste avant un export : vérifie et décompte le quota du jour. */
    "POST /api/exports": async (req) => {
      const u = requireUser(req);
      const { duration } = await readJson(req);
      const plan = planOf(u, now());
      const day = dayKey(now(), cfg.timeZone);
      const used = q.exportsToday.get(u.id, day).n;
      const check = checkExport(plan, used, Number(duration));
      if (!check.ok) throw new HttpError(403, check.reason, { limit: check.limit, plan: plan.id });
      const r = q.insertExport.run(u.id, day, Number(duration), now());
      return { ok: true, exportId: Number(r.lastInsertRowid), ...usage(u) };
    },

    "GET /api/videos": (req) => {
      const u = requireUser(req);
      return { videos: q.myVideos.all(u.id).map((v) => ({ ...v, url: absolute(`/v/${v.id}`) })) };
    },

    "POST /api/videos": async (req) => {
      const u = requireUser(req);
      rateLimit(req, "upload", 30, 60 * 60e3);
      const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const ext = VIDEO_TYPES[mime];
      if (!ext) throw new HttpError(415, "BAD_VIDEO_TYPE");
      const plan = planOf(u, now());
      const maxBytes = (plan.id === "free" ? cfg.maxUploadMb.free : cfg.maxUploadMb.paid) * 1e6;
      const declared = Number(req.headers["content-length"] ?? 0);
      if (declared > maxBytes) throw new HttpError(413, "TOO_LARGE", { maxMb: maxBytes / 1e6 });
      const id = randomBytes(8).toString("base64url");
      const file = `${id}.${ext}`;
      const path = join(videoDir, file);
      let size = 0;
      try {
        await pipeline(req, async function* (src) {
          for await (const c of src) {
            size += c.length;
            if (size > maxBytes) throw new HttpError(413, "TOO_LARGE", { maxMb: maxBytes / 1e6 });
            yield c;
          }
        }, createWriteStream(path));
      } catch (e) {
        try { unlinkSync(path); } catch { /* rien à nettoyer */ }
        throw e;
      }
      if (size < 1000) { unlinkSync(path); throw new HttpError(400, "EMPTY_VIDEO"); }
      let title = String(req.headers["x-video-title"] ?? "");
      try { title = decodeURIComponent(title); } catch { /* titre mal encodé : gardé tel quel */ }
      title = title.slice(0, 120);
      const duration = Number(req.headers["x-video-duration"]) || null;
      q.insertVideo.run(id, u.id, title, file, mime, size, duration, now());
      return { id, url: absolute(`/v/${id}`) };
    },

    "POST /api/billing/checkout": async (req) => {
      const u = requireUser(req);
      const { plan } = await readJson(req);
      if (!["plus", "pro"].includes(plan)) throw new HttpError(400, "BAD_PLAN");
      if (cfg.devBilling && !stripe) {
        setPlan(u.id, plan, null, null);
        return { url: absolute("/?billing=success") };
      }
      if (!stripe) throw new HttpError(503, "BILLING_DISABLED");
      // Déjà abonné : changement d'offre dans l'espace client Stripe.
      if (u.stripe_customer && planOf(u, now()).id !== "free") {
        const p = await stripe.portal({ customerId: u.stripe_customer, returnUrl: absolute("/") });
        return { url: p.url };
      }
      const s = await stripe.checkout({
        priceId: cfg.stripe.prices[plan], customerId: u.stripe_customer, email: u.email, userId: u.id,
        successUrl: absolute("/?billing=success"), cancelUrl: absolute("/?billing=cancel"),
      });
      return { url: s.url };
    },

    "POST /api/billing/portal": async (req) => {
      const u = requireUser(req);
      if (cfg.devBilling && !stripe) { setPlan(u.id, "free", null, null); return { url: absolute("/") }; }
      if (!stripe) throw new HttpError(503, "BILLING_DISABLED");
      if (!u.stripe_customer) throw new HttpError(400, "NO_SUBSCRIPTION");
      const p = await stripe.portal({ customerId: u.stripe_customer, returnUrl: absolute("/") });
      return { url: p.url };
    },
  };

  async function stripeWebhook(req, res) {
    if (!stripe || !cfg.stripe.webhookSecret) throw new HttpError(503, "BILLING_DISABLED");
    const raw = await readBody(req, 2e6);
    let event;
    try { event = verifyWebhook(raw, req.headers["stripe-signature"], cfg.stripe.webhookSecret, 300, now()); } catch (e) { throw new HttpError(400, e.message); }
    if (q.seenEvent.get(event.id)) return send(res, 200, { ok: true, duplicate: true });
    const obj = event.data?.object ?? {};
    const applySubscription = async (sub, userIdHint) => {
      const user = (userIdHint && q.userById.get(Number(userIdHint))) || (sub.customer && q.userByCustomer.get(String(sub.customer)));
      if (!user) return;
      if (sub.customer && !user.stripe_customer) q.setCustomer.run(String(sub.customer), user.id);
      const { plan, until } = planFromSubscription(sub, cfg.stripe.prices);
      setPlan(user.id, plan, until, sub.id);
    };
    if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
      const userId = obj.client_reference_id ?? obj.metadata?.user_id;
      if (userId && obj.customer) q.setCustomer.run(String(obj.customer), Number(userId));
      if (obj.subscription) await applySubscription(await stripe.subscription(obj.subscription), userId);
    } else if (event.type.startsWith("customer.subscription.")) {
      await applySubscription(obj, obj.metadata?.user_id);
    }
    q.insertEvent.run(event.id, now());
    send(res, 200, { ok: true });
  }

  // ---------- fichiers ----------
  function serveMedia(req, res, id) {
    const v = q.video.get(id);
    if (!v) throw new HttpError(404, "NOT_FOUND");
    const path = join(videoDir, v.file);
    if (!existsSync(path)) throw new HttpError(404, "NOT_FOUND");
    const size = statSync(path).size;
    const headers = { "Content-Type": v.mime, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" };
    if (new URL(req.url, "http://x").searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="video-${id}.${extname(v.file).slice(1)}"`;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      return createReadStream(path, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "Content-Length": size });
    if (req.method === "HEAD") return res.end();
    createReadStream(path).pipe(res);
  }

  async function serveStatic(req, res, pathname) {
    const root = normalize(`${cfg.staticDir}/`);
    const file = normalize(join(root, pathname === "/" ? "index.html" : pathname));
    if (!file.startsWith(root)) throw new HttpError(403, "FORBIDDEN");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": STATIC_TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=300", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
      res.end(body);
    } catch {
      throw new HttpError(404, "NOT_FOUND");
    }
  }

  // ---------- aiguillage ----------
  async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    try {
      if (path === "/api/stripe/webhook" && req.method === "POST") return await stripeWebhook(req, res);
      if (path.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") checkOrigin(req);
        // Export annulé ou raté juste après avoir été décompté : la vidéo est rendue au quota.
        const cancel = /^\/api\/exports\/(\d+)\/cancel$/.exec(path);
        if (cancel && req.method === "POST") {
          const u = requireUser(req);
          q.cancelExport.run(Number(cancel[1]), u.id, now() - 2 * 3600e3);
          return send(res, 200, { ok: true, ...usage(u) });
        }
        const del = /^\/api\/videos\/([\w-]+)$/.exec(path);
        if (del && req.method === "DELETE") {
          const u = requireUser(req);
          const v = q.video.get(del[1]);
          if (!v || v.user_id !== u.id) throw new HttpError(404, "NOT_FOUND");
          q.deleteVideo.run(v.id, u.id);
          try { unlinkSync(join(videoDir, v.file)); } catch { /* déjà supprimé */ }
          return send(res, 200, { ok: true });
        }
        if (cfg.devBilling && path === "/api/billing/dev-set" && req.method === "POST") {
          const u = requireUser(req);
          const { plan } = await readJson(req);
          if (!PLANS[plan]) throw new HttpError(400, "BAD_PLAN");
          setPlan(u.id, plan, null, null);
          return send(res, 200, me(q.userById.get(u.id)));
        }
        const route = routes[`${req.method} ${path}`];
        if (!route) throw new HttpError(404, "NOT_FOUND");
        return send(res, 200, await route(req, res));
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "METHOD");
      const share = /^\/v\/([\w-]+)$/.exec(path);
      if (share) {
        const v = q.video.get(share[1]);
        if (!v) return send(res, 404, notFoundPage(publicUrl));
        q.addView.run(v.id);
        const ownerPlan = planOf({ plan: v.owner_plan, plan_until: v.owner_plan_until }, now());
        return send(res, 200, sharePage({ video: { ...v, views: v.views + 1 }, url: absolute(`/v/${v.id}`), mediaUrl: absolute(`/media/${v.id}`), showAds: ownerPlan.ads, ads: cfg.ads, publicUrl }));
      }
      const media = /^\/media\/([\w-]+)$/.exec(path);
      if (media) return serveMedia(req, res, media[1]);
      if (path === "/reset") return send(res, 200, resetPage({ token: url.searchParams.get("token") ?? "", publicUrl }));
      const legal = /^\/legal\/(impressum|privacy|terms)$/.exec(path);
      if (legal) return send(res, 200, legalPage(legal[1], cfg.operator ?? {}, publicUrl));
      return await serveStatic(req, res, decodeURIComponent(path));
    } catch (e) {
      // Requête interrompue (corps pas entièrement lu) : on ferme la connexion après la réponse.
      const close = !req.complete ? { Connection: "close" } : {};
      if (e instanceof HttpError) return send(res, e.status, path.startsWith("/api/") ? { error: e.code, ...e.extra } : `<h1>${e.status}</h1>`, close);
      (cfg.log ?? console.error)(e);
      return send(res, 500, path.startsWith("/api/") ? { error: "SERVER_ERROR" } : "<h1>500</h1>");
    }
  }

  const server = createServer((req, res) => { handle(req, res); });
  // Ménage des sessions expirées, une fois par heure.
  const timer = setInterval(() => q.purgeSessions.run(now()), 3600e3);
  timer.unref();
  server.on("close", () => { clearInterval(timer); db.close(); });
  return { server, db };
}
