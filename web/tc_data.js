/** Loading of tag CSV files, aliases, translations, extras and chants. */

import { CFG, state } from "./tc_config.js";
import { getJSON, getText, postJSON } from "./tc_env.js";
import { parseCSV } from "./tc_util.js";

function fileURL(name) {
  return `/tagcomplete/file?name=${encodeURIComponent(name)}`;
}

/** Load and parse the main tag file (cached per file name). */
export async function ensureTagFile(name = CFG.tagFile, force = false) {
  if (!name || name === "None") {
    state.allTags = [];
    state.allTagsLoaded = true;
    return state.allTags;
  }
  if (!force && state.tagFileCache.has(name)) {
    state.allTags = state.tagFileCache.get(name);
    state.allTagsLoaded = true;
    return state.allTags;
  }
  if (state.tagFileLoading && !force) {
    return state.tagFileLoading;
  }

  state.tagFileLoading = (async () => {
    const text = await getText(fileURL(name));
    const rows = parseCSV(text);
    const tags = [];
    for (const row of rows) {
      if (!row || !row[0]) continue;
      const tagName = row[0].trim();
      if (!tagName) continue;
      const aliases = row[3] === undefined ? "" : row[3];
      tags.push([
        tagName,
        row[1] === undefined ? 0 : row[1],
        row[2] === undefined ? Number.MAX_SAFE_INTEGER : row[2],
        aliases,
        tagName.toLowerCase(),
        String(aliases || "").toLowerCase(),
      ]);
    }
    state.tagFileCache.set(name, tags);
    state.allTags = tags;
    state.allTagsLoaded = true;
    return tags;
  })();

  try {
    return await state.tagFileLoading;
  } finally {
    state.tagFileLoading = null;
  }
}

const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * True when the translation file is basically a Chinese dictionary. Only then
 * can `searchTagList` skip translation lookups for pure ASCII queries.
 */
function isCJKDominant(map) {
  if (!map.size) return false;
  let checked = 0;
  let cjk = 0;
  for (const value of map.values()) {
    checked++;
    if (CJK_CHAR.test(String(value))) cjk++;
    if (checked >= 200) break;
  }
  return cjk / checked >= 0.9;
}

/** Load the translation file into `state.translations` (a Map). */
export async function ensureTranslations(name = CFG.translationFile, oldFormat = CFG.translationOldFormat) {
  state.translations = new Map();
  if (!name || name === "None") {
    state.translationsAreCJK = false;
    return state.translations;
  }

  const cacheKey = `${name}|${oldFormat ? "old" : "new"}`;
  let rows = state.translationCache.get(cacheKey);
  if (!rows) {
    rows = parseCSV(await getText(fileURL(name)));
    state.translationCache.set(cacheKey, rows);
  }

  const map = new Map();
  for (const row of rows) {
    if (!row || !row[0]) continue;
    if (oldFormat && row[2]) map.set(row[0], row[2]);
    else if (row[1]) map.set(row[0], row[1]);
    else map.set(row[0], "Not found");
  }
  state.translations = map;
  state.translationsAreCJK = isCJKDominant(map);
  return map;
}

/** Load the extra (custom) tag file. */
export async function ensureExtras(name = CFG.extraFile) {
  state.extras = [];
  if (!name || name === "None") return state.extras;

  let rows = state.extraCache.get(name);
  if (!rows) {
    rows = parseCSV(await getText(fileURL(name)));
    state.extraCache.set(name, rows);
  }
  const extras = [];
  for (const row of rows) {
    if (!row || !row[0]) continue;
    const tagName = row[0].trim();
    if (!tagName) continue;
    extras.push([
      tagName,
      row[1] === undefined || row[1] === "" ? 0 : row[1],
      row[2] || "Custom tag",
      row[3] || "",
      row[4] || "",
      tagName.toLowerCase(),
      String(row[3] || "").toLowerCase(),
    ]);
    if (row[4]) state.translations.set(tagName, row[4]);
  }
  state.extras = extras;
  return extras;
}

