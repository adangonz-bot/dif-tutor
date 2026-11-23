/* DIF Tutor app shell: Supabase sign-in, then hands the tutor page a `claude.use()` that talks to
   Supabase (database) and the dif-tutor Edge Function (AI tutor) instead of claude.ai. */
(function () {
  "use strict";
  const SUPABASE_URL = "https://rdfhauvxbubmpmiswxyc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_IUxCfNRIJRxfJVciQEVLyw_ZwZJlvyz";
  const FN_URL = SUPABASE_URL + "/functions/v1/dif-tutor";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "dif-auth" },
  });
  window.__sb = sb;

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* ---------- sign-in screen ---------- */
  let resolveReady;
  window.__authReady = new Promise((r) => (resolveReady = r));
  let uid = null, email = "";

  function authScreen(msg) {
    let el = document.getElementById("authgate");
    if (!el) {
      el = document.createElement("div");
      el.id = "authgate";
      el.innerHTML = `
        <form class="authcard" id="authform" autocomplete="on">
          <div class="authbrand">DIF&nbsp;TUTOR</div>
          <h1>Sign in</h1>
          <p class="note">Math 555 practice: your attempts, history and progress are saved to your account.</p>
          <label>Email<input type="email" id="authemail" autocomplete="username" required></label>
          <label>Password<input type="password" id="authpass" autocomplete="current-password" required minlength="6"></label>
          <button class="btn-primary" type="submit" id="authgo">Sign in</button>
          <button class="chip" type="button" id="authmode">New here? Create an account</button>
          <p class="autherr" id="autherr" role="alert"></p>
        </form>`;
      document.body.appendChild(el);
      let signup = false;
      const form = el.querySelector("#authform"), err = el.querySelector("#autherr");
      el.querySelector("#authmode").onclick = () => {
        signup = !signup;
        el.querySelector("h1").textContent = signup ? "Create account" : "Sign in";
        el.querySelector("#authgo").textContent = signup ? "Create account" : "Sign in";
        el.querySelector("#authmode").textContent = signup ? "Have an account? Sign in" : "New here? Create an account";
        el.querySelector("#authpass").autocomplete = signup ? "new-password" : "current-password";
        err.textContent = "";
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const em = el.querySelector("#authemail").value.trim(), pw = el.querySelector("#authpass").value;
        const go = el.querySelector("#authgo"); go.disabled = true; err.textContent = "";
        try {
          if (signup) {
            const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.origin } });
            if (error) throw error;
            if (!data.session) { err.textContent = "Check your email and tap the confirmation link, then come back and sign in."; go.disabled = false; return; }
          } else {
            const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
            if (error) throw error;
          }
        } catch (ex) {
          err.textContent = /invalid login/i.test(ex.message || "") ? "Wrong email or password." : (ex.message || "Couldn't sign in. Check your connection.");
          go.disabled = false;
        }
      };
    }
    el.classList.remove("hidden");
    if (msg) el.querySelector("#autherr").textContent = msg;
  }

  let started = false;
  function start(session) {
    uid = session.user.id; email = session.user.email || "";
    const g = document.getElementById("authgate"); if (g) g.classList.add("hidden");
    if (started) return;
    started = true;
    window.claude = { use: async (name) => (name === "sample" ? sample : name === "db" ? db : null) };
    resolveReady();
    addAccountButton();
  }
  sb.auth.onAuthStateChange((ev, session) => {
    if (session) start(session);
    else if (ev === "SIGNED_OUT") { location.reload(); }
  });
  document.addEventListener("DOMContentLoaded", async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) start(data.session); else authScreen();
  });

  function addAccountButton() {
    const go = () => {
      const top = document.querySelector("header.top"); if (!top || document.getElementById("acctbtn")) return;
      const b = document.createElement("button");
      b.className = "iconbtn"; b.id = "acctbtn"; b.textContent = "Account"; b.title = email;
      let armed = 0;
      b.onclick = async () => {
        if (Date.now() - armed > 3000) { armed = Date.now(); b.textContent = "Sign out?"; setTimeout(() => (b.textContent = "Account"), 3000); return; }
        await sb.auth.signOut();
      };
      top.appendChild(b);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }

  /* ---------- AI tutor: same interface the page expects from claude.use("sample") ---------- */
  const blobToB64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob);
  });
  async function call(input, opts = {}) {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw { code: "session_expired" };
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m) => ({ role: m.role, content: String(m.content) }));
    const images = await Promise.all((opts.images || []).map(blobToB64));
    let res;
    try {
      res = await fetch(FN_URL, {
        method: "POST", signal: opts.signal,
        headers: { Authorization: "Bearer " + data.session.access_token, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ messages, images, tier: opts.modelTier === "quick" ? "quick" : "default", stream: true, maxTokens: opts.maxTokens }),
      });
    } catch (e) { throw (e && e.name === "AbortError") ? { code: "cancelled", text: "" } : { code: "unavailable" }; }
    if (!res.ok) {
      let j = {}; try { j = await res.json(); } catch {}
      throw { code: j.code || (res.status === 401 ? "session_expired" : "unavailable"), message: j.message || "" };
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", stop = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
            text += ev.delta.text;
            if (opts.onText) opts.onText({ text, delta: ev.delta.text });
          } else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
          else if (ev.type === "error") throw { code: (ev.error && ev.error.type === "overloaded_error") ? "rate_limited" : "unavailable", text };
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw { code: "cancelled", text };
      throw e && e.code ? e : { code: "unavailable", text };
    }
    if (!text.trim()) throw { code: stop === "refusal" ? "refused" : "empty_completion" };
    return { text, truncated: stop === "max_tokens" };
  }
  const sample = (input, opts) => call(input, opts);
  sample.json = async (input, opts) => {
    const r = await call(input, opts);
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) throw { code: "invalid_json" };
    try { return JSON.parse(m[0]); } catch { throw { code: "invalid_json" }; }
  };
  sample.limits = async () => ({ images: { maxCount: 5, mediaTypes: ["image/png"] }, maxPromptBytes: 400000 });

  /* ---------- database: the small doc/collection API the page uses, mapped onto Postgres tables ---------- */
  const fail = (e) => { throw { code: "unavailable", message: e && e.message }; };
  const snap = (id, data) => ({ id, exists: data !== undefined && data !== null, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
  const toRow = (m) => ({
    id: m.id, user_id: uid, pid: m.pid, method: m.method || null, mode: m.mode || "practice",
    start_ms: Math.round(m.start), end_ms: m.end ? Math.round(m.end) : null, secs: m.secs == null ? null : Math.round(m.secs),
    status: m.status || "open", checks: m.checks | 0, hints: m.hints | 0, explains: m.explains | 0, grades: m.grades | 0,
    asks: m.asks | 0, issues: m.issues | 0, solution: !!m.solution, strokes: m.strokes | 0, last: m.last || null,
    score: m.score == null ? null : Number(m.score), exam: m.exam || null, updated_at: new Date().toISOString(),
  });
  const fromRow = (r) => ({
    id: r.id, pid: r.pid, method: r.method, mode: r.mode, start: Number(r.start_ms), end: r.end_ms ? Number(r.end_ms) : 0,
    secs: r.secs, status: r.status, checks: r.checks, hints: r.hints, explains: r.explains, grades: r.grades, asks: r.asks,
    issues: r.issues, solution: r.solution, strokes: r.strokes, last: r.last || "", score: r.score == null ? null : Number(r.score), exam: r.exam,
  });
  function doc(path) {
    const [col, id] = path.split("/");
    return {
      id, path,
      async get() {
        if (col === "progress") { const { data, error } = await sb.from("dif_progress").select("data").eq("user_id", uid).maybeSingle(); if (error) fail(error); return snap(id, data ? data.data : null); }
        if (col === "attempts") { const { data, error } = await sb.from("dif_attempts").select("*").eq("id", id).maybeSingle(); if (error) fail(error); return snap(id, data ? fromRow(data) : null); }
        if (col === "attemptInk") { const { data, error } = await sb.from("dif_attempt_ink").select("strokes").eq("attempt_id", id).maybeSingle(); if (error) fail(error); return snap(id, data ? { id, strokes: data.strokes } : null); }
        return snap(id, null);
      },
      async set(d) {
        let r;
        if (col === "progress") r = await sb.from("dif_progress").upsert({ user_id: uid, data: d, updated_at: new Date().toISOString() });
        else if (col === "attempts") r = await sb.from("dif_attempts").upsert(toRow(d));
        else if (col === "attemptInk") r = await sb.from("dif_attempt_ink").upsert({ attempt_id: id, user_id: uid, strokes: d.strokes || [], updated_at: new Date().toISOString() });
        if (r && r.error) fail(r.error);
      },
      async update(d) { return this.set(d); },
      async delete() {
        let r;
        if (col === "attempts") r = await sb.from("dif_attempts").delete().eq("id", id);
        else if (col === "attemptInk") r = await sb.from("dif_attempt_ink").delete().eq("attempt_id", id);
        else if (col === "progress") r = await sb.from("dif_progress").delete().eq("user_id", uid);
        if (r && r.error) fail(r.error);
      },
    };
  }
  function collection(col) {
    const q = (dir, lim) => ({
      path: col,
      doc: (id) => doc(col + "/" + id),
      where() { return this; },
      orderBy: (_f, d) => q(d || "asc", lim),
      limit: (n) => q(dir, n),
      async get() {
        if (col !== "attempts") return { docs: [], size: 0, empty: true, docChanges: () => [], metadata: {} };
        const { data, error } = await sb.from("dif_attempts").select("*").order("start_ms", { ascending: dir !== "desc" }).limit(lim || 1000);
        if (error) fail(error);
        const docs = data.map((r) => snap(r.id, fromRow(r)));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
    });
    return q("desc", 1000);
  }
  const db = { doc, collection };
})();
