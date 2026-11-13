/** Default configuration and the runtime state shared by all modules. */

import { deepMerge, getByPath, setByPath } from "./tc_util.js";
import { getJSON, postJSON } from "./tc_env.js";

export const KEYMAP_DEFAULT = {
  MoveUp: "ArrowUp",
  MoveDown: "ArrowDown",
  JumpUp: "PageUp",
  JumpDown: "PageDown",
  JumpToStart: "Home",
  JumpToEnd: "End",
  ChooseSelected: "Enter",
  ChooseFirstOrSelected: "Tab",
  Close: "Escape",
};

export const COLORMAP_DEFAULT = {
  danbooru: {
    "-1": ["red", "maroon"],
    0: ["lightblue", "dodgerblue"],
    1: ["indianred", "firebrick"],
    3: ["violet", "darkorchid"],
    4: ["lightgreen", "darkgreen"],
    5: ["orange", "darkorange"],
  },
  e621: {
    "-1": ["red", "maroon"],
    0: ["lightblue", "dodgerblue"],
    1: ["gold", "goldenrod"],
    3: ["violet", "darkorchid"],
    4: ["lightgreen", "darkgreen"],
    5: ["tomato", "darksalmon"],
    6: ["red", "maroon"],
    7: ["whitesmoke", "black"],
    8: ["seagreen", "darkseagreen"],
  },
  derpibooru: {
    "-1": ["red", "maroon"],
    0: ["#60d160", "#3d9d3d"],
    1: ["#fff956", "#918e2e"],
    3: ["#fd9961", "#a14c2e"],
    4: ["#cf5bbe", "#6c1e6c"],
    5: ["#3c8ad9", "#1e5e93"],
    6: ["#a6a6a6", "#555555"],
    7: ["#47abc1", "#1f6c7c"],
    8: ["#7871d0", "#392f7d"],
    9: ["#df3647", "#8e1c2b"],
    10: ["#c98f2b", "#7b470e"],
    11: ["#e87ebe", "#a83583"],
  },
  danbooru_e621_merged: {
    "-1": ["red", "maroon"],
    0: ["lightblue", "dodgerblue"],
    1: ["indianred", "firebrick"],
    3: ["violet", "darkorchid"],
    4: ["lightgreen", "darkgreen"],
    5: ["orange", "darkorange"],
    6: ["red", "maroon"],
    7: ["lightblue", "dodgerblue"],
    8: ["gold", "goldenrod"],
    9: ["gold", "goldenrod"],
    10: ["violet", "darkorchid"],
    11: ["lightgreen", "darkgreen"],
    12: ["tomato", "darksalmon"],
    14: ["whitesmoke", "black"],
    15: ["seagreen", "darkseagreen"],
  },
};

export const DEFAULT_CFG = {
  /* data sources - defaults mirror the A1111 setup (merged danbooru+e621 + Chinese) */
  tagFile: "danbooru_e621_merged.csv",
  translationFile: "danbooru_e621_merged_CNv4.csv",
  translationOldFormat: false,
  extraFile: "extra-quality-tags.csv",
  extraAddMode: "Insert before",
  chantFile: "demo-chants.json",

  /* where completion is active */
  enabled: true,
  activeNodes: "clip",
  nodeList: "",
  activeInNegative: true,

  /* results */
  slidingPopup: true,
  maxResults: 5,
  showAllResults: false,
  resultStepLength: 100,
  delayTime: 100,
  showWikiLinks: false,
  showExtraNetworkPreviews: true,
  modelSortOrder: "Name",

  /* popup appearance (the shipped default config uses 1.45) */
  popupWidth: 420,
  popupRowHeight: 30,
  popupFontSize: 13,
  popupScale: 1.45,

  /* tag-likes */
  useEmbeddings: true,
  includeEmbeddingsInNormalResults: false,
  embeddingInsertFormat: "embedding:name",
  useHypernetworks: false,
  useLoras: true,
  useLycos: false,
  useLoraPrefixForLycos: true,
  useStyleVars: false,

  /* insertion */
  replaceUnderscores: true,
  replaceUnderscoresExclusionList:
    "0_0,(o)_(o),+_+,+_-,._.,<o>_<o>,<|>_<|>,=_=,>_<,3_3,6_9,>_o,@_@,^_^,o_o,u_u,x_x,|_|,||_||",
  escapeParentheses: true,
  appendComma: true,
  appendSpace: true,
  alwaysSpaceAtEnd: true,
  artistAtTrigger: false,
  artistInsertAt: false,
  modelKeywordCompletion: "Never",
  modelKeywordLocation: "Start of prompt",
  extraNetworksDefaultMultiplier: 1,
  extraNetworksSeparator: " ",

  /* alias + translation */
  alias: { searchByAlias: true, onlyShowAlias: false },
  translation: { searchByTranslation: true, liveTranslation: false },

  /* usage based sorting */
  frequencySort: true,
  frequencyFunction: "Logarithmic (weak)",
  frequencyMinCount: 3,
  frequencyMaxAge: 30,

  /* advanced */
  keymap: { ...KEYMAP_DEFAULT },
  colorMap: { ...COLORMAP_DEFAULT },
  disableConflictingAutocomplete: true,
};

