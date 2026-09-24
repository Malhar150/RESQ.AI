/**
 * Severity classification for incoming hazard reports.
 *
 * Two engines, same output shape:
 *
 *   1. AI engine  — used when GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
 *                   is set. Understands full sentences in any language.
 *   2. Rule engine — always available. A weighted multilingual lexicon covering
 *                   English, Hindi, Assamese, Bengali and romanised typing.
 *                   Costs nothing, needs no network, never fails.
 *
 * The AI engine is given a short timeout. If the API is slow, down, or returns
 * something unparseable, we fall back to the rule engine rather than making a
 * citizen wait or losing the report. During a live demo that matters more than
 * squeezing out the last bit of accuracy.
 */

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 6000);

export const SEVERITIES = ["low", "medium", "high"];
export const HAZARD_TYPES = [
  "flood",
  "landslide",
  "storm",
  "earthquake",
  "fire",
  "building_collapse",
  "medical",
  "infrastructure",
  "other",
];

/* -------------------------------------------------------------------------
 * Language detection (by script — cheap and reliable for our four languages)
 * ---------------------------------------------------------------------- */

export function detectLanguage(text = "") {
  if (/[ऀ-ॿ]/.test(text)) return "hi"; // Devanagari -> Hindi
  if (/[ঀ-৿]/.test(text)) {
    // Assamese shares the Bengali block but has two letters Bengali lacks:
    // ৰ (U+09F0) and ৱ (U+09F1).
    return /[ৰৱ]/.test(text) ? "as" : "bn";
  }
  if (/[਀-੿]/.test(text)) return "pa";
  if (/[଀-୿]/.test(text)) return "or";
  return "en";
}

/* -------------------------------------------------------------------------
 * Rule engine lexicon
 *
 * Weights, not first-match. A report saying "water is rising and my neighbour
 * is trapped on the roof" should score as high, not stop at "rising water".
 * ---------------------------------------------------------------------- */

// Life is in immediate danger.
const CRITICAL = [
  // English
  "trapped", "drowning", "drowned", "swept away", "washed away", "buried",
  "collapsed", "collapse", "dying", "dead body", "bodies", "casualt",
  "electrocut", "stranded on roof", "cannot breathe", "unconscious",
  "bleeding", "missing person", "missing child", "no food", "no drinking water",
  "critical", "life threatening", "sos", "rescue us", "save us", "help us",
  // Hindi
  "फंसे", "फँसे", "डूब", "बह गया", "बह गये", "मलबे", "दब गए", "मर गया",
  "मौत", "लाश", "बचाओ", "जान बचाओ", "गंभीर",
  // Assamese / Bengali
  "আবদ্ধ", "ডুব", "উটুৱাই", "ভাঙি পৰিছে", "মৃত", "মৃত্যু", "উদ্ধাৰ", "উদ্ধার",
  "বাঁচান", "সাহায্য কৰক", "ভেসে গেছে", "চাপা পড়",
  // Romanised
  "phase hue", "fase hue", "doob", "dub gaya", "bachao", "madad karo",
  "mrityu", "uddhar", "rescue koro",
];

// Situation is escalating; action needed soon.
const SERIOUS = [
  // English
  "rising water", "water rising", "water level", "breach", "embankment",
  "evacuate", "evacuation", "landslide", "mudslide", "road cut off",
  "bridge damaged", "crack", "cracks", "flooded house", "houses flooded",
  "power cut", "no electricity", "no network", "injured", "hurt",
  "cattle", "livestock lost", "crops destroyed", "shelter needed",
  "medicine needed", "pregnant", "elderly", "children",
  // Hindi
  "पानी बढ़", "जलस्तर", "तटबंध", "बांध", "दरार", "भूस्खलन", "पहाड़ खिसक",
  "सड़क बंद", "पुल", "घायल", "बिजली नहीं", "निकालो", "राहत",
  // Assamese / Bengali
  "পানী বাঢ়", "জলস্তৰ", "গৰাখহনীয়া", "বান", "বন্যা", "ভূমিস্খলন",
  "পথ বন্ধ", "আহত", "বিদ্যুৎ নাই", "ত্ৰাণ", "ত্রাণ", "বাঁধ",
  // Romanised
  "pani barh", "pani baris", "bandh toot", "raasta band", "ghayal", "rahat",
];

