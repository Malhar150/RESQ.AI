// @ts-nocheck
/*
 * DEMO ONLY — a verbatim copy of the rule engine in the backend's
 * lib/classify.js (the AI-provider half removed), so the in-browser demo
 * classifies reports exactly the way the real server does with no API key.
 * The real app never loads this file.
 */
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

