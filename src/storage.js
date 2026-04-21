// src/storage.js
// localStorage helper (backend yoxdur)
// DEV-ONLY admin dəyişiklikləri üçün menu modelini saxlayır: { sections: [...] }

"use strict";

const STORAGE_KEY = "go_sushi_menu_v1";

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} title
 * @property {string} ingredients
 * @property {number} price
 * @property {string} imageUrl
 *
 * @typedef {Object} MenuSection
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {MenuItem[]} items
 *
 * @typedef {Object} MenuData
 * @property {MenuSection[]} sections
 */

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function toMoneyNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function makeId(prefix = "id") {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Normalize + validate whole menu object
 * @param {any} input
 * @returns {MenuData}
 */
function normalizeMenu(input) {
  const out = { sections: [] };

  if (!input || typeof input !== "object") return out;

  const sections = Array.isArray(input.sections) ? input.sections : [];
  out.sections = sections
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const secId = isNonEmptyString(s.id) ? s.id.trim() : makeId("section");
      const title = isNonEmptyString(s.title) ? s.title.trim() : "Bölmə";
      const subtitle = isNonEmptyString(s.subtitle) ? s.subtitle.trim() : "";

      const items = Array.isArray(s.items) ? s.items : [];
      const normalizedItems = items
        .filter((i) => i && typeof i === "object")
        .map((i) => {
          const itemId = isNonEmptyString(i.id) ? i.id.trim() : makeId("item");
          const itemTitle = isNonEmptyString(i.title) ? i.title.trim() : "Məhsul";
          const ingredients = isNonEmptyString(i.ingredients) ? i.ingredients.trim() : "";
          const price = toMoneyNumber(i.price);
          const imageUrl = isNonEmptyString(i.imageUrl) ? i.imageUrl.trim() : "";

          return { id: itemId, title: itemTitle, ingredients, price, imageUrl };
        });

      return { id: secId, title, subtitle, items: normalizedItems };
    });

  return out;
}

/**
 * Export üçün stabil (canonical) JSON string qaytarır.
 * app.js-də S.exportMenuJSON(effectiveMenu) kimi istifadə edəcəksən.
 * @param {MenuData} menu
 * @returns {string}
 */
function exportMenuJSON(menu) {
  const normalized = normalizeMenu(menu);
  return JSON.stringify(normalized, null, 2);
}

/**
 * localStorage-dan menu override oxu (dev-only).
 * Əgər yoxdursa null qaytarır (deməli JSON-dan gələn default menu işləsin).
 * @returns {MenuData|null}
 */
function loadMenuOverride() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = safeParseJSON(raw);
  if (!parsed) return null;

  const normalized = normalizeMenu(parsed);
  return normalized;
}

/**
 * Menu override yaz (tam obyekt).
 * @param {MenuData} menu
 */