// Reported for awareness.
const MINOR = [
  "waterlogging", "water logging", "logged", "drizzle", "light rain",
  "minor", "small", "slippery", "garbage", "blocked drain", "smell",
  "जलभराव", "हल्की बारिश", "मामूली", "নলা", "সামান্য", "লঘু",
];

// Words that raise whatever score we already have.
const AMPLIFIERS = [
  "many", "several", "dozens", "hundreds", "whole village", "entire village",
  "school", "hospital", "children", "baby", "infant", "disabled",
  "बहुत", "कई", "पूरा गाँव", "स्कूल", "अस्पताल", "बच्चे",
  "বহুতো", "গোটেই গাঁও", "স্কুল", "হাস্পতাল", "শিশু",
];

// Phrases that mean the danger has passed / is denied.
const NEGATORS = [
  "no one trapped", "nobody trapped", "no injuries", "no casualt",
  "all safe", "everyone safe", "rescued already", "water receded",
  "situation normal", "false alarm", "no damage",
  "कोई नहीं फंसा", "सब सुरक्षित", "पानी उतर", "कोई नुकसान नहीं",
  "সকলো নিৰাপদ", "পানী কমি", "কোনো ক্ষতি নাই",
];

const HAZARD_PATTERNS = [
  [/flood|inundat|बाढ़|बान|বন্যা|প্লাবন|baadh|bonya|water.*(rising|entered)/i, "flood"],
  [/landslide|mudslide|भूस्खलन|ভূমিস্খলন|পাহাৰ.*খহ|hill.*(slid|collaps)/i, "landslide"],
  [/cyclone|storm|gale|typhoon|तूफ़ान|तूफान|आंधी|ঘূৰ্ণীবতাহ|ঝড়|toofan/i, "storm"],
  [/earthquake|tremor|भूकंप|ভূমিকম্প|bhukamp/i, "earthquake"],
  [/fire|burning|blaze|आग|अग्नि|জুই|আগুন|aag/i, "fire"],
  [/building collapse|house collapsed|wall collapsed|इमारत|मकान गिर|ঘৰ ভাঙি|বাড়ি ভেঙে/i, "building_collapse"],
  [/injur|bleeding|hospital|ambulance|medicine|घायल|अस्पताल|दवा|আহত|হাস্পতাল|ঔষধ/i, "medical"],
  [/road|bridge|embankment|power|electricity|network|सड़क|पुल|तटबंध|बिजली|পথ|দলং|বিদ্যুৎ/i, "infrastructure"],
];

function countHits(haystack, list) {
  let n = 0;
  const matched = [];
  for (const word of list) {
    if (haystack.includes(word.toLowerCase())) {
      n += 1;
      matched.push(word);
    }
  }
  return { n, matched };
}

/**
 * Weighted keyword scoring. Returns the same shape as the AI engine.
 */
export function classifyWithRules(text = "") {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  const critical = countHits(lower, CRITICAL);
  const serious = countHits(lower, SERIOUS);
  const minor = countHits(lower, MINOR);
  const amp = countHits(lower, AMPLIFIERS);
  const neg = countHits(lower, NEGATORS);

  // Base score out of 100.
  let score =
    critical.n * 45 +
    serious.n * 18 +
    minor.n * 4 +
    amp.n * 7 -
    neg.n * 40;

  // "12 people are stuck" — an explicit headcount is a strong signal.
  const headcount = raw.match(/\b(\d{1,4})\s*(people|persons|families|log|লোক|জন|व्यक्ति|परिवार)\b/i);
  if (headcount) {
    const n = Number(headcount[1]);
    if (n >= 50) score += 25;
    else if (n >= 10) score += 15;
    else if (n >= 1) score += 8;
  }

  // Shouting is weak evidence of urgency, but it is evidence.
  const letters = raw.replace(/[^A-Za-z]/g, "");
  if (letters.length > 12 && letters === letters.toUpperCase()) score += 5;

  score = Math.max(0, Math.min(100, score));

  let severity = "low";
  if (score >= 45) severity = "high";
  else if (score >= 16) severity = "medium";

  let hazard_type = "other";
  for (const [pattern, type] of HAZARD_PATTERNS) {
    if (pattern.test(raw)) {
      hazard_type = type;
      break;
    }
  }

  // Confidence reflects how much evidence we actually found, not how loud it was.
  const evidence = critical.n + serious.n + minor.n;
  const confidence = Math.min(0.9, 0.35 + evidence * 0.12);

  const reasons = [];
  if (critical.n) reasons.push(`life-risk terms: ${critical.matched.slice(0, 3).join(", ")}`);
  if (serious.n) reasons.push(`escalation terms: ${serious.matched.slice(0, 3).join(", ")}`);
  if (neg.n) reasons.push(`downgraded by: ${neg.matched.slice(0, 2).join(", ")}`);
  if (headcount) reasons.push(`headcount mentioned: ${headcount[1]}`);
  if (!reasons.length) reasons.push("no strong hazard terms found");

  return {
    severity,
    hazard_type,
    language: detectLanguage(raw),
    confidence: Number(confidence.toFixed(2)),
    model: "rules-v2",
    reasoning: reasons.join("; "),
    score,
  };
}