/** Load chant presets (long prompt snippets). */
export async function ensureChants(name = CFG.chantFile) {
  state.chants = [];
  if (!name || name === "None") return state.chants;

  let chants = state.chantCache.get(name);
  if (!chants) {
    try {
      const data = await getJSON(fileURL(name));
      chants = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("[TagComplete] could not load chant file:", error);
      chants = [];
    }
    state.chantCache.set(name, chants);
  }
  state.chants = chants;
  return chants;
}

/** All data that depends on the selected files. */
export async function loadFileDependentData({ force = false } = {}) {
  /* translations first, extra tags add their translations to the same map */
  await ensureTranslations(CFG.translationFile, CFG.translationOldFormat);
  await ensureExtras(CFG.extraFile);
  await Promise.all([ensureTagFile(CFG.tagFile, force), ensureChants(CFG.chantFile)]);
}

/** Re-scan the library on the server and refresh the cached lists. */
export async function refreshLibrary() {
  const response = await postJSON("/tagcomplete/refresh", {});
  const data = response?.data;
  if (data) {
    const { applyServerData } = await import("./tc_config.js");
    applyServerData(data);
  }
  return data;
}

export async function fetchModelInfo(kind, name) {
  const key = `${kind}:${name}`;
  if (state.modelInfoCache.has(key)) return state.modelInfoCache.get(key);
  let info = null;
  try {
    info = await getJSON(`/tagcomplete/model-info?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`);
  } catch {
    info = null;
  }
  state.modelInfoCache.set(key, info || {});
  return info || {};
}

export async function fetchModelKeywords(kind, name) {
  const key = `${kind}:${name}`;
  if (state.keywordCache.has(key)) return state.keywordCache.get(key);
  let keywords = null;
  try {
    const response = await getJSON(
      `/tagcomplete/model-keywords?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    );
    keywords = response?.keywords ?? null;
  } catch {
    keywords = null;
  }
  state.keywordCache.set(key, keywords);
  return keywords;
}

/* ------------------------------------------------------------------------- *
 * Usage counts
 *
 * The table is small (a few thousand rows at most), so it is fetched once and
 * kept in memory. Every keystroke used to fire a request with up to 2000
 * lookups that the server answered one SELECT at a time.
 * ------------------------------------------------------------------------- */
export function usageKey(name, type) {
  return `${name}\u0000${type}`;
}

export async function loadUsageMap() {
  state.usageMap.clear();
  try {
    const response = await getJSON("/tagcomplete/frequency/all");
    for (const [name, type, pos, neg, lastUsed] of response?.result || []) {
      state.usageMap.set(usageKey(name, type), {
        pos: parseInt(pos, 10) || 0,
        neg: parseInt(neg, 10) || 0,
        last: lastUsed || "",
      });
    }
  } catch {
    state.usageMap.clear();
  }
  return state.usageMap;
}

/** Usage count of one result, honouring the "max age" setting (0 = no limit). */
export function usageCount(name, type, negative) {
  const entry = state.usageMap.get(usageKey(name, type));
  if (!entry) return 0;
  const maxAge = parseInt(CFG.frequencyMaxAge, 10) || 0;
  /* sqlite writes UTC "YYYY-MM-DD HH:MM:SS"; lexicographic compare is enough */
  if (maxAge > 0 && entry.last) {
    const cutoff = new Date(Date.now() - maxAge * 86400000).toISOString().slice(0, 19).replace("T", " ");
    if (entry.last < cutoff) return 0;
  }
  return negative ? entry.neg : entry.pos;
}

export function bumpUsage(name, type, negative) {
  const key = usageKey(name, type);
  const entry = state.usageMap.get(key) || { pos: 0, neg: 0, last: "" };
  if (negative) entry.neg += 1;
  else entry.pos += 1;
  entry.last = new Date().toISOString().slice(0, 19).replace("T", " ");
  state.usageMap.set(key, entry);
}

export function clearUsage(name, type, positive = true, negative = true) {
  const entry = state.usageMap.get(usageKey(name, type));
  if (!entry) return;
  if (positive) entry.pos = 0;
  if (negative) entry.neg = 0;
}