function saveMenuOverride(menu) {
  const normalized = normalizeMenu(menu);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

/**
 * Override-u təmizlə (yenidən menu.json default-a qayıtsın)
 */
function clearMenuOverride() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Default menu + override merge (override varsa onu üstün tuturuq)
 * Qeyd: "override full replace" — admin edəndə local menu ilə işləyirik.
 * @param {MenuData} defaultMenu
 * @returns {MenuData}
 */
function getEffectiveMenu(defaultMenu) {
  const base = normalizeMenu(defaultMenu);
  const override = loadMenuOverride();
  return override ? override : base;
}

/**
 * Bölmə əlavə et (override üzərində işləyir)
 * @param {MenuData} currentMenu
 * @param {{title:string, subtitle:string}} payload
 * @returns {MenuData}
 */
function addSection(currentMenu, payload) {
  const menu = normalizeMenu(currentMenu);

  const title = isNonEmptyString(payload?.title) ? payload.title.trim() : "Yeni Bölmə";
  const subtitle = isNonEmptyString(payload?.subtitle) ? payload.subtitle.trim() : "";

  const section = {
    id: makeId("section"),
    title,
    subtitle,
    items: [],
  };

  menu.sections.push(section);
  saveMenuOverride(menu);
  return menu;
}

/**
 * Bölmə sil (override üzərində işləyir)
 * @param {MenuData} currentMenu
 * @param {string} sectionId
 * @returns {MenuData}
 */
function removeSection(currentMenu, sectionId) {
  const menu = normalizeMenu(currentMenu);
  const id = String(sectionId || "").trim();
  menu.sections = menu.sections.filter((s) => s.id !== id);
  saveMenuOverride(menu);
  return menu;
}

/**
 * Seçilmiş bölməyə item əlavə et (override üzərində işləyir)
 * @param {MenuData} currentMenu
 * @param {string} sectionId
 * @param {{title:string, ingredients:string, price:number, imageUrl:string}} itemPayload
 * @returns {MenuData}
 */
function addItemToSection(currentMenu, sectionId, itemPayload) {
  const menu = normalizeMenu(currentMenu);
  const secId = String(sectionId || "").trim();

  const section = menu.sections.find((s) => s.id === secId);
  if (!section) return menu;

  const item = {
    id: makeId("item"),
    title: isNonEmptyString(itemPayload?.title) ? String(itemPayload.title).trim() : "Yeni Məhsul",
    ingredients: isNonEmptyString(itemPayload?.ingredients) ? String(itemPayload.ingredients).trim() : "",
    price: toMoneyNumber(itemPayload?.price),
    imageUrl: isNonEmptyString(itemPayload?.imageUrl) ? String(itemPayload.imageUrl).trim() : "",
  };

  // UI-də ən üstə çıxsın deyə unshift
  section.items.unshift(item);

  saveMenuOverride(menu);
  return menu;
}

/**
 * Item update (EDIT) — override üzərində işləyir
 * app.js: S.updateItemInSection(effectiveMenu, sectionId, itemId, patch)
 *
 * @param {MenuData} currentMenu
 * @param {string} sectionId
 * @param {string} itemId
 * @param {{title?:string, ingredients?:string, price?:number, imageUrl?:string, sectionId?:string}} patch
 * @returns {MenuData}
 */
function updateItemInSection(currentMenu, sectionId, itemId, patch) {
  const menu = normalizeMenu(currentMenu);
  const secId = String(sectionId || "").trim();
  const itId = String(itemId || "").trim();

  const section = menu.sections.find((s) => s.id === secId);
  if (!section) return menu;

  const idx = section.items.findIndex((i) => i.id === itId);
  if (idx === -1) return menu;

  const current = section.items[idx];

  const next = {
    ...current,
    title: isNonEmptyString(patch?.title) ? String(patch.title).trim() : current.title,
    ingredients: isNonEmptyString(patch?.ingredients) ? String(patch.ingredients).trim() : current.ingredients,
    price: patch?.price !== undefined ? toMoneyNumber(patch.price) : current.price,
    imageUrl: isNonEmptyString(patch?.imageUrl) ? String(patch.imageUrl).trim() : current.imageUrl,
  };

  section.items[idx] = next;

  saveMenuOverride(menu);
  return menu;
}

/**
 * Item sil (override üzərində işləyir)
 * @param {MenuData} currentMenu
 * @param {string} sectionId
 * @param {string} itemId
 * @returns {MenuData}
 */
function removeItemFromSection(currentMenu, sectionId, itemId) {
  const menu = normalizeMenu(currentMenu);
  const secId = String(sectionId || "").trim();
  const itId = String(itemId || "").trim();

  const section = menu.sections.find((s) => s.id === secId);
  if (!section) return menu;

  section.items = section.items.filter((i) => i.id !== itId);

  saveMenuOverride(menu);
  return menu;
}

/* -------------------------------------------------------
   Expose helpers to app.js (no bundler; plain script tags)
-------------------------------------------------------- */
window.GoSushiStorage = {
  // core
  normalizeMenu,
  getEffectiveMenu,
  loadMenuOverride,
  saveMenuOverride,
  clearMenuOverride,
  exportMenuJSON,

  // mutations
  addSection,
  removeSection,
  addItemToSection,
  updateItemInSection, // ✅ NEW
  removeItemFromSection,
};