/* -------------------------------------------------------------------------
 * AI engine
 * ---------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You triage citizen hazard reports for an Indian state disaster management control room (Assam and the North East). Reports arrive in English, Hindi, Assamese, Bengali, or romanised mixtures of these.

Classify the report and reply with ONLY a JSON object, no markdown fence, no commentary:
{"severity":"high|medium|low","hazard_type":"flood|landslide|storm|earthquake|fire|building_collapse|medical|infrastructure|other","language":"ISO 639-1 code","confidence":0.0-1.0,"reasoning":"one short sentence for the duty officer"}

Severity rules:
- high: human life is in immediate danger right now (people trapped, swept away, buried, drowning, critically injured, cut off without water or medicine).
- medium: serious and escalating, property or livelihood at risk, danger likely within hours (water rising, embankment cracking, road or bridge cut, evacuation needed, non-critical injuries).
- low: informational or nuisance-level (waterlogging, minor damage, general observation).

Be conservative in one direction only: if a report plausibly involves someone in danger, prefer the higher severity. A missed rescue costs more than a wasted check. But do not mark high on emotion alone when the text describes no actual danger.`;

function extractJson(raw = "") {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function callGemini(text) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const out = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { parsed: extractJson(out), model: `gemini:${model}` };
}

async function callOpenAI(text) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { parsed: extractJson(json?.choices?.[0]?.message?.content || ""), model: `openai:${model}` };
}

async function callAnthropic(text) {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { parsed: extractJson(json?.content?.[0]?.text || ""), model: `anthropic:${model}` };
}

export function activeProvider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

/**
 * Classify a report. Always resolves — never throws, never blocks forever.
 *
 * @returns {Promise<{severity,hazard_type,language,confidence,model,reasoning}>}
 */
export async function classifyReport(text = "") {
  const fallback = classifyWithRules(text);
  const provider = activeProvider();

  if (!provider || !String(text).trim()) return fallback;

  try {
    const call =
      provider === "gemini" ? callGemini(text)
      : provider === "openai" ? callOpenAI(text)
      : callAnthropic(text);

    const { parsed, model } = await withTimeout(call, AI_TIMEOUT_MS);
    if (!parsed) throw new Error("AI returned no parseable JSON");

    const severity = SEVERITIES.includes(parsed.severity) ? parsed.severity : fallback.severity;
    const hazard_type = HAZARD_TYPES.includes(parsed.hazard_type)
      ? parsed.hazard_type
      : fallback.hazard_type;

    // Safety net: if the rule engine is confident something is life-threatening
    // and the AI disagrees, take the higher of the two. Under-triage is the
    // failure mode that actually hurts people.
    const finalSeverity =
      fallback.severity === "high" && fallback.score >= 60 && severity !== "high"
        ? "high"
        : severity;

    return {
      severity: finalSeverity,
      hazard_type,
      language: parsed.language || fallback.language,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7)),
      model,
      reasoning: String(parsed.reasoning || "").slice(0, 400) ||
        "classified by AI",
    };
  } catch (err) {
    console.warn(`[classify] ${provider} failed, using rule engine: ${err.message}`);
    return { ...fallback, reasoning: `${fallback.reasoning} (AI unavailable)` };
  }
}
