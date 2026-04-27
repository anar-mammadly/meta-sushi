// src/app.js
"use strict";

/* =========================================================
   MetaSushi Menu (Static)
   - fetch menu.json
   - render sections (6 items per printed page)
   - sticky category nav (click + active state on scroll)
   - dev-only admin (localStorage override)
   - export JSON for committing into menu.json
========================================================= */

const DATA_URL = "./data/menu.json";
const ITEMS_PER_PAGE = 6;

// Storage helper (from storage.js)
const S = window.GoSushiStorage;

/* =========================
   DOM
========================= */
const sectionsRoot = document.getElementById("sectionsRoot");

// Admin buttons / modal
const toggleAdminBtn = document.getElementById("toggleAdminBtn");
const addSectionBtn = document.getElementById("addSectionBtn");
const openAddModalBtn = document.getElementById("openAddModalBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");

const modal = document.getElementById("addModal");
const backdrop = document.getElementById("addModalBackdrop");
const closeAddModalBtn = document.getElementById("closeAddModalBtn");
const form = document.getElementById("addProductForm");
const modalTitle = document.querySelector("#addModal h2");
const formSubmitBtn = form?.querySelector('button[type="submit"]');

const sectionSelectWrap = document.getElementById("sectionSelectWrap");
const resetMenuBtn = document.getElementById("resetMenuBtn");

// Cover CTA
const scrollToMenuBtn = document.getElementById("scrollToMenuBtn");

// Sticky nav
const categoryNav = document.getElementById("categoryNav");
const categoryNavInner = document.getElementById("categoryNavInner");

/* =========================
   STATE
========================= */
let defaultMenu = { sections: [] };
let effectiveMenu = { sections: [] };
let __catObserver = null;
let modalMode = "add";
let editingItemRef = null;

/* =========================
   HELPERS
========================= */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyAZN(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0 AZN";
  const shown = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return `${shown} AZN`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makeSectionPageId(sectionId, pageIndex) {
  return pageIndex === 0 ? sectionId : `${sectionId}--p${pageIndex + 1}`;
}

function isAdminHidden() {
  return document.body.classList.contains("no-admin");
}

function downloadTextFile(filename, text, mime = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getItemByIds(sectionId, itemId) {
  const secId = String(sectionId || "").trim();
  const itId = String(itemId || "").trim();
  const section = effectiveMenu.sections.find((s) => s.id === secId);
  if (!section) return null;
  const item = section.items.find((i) => i.id === itId);
  return item || null;
}

function setModalMode(mode, opts = {}) {
  modalMode = mode === "edit" ? "edit" : "add";
  editingItemRef = modalMode === "edit" ? opts : null;

  if (modalTitle) {
    modalTitle.textContent =
      modalMode === "edit" ? "Məhsulu redaktə et" : "Məhsul əlavə et";
  }
  if (formSubmitBtn) {
    formSubmitBtn.textContent = modalMode === "edit" ? "Yenilə" : "Yadda saxla";
  }
  if (resetMenuBtn) {
    resetMenuBtn.classList.toggle("hidden", modalMode === "edit");
  }
}

function fillModalForm(data = {}) {
  if (!form) return;
  const imageInput = form.elements.namedItem("imageUrl");
  const titleInput = form.elements.namedItem("title");
  const ingredientsInput = form.elements.namedItem("ingredients");
  const priceInput = form.elements.namedItem("price");
  const sectionSelect = form.elements.namedItem("sectionId");

  if (imageInput) imageInput.value = String(data.imageUrl ?? "");
  if (titleInput) titleInput.value = String(data.title ?? "");
  if (ingredientsInput) ingredientsInput.value = String(data.ingredients ?? "");
  if (priceInput) priceInput.value = String(data.price ?? "");
  if (sectionSelect && data.sectionId) sectionSelect.value = String(data.sectionId);
}

/* =========================
   FETCH DEFAULT MENU
========================= */
async function loadDefaultMenu() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`menu.json fetch failed: ${res.status}`);
  const data = await res.json();
  return S.normalizeMenu(data);
}

/* =========================
   EFFECTIVE MENU (default or override)
========================= */
function recomputeEffectiveMenu() {
  effectiveMenu = S.getEffectiveMenu(defaultMenu);
}