/** Result types (same numbering/order as the A1111 extension). */
export const ResultType = Object.freeze({
  tag: 1,
  extra: 2,
  embedding: 3,
  hypernetwork: 8,
  lora: 9,
  lyco: 10,
  chant: 11,
  styleName: 12,
});

export class AutocompleteResult {
  constructor(text, type) {
    this.text = text;
    this.type = type;
    this.category = null;
    this.count = Number.MAX_SAFE_INTEGER;
    this.usageBias = null;
    this.aliases = null;
    this.meta = null;
    this.hash = null;
    this.sortKey = null;
  }
}

/** Live configuration (merged defaults + server settings). */
export const CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));

/** Mutable runtime state: loaded tag data, current match state, caches. */
export const state = {
  /* loaded data */
  allTags: [],
  allTagsLoaded: false,
  tagFileLoading: null,
  translations: new Map(),
  translationsAreCJK: false,
  extras: [],
  embeddings: [],
  hypernets: [],
  loras: [],
  lycos: [],
  chants: [],
  styles: [],
  files: { csv: [], json: [] },
  folders: {},
  dataLoaded: false,
  serverSettings: {},

  /* parsing state */
  tagword: "",
  originalTagword: "",
  results: [],
  resultCount: 0,
  resultCountBeforeNormalTags: 0,
  selected: null,
  oldSelected: null,
  hideBlocked: false,
  selfTrigger: false,

  /* lora keyword undo support */
  textBeforeKeywordInsertion: "",
  textAfterKeywordInsertion: "",
  lastEditWasKeywordInsertion: false,
  keywordInsertionUndone: false,

  /* caches */
  tagFileCache: new Map(),
  translationCache: new Map(),
  extraCache: new Map(),
  chantCache: new Map(),
  keywordCache: new Map(),
  modelInfoCache: new Map(),
  /* usage counts, loaded once and kept current on the fly: `${name}\0${type}` -> {pos, neg, last} */
  usageMap: new Map(),
};

const configListeners = new Set();

/** Subscribe to configuration changes made through applyConfig(). */
export function onConfigChanged(listener) {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

export function applyConfig(patch, { persist = true } = {}) {
  const merged = deepMerge(CFG, patch || {});
  for (const key of Object.keys(merged)) CFG[key] = merged[key];
  if (patch && typeof patch === "object") {
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes(".")) setByPath(CFG, key, value);
    }
  }
  for (const listener of configListeners) {
    try {
      listener(CFG, patch);
    } catch (error) {
      console.warn("[TagComplete] config listener failed", error);
    }
  }
  if (persist) {
    postJSON("/tagcomplete/settings", CFG).catch(() => {
      /* offline / read only - keep the in-memory value */
    });
  }
  return CFG;
}

export function cfgGet(path, fallback = undefined) {
  return getByPath(CFG, path, fallback);
}

export async function loadServerConfig() {
  try {
    const [settings, data] = await Promise.all([
      getJSON("/tagcomplete/settings"),
      getJSON("/tagcomplete/data"),
    ]);
    if (settings && typeof settings === "object") {
      state.serverSettings = settings;
      const merged = deepMerge(DEFAULT_CFG, settings);
      for (const key of Object.keys(merged)) CFG[key] = merged[key];
    }
    if (data && typeof data === "object") applyServerData(data);
    return { settings, data };
  } catch (error) {
    console.error("[TagComplete] could not load server configuration:", error);
    return {};
  }
}

export function applyServerData(data) {
  state.files = data.files || { csv: [], json: [] };
  state.folders = data.folders || {};
  state.embeddings = Array.isArray(data.embeddings) ? data.embeddings : [];
  state.loras = Array.isArray(data.loras) ? data.loras : [];
  state.lycos = Array.isArray(data.lycos) ? data.lycos : [];
  state.hypernets = Array.isArray(data.hypernetworks) ? data.hypernetworks : [];
  state.styles = Array.isArray(data.styles) ? data.styles : [];
  state.dataLoaded = true;
}
