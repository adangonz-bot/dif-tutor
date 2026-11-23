// DIF Tutor: forwards tutor requests from the signed-in app user to the Anthropic Messages API.
// Secrets: ANTHROPIC_API_KEY (required). Optional: ALLOWED_EMAILS (comma list), DAILY_CAP, MODEL_DEFAULT, MODEL_QUICK.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "invalid_argument", message: "POST only" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser(jwt);
    if (!user) return json({ code: "session_expired", message: "Sign in again." }, 401);

    const allowed = (Deno.env.get("ALLOWED_EMAILS") ?? "adan.gonzalez0316@outlook.com")
      .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes((user.email ?? "").toLowerCase())) {
      return json({ code: "not_granted", message: "This account is not allowed to use the tutor." }, 403);
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ code: "sampling_disabled", message: "The tutor has no ANTHROPIC_API_KEY yet. Add it in Supabase: Edge Functions > Secrets." }, 503);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cap = Number(Deno.env.get("DAILY_CAP") ?? 250);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from("dif_tutor_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("at", since);
    if ((count ?? 0) >= cap) return json({ code: "rate_limited", message: `Daily limit of ${cap} tutor calls reached.` }, 429);

    const body = await req.json();
    const tier = body.tier === "quick" ? "quick" : "default";
    const model = tier === "quick"
      ? (Deno.env.get("MODEL_QUICK") ?? "claude-haiku-5-5")
      : (Deno.env.get("MODEL_DEFAULT") ?? "claude-sonnet-5-5");
    const input: Msg[] = Array.isArray(body.messages) ? body.messages : [];
    if (!input.length) return json({ code: "invalid_argument", message: "No messages." }, 400);

    // merge consecutive same-role turns; the API wants user/assistant alternating, starting with user
    const merged: { role: string; content: unknown[] }[] = [];
    for (const m of input) {
      const role = m.role === "assistant" ? "assistant" : "user";
      const block = { type: "text", text: String(m.content ?? "") };
      const last = merged[merged.length - 1];
      if (last && last.role === role) last.content.push(block);
      else merged.push({ role, content: [block] });
    }
    if (merged[0].role !== "user") merged.unshift({ role: "user", content: [{ type: "text", text: "(start)" }] });
    const images: string[] = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
    if (images.length) {
      let lastUser = merged.length - 1;
      while (lastUser >= 0 && merged[lastUser].role !== "user") lastUser--;
      const imgBlocks = images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } }));
      merged[lastUser].content = [...imgBlocks, ...merged[lastUser].content];
    }

    await admin.from("dif_tutor_usage").insert({ user_id: user.id, model });

    const stream = body.stream !== false;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: Math.min(Number(body.maxTokens) || 1500, 3000), messages: merged, stream }),
    });
    if (!r.ok) {
      const t = await r.text();
      const code = r.status === 429 || r.status === 529 ? "rate_limited"
        : r.status === 413 ? "prompt_too_large"
        : r.status === 401 ? "sampling_disabled"
        : r.status === 400 && /image/i.test(t) ? "image_rejected"
        : r.status === 400 && /credit|billing/i.test(t) ? "sampling_disabled"
        : "unavailable";
      return json({ code, message: t.slice(0, 400) }, r.status === 401 ? 503 : r.status);
    }
    if (!stream) {
      const j = await r.json();
      const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
      return json({ text, truncated: j.stop_reason === "max_tokens" });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return json({ code: "unavailable", message: String(e).slice(0, 300) }, 500);
  }
});
