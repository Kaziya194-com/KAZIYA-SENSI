import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/sensitivity", async (req, res) => {
  const d = req.body || {};
  const allowedGames = ["ff", "max"];
  const allowedStyles = ["drag", "onetap", "balanced", "spray"];
  if (!d.brand || !d.model || !d.ram || !d.storage ||
      !allowedGames.includes(d.game) || !allowedStyles.includes(d.style)) {
    return res.status(400).json({ error: "Please provide valid device and game details." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI key not configured. Local fallback will be used." });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions: `You are a cautious gaming settings assistant. Suggest a reasonable Free Fire sensitivity starting profile based on the player's device and preferences. Sensitivity values must be integers from 0 to 200. Do not claim access to device telemetry or that values are guaranteed optimal. Return ONLY valid JSON with this exact shape:
{"settings":{"General":180,"Red Dot":170,"2x Scope":155,"4x Scope":140,"Sniper Scope":100,"Free Look":185},"advice":"Short practical testing tip"}
Adjust conservatively for lower RAM or FPS and for the requested play style. The six keys must always be present.`,
      input: JSON.stringify({
        brand: String(d.brand).slice(0, 40),
        model: String(d.model).slice(0, 80),
        ram: String(d.ram),
        storage: String(d.storage),
        game: d.game === "max" ? "Free Fire MAX" : "Free Fire",
        style: String(d.style),
        fps: String(d.fps || "unknown"),
        controls: String(d.controls || "2"),
        dpi: d.dpi ? String(d.dpi) : "unknown"
      }),
      max_output_tokens: 350
    });
    let raw = response.output_text || "";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw);
    const names = ["General", "Red Dot", "2x Scope", "4x Scope", "Sniper Scope", "Free Look"];
    const settings = {};
    for (const name of names) {
      const value = Number(parsed.settings?.[name]);
      if (!Number.isFinite(value)) throw new Error("Missing setting");
      settings[name] = Math.max(0, Math.min(200, Math.round(value)));
    }
    res.json({ settings, advice: String(parsed.advice || "Test in Training Mode and adjust one setting at a time.").slice(0, 400) });
  } catch (err) {
    console.error("Sensitivity generation failed:", err.message);
    res.status(502).json({ error: "AI generation failed. Please try again." });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`KAZIYA Sensitivity AI running at http://localhost:${port}`));