/* =========================
   RENDER
========================= */
function render() {
  if (!sectionsRoot) return;

  sectionsRoot.innerHTML = "";

  if (!effectiveMenu.sections.length) {
    setupCategoryNav(); // will hide itself when empty
    return;
  }

  effectiveMenu.sections.forEach((section) => {
    const pages = chunk(section.items, ITEMS_PER_PAGE);
    const pagesSafe = pages.length ? pages : [[]];

    pagesSafe.forEach((itemsPage, pageIndex) => {
      const pageSectionId = makeSectionPageId(section.id, pageIndex);

      const sectionEl = document.createElement("section");
      sectionEl.className = "menu-section";
      sectionEl.setAttribute("data-section-id", section.id);
      sectionEl.setAttribute("data-page-index", String(pageIndex));
      sectionEl.id = pageSectionId;

      // Header yalnız 1-ci səhifədə görünsün
      const showHeader = pageIndex === 0;

      sectionEl.innerHTML = `
        ${
          showHeader
            ? `
          <header class="text-center mb-10 relative">
            <div class="flex items-center justify-center gap-4 mb-4">
              <div class="h-[1px] w-8 bg-muted-gold"></div>
              <span class="material-symbols-outlined text-primary text-xl">restaurant_menu</span>
              <div class="h-[1px] w-8 bg-muted-gold"></div>
            </div>

            <h2 class="sectionTitle text-primary text-2xl sm:text-3xl font-bold uppercase tracking-[0.2em] mb-2">
              ${escapeHtml(section.title)}
            </h2>

            <p class="sectionSubtitle text-primary/60 text-[10px] uppercase tracking-widest font-medium">
              ${escapeHtml(section.subtitle)}
            </p>

            <div class="admin-only no-print mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                class="jsRemoveSection inline-flex items-center gap-2 rounded-full border border-muted-gold/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-700 hover:underline"
                data-section-id="${escapeHtml(section.id)}"
                title="Bölməni sil"
              >
                <span class="material-symbols-outlined text-base">delete</span>
                Bölməni sil
              </button>
            </div>
          </header>
        `
            : ""
        }

        <div class="menu-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 print:grid-cols-2 print:gap-x-6 print:gap-y-10"></div>
      `;

      const grid = sectionEl.querySelector(".menu-grid");

      itemsPage.forEach((item) => {
        const card = document.createElement("div");
        card.className = "menu-card flex flex-col";

        const imageUrl = escapeHtml(item.imageUrl);
        const title = escapeHtml(item.title);
        const ingredients = escapeHtml(item.ingredients);

        card.innerHTML = `
          <div class="rounded-xl sm:rounded-2xl bg-white dark:bg-menu-charcoal/40 border border-primary/10 shadow-sm hover:shadow-lg transition-shadow duration-300 overflow-hidden flex flex-col h-full print:rounded-lg print:shadow-none print:border-primary/5">
            <div
              class="w-full aspect-square bg-center bg-no-repeat bg-cover"
              style="background-image:url('${imageUrl}')"
            ></div>

            <div class="p-2.5 sm:p-4 flex-1 flex flex-col print:p-2">
              <h3 class="text-menu-charcoal dark:text-white text-[13px] sm:text-base font-bold leading-tight mb-1 sm:mb-2 print:text-sm print:mb-1">
                ${title}
              </h3>

              <p class="text-menu-charcoal/70 dark:text-white/70 text-[10px] sm:text-xs leading-relaxed italic flex-1 print:text-[11px]">
                ${ingredients}
              </p>

              <p class="text-primary font-extrabold text-base sm:text-xl mt-2 sm:mt-3 print:text-sm print:mt-1">
                ${moneyAZN(item.price)}
              </p>
            </div>
          </div>

          <div class="admin-only no-print mt-2 flex items-center gap-3">
            <button
              type="button"
              class="jsEditItem text-[10px] uppercase tracking-widest text-primary hover:underline"
              data-section-id="${escapeHtml(section.id)}"
              data-item-id="${escapeHtml(item.id)}"
            >
              Edit
            </button>
            <button
              type="button"
              class="jsDeleteItem text-[10px] uppercase tracking-widest text-red-600 hover:underline"
              data-section-id="${escapeHtml(section.id)}"
              data-item-id="${escapeHtml(item.id)}"
            >
              Sil
            </button>
          </div>
        `;

        grid.appendChild(card);
      });

      sectionsRoot.appendChild(sectionEl);
    });
  });

  wireDynamicButtons();
  renderSectionSelectInModal();
  setupCategoryNav();
}

function wireDynamicButtons() {
  // Edit item buttons
  sectionsRoot.querySelectorAll(".jsEditItem").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isAdminHidden()) return;

      const sectionId = btn.getAttribute("data-section-id");
      const itemId = btn.getAttribute("data-item-id");
      const current = getItemByIds(sectionId, itemId);
      if (!current) return;
      setModalMode("edit", { sectionId, itemId });
      fillModalForm({
        sectionId,
        imageUrl: current.imageUrl,
        title: current.title,
        ingredients: current.ingredients,
        price: current.price,
      });
      openModal();
    });
  });

  // Delete item buttons
  sectionsRoot.querySelectorAll(".jsDeleteItem").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isAdminHidden()) return;

      const sectionId = btn.getAttribute("data-section-id");
      const itemId = btn.getAttribute("data-item-id");

      effectiveMenu = S.removeItemFromSection(effectiveMenu, sectionId, itemId);
      recomputeEffectiveMenu();
      render();
    });
  });

  // Remove section buttons
  sectionsRoot.querySelectorAll(".jsRemoveSection").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isAdminHidden()) return;

      const sectionId = btn.getAttribute("data-section-id");
      const ok = confirm("Bu bölməni silmək istədiyinizə əminsiniz?");
      if (!ok) return;

      effectiveMenu = S.removeSection(effectiveMenu, sectionId);
      recomputeEffectiveMenu();
      render();
    });
  });
}

/* =========================
   STICKY CATEGORY NAV
========================= */
function setupCategoryNav() {
  if (!categoryNav || !categoryNavInner) return;

  // Disconnect previous observer if any
  if (__catObserver) {
    __catObserver.disconnect();
    __catObserver = null;
  }

  const sections = effectiveMenu.sections;

  if (!sections.length) {
    categoryNav.classList.add("hidden");
    categoryNavInner.innerHTML = "";
    return;
  }

  categoryNav.classList.remove("hidden");

  // Build buttons
  categoryNavInner.innerHTML = sections
    .map(
      (s) => `
    <button type="button" data-target="${escapeHtml(s.id)}"
      class="category-btn flex-shrink-0 px-4 py-2 rounded-full border border-primary/20 bg-background-light dark:bg-background-dark text-primary dark:text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap hover:bg-primary/5">
      ${escapeHtml(s.title)}
    </button>
  `
    )
    .join("");

  // Click → smooth scroll to section
  categoryNavInner.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-target");
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // IntersectionObserver → active state on scroll
  const sectionEls = sectionsRoot.querySelectorAll(
    ".menu-section[data-section-id]"
  );

  __catObserver = new IntersectionObserver(
    (entries) => {
      // Find topmost currently-visible section
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
        );
      if (visible.length > 0) {
        const sectionId = visible[0].target.getAttribute("data-section-id");
        setActiveCategory(sectionId);
      }
    },
    {
      // Activate when section top enters upper 40% of viewport
      rootMargin: "-80px 0px -60% 0px",
      threshold: 0,
    }
  );

  sectionEls.forEach((el) => __catObserver.observe(el));
}

function setActiveCategory(sectionId) {
  const buttons = document.querySelectorAll(".category-btn");
  let activeBtn = null;

  buttons.forEach((btn) => {
    const isActive = btn.getAttribute("data-target") === sectionId;
    btn.classList.toggle("category-btn--active", isActive);
    if (isActive) activeBtn = btn;
  });

  // Horizontally center the active button inside the nav strip
  if (activeBtn && categoryNavInner) {
    const btnRect = activeBtn.getBoundingClientRect();
    const navRect = categoryNavInner.getBoundingClientRect();
    const scrollLeft =
      categoryNavInner.scrollLeft +
      (btnRect.left - navRect.left) -
      navRect.width / 2 +
      btnRect.width / 2;
    categoryNavInner.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }
}

/* =========================
   ADMIN UI
========================= */
function setAdminVisible(isVisible) {
  document.body.classList.toggle("no-admin", !isVisible);
  render();
}

function toggleAdmin() {
  const hidden = isAdminHidden();
  setAdminVisible(hidden);
}

function openModal() {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  modal.setAttribute("aria-hidden", "true");
  setModalMode("add");
}

function renderSectionSelectInModal() {
  if (!sectionSelectWrap) return;
  if (isAdminHidden()) return;

  const options = effectiveMenu.sections
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)}</option>`
    )
    .join("");

  sectionSelectWrap.innerHTML = `
    <label class="block text-[11px] uppercase tracking-widest font-bold text-primary/70">
      Bölmə seç
    </label>
    <select
      name="sectionId"
      required
      class="mt-2 w-full rounded-lg border px-3 py-2 text-sm bg-white"
    >
      ${options}
    </select>
  `;
}

function handleAddSection() {
  if (isAdminHidden()) return;

  const title = prompt("Bölmə adı:", "Yeni Bölmə");
  if (title === null) return;

  const subtitle = prompt("Bölmə alt başlığı:", "") ?? "";

  effectiveMenu = S.addSection(effectiveMenu, { title, subtitle });
  recomputeEffectiveMenu();
  render();
}

function handleExportJson() {
  if (isAdminHidden()) return;

  let payload = "";
  try {
    payload = S.exportMenuJSON
      ? S.exportMenuJSON(effectiveMenu)
      : JSON.stringify(effectiveMenu, null, 2);
  } catch {
    payload = JSON.stringify(effectiveMenu, null, 2);
  }

  downloadTextFile("menu.json", payload);
  alert("menu.json endirildi. Onu src/data/menu.json ilə əvəz et və commit et.");
}

/* =========================
   EVENTS
========================= */
toggleAdminBtn?.addEventListener("click", toggleAdmin);
addSectionBtn?.addEventListener("click", handleAddSection);

openAddModalBtn?.addEventListener("click", () => {
  if (isAdminHidden()) return;
  setModalMode("add");
  form?.reset();
  openModal();
});

closeAddModalBtn?.addEventListener("click", closeModal);
backdrop?.addEventListener("click", closeModal);

resetMenuBtn?.addEventListener("click", () => {
  const ok = confirm("Local dəyişiklikləri silib menu.json-a qayıtmaq istəyirsiniz?");
  if (!ok) return;

  S.clearMenuOverride();
  recomputeEffectiveMenu();
  closeModal();
  render();
});

exportJsonBtn?.addEventListener("click", handleExportJson);

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (isAdminHidden()) return;

  const fd = new FormData(form);
  const sectionId = String(fd.get("sectionId") || "").trim();
  const payload = {
    title: fd.get("title"),
    ingredients: fd.get("ingredients"),
    price: fd.get("price"),
    imageUrl: fd.get("imageUrl"),
  };

  if (modalMode === "edit" && editingItemRef?.itemId) {
    effectiveMenu = S.updateItemInSection(
      effectiveMenu,
      editingItemRef.sectionId,
      editingItemRef.itemId,
      payload
    );
  } else {
    effectiveMenu = S.addItemToSection(effectiveMenu, sectionId, payload);
  }

  recomputeEffectiveMenu();
  form.reset();
  setModalMode("add");
  closeModal();
  render();
});

// CTA: scroll from cover to menu
scrollToMenuBtn?.addEventListener("click", () => {
  const target = document.getElementById("sectionsRoot");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Keyboard: Esc closes modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Keyboard: Ctrl+Shift+A / Cmd+Shift+A toggles admin
document.addEventListener("keydown", (e) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && e.shiftKey && (e.key === "A" || e.key === "a")) {
    e.preventDefault();
    toggleAdmin();
  }
});

/* =========================
   INIT
========================= */
(async function init() {
  try {
    defaultMenu = await loadDefaultMenu();
  } catch (err) {
    console.error(err);
    defaultMenu = { sections: [] };
  }

  recomputeEffectiveMenu();
  render();
})();
