import {
  loadContent,
  saveContent,
  savePortfolio,
  saveMoodboards,
  saveServices,
  saveBookingConfig,
  fetchBookings,
  clearSavedContent,
  exportContent,
  importContentFile,
  uploadImageFile,
  uploadReviewImage,
  uid,
} from "../js/store.js";
import { getServiceId } from "../js/nav.js";

const SESSION_KEY = "wfolio_admin_session";
let data = null;
let saveChain = Promise.resolve();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const titles = {
  requests: "Заявки",
  site: "Основное",
  portfolio: "Портфолио",
  moodboards: "Идеи съёмок",
  services: "Услуги",
  reviews: "Отзывы",
  contacts: "Контакты",
  booking: "Календарь и оплата",
  publish: "Публикация",
};

const SITE_TABS = new Set(["site", "portfolio", "moodboards", "services", "reviews", "contacts", "publish"]);

async function init() {
  data = await loadContent();
  ensureDataShape();
  if (sessionStorage.getItem(SESSION_KEY) === "1") showApp();
  bindLogin();
}

function ensureDataShape() {
  if (!Array.isArray(data.portfolio)) data.portfolio = [];
  if (!Array.isArray(data.moodboards)) data.moodboards = [];
  if (!data.services) data.services = { title: "Услуги", items: [] };
  if (!Array.isArray(data.services.items)) data.services.items = [];
  if (!data.reviews) data.reviews = { title: "Отзывы", items: [] };
  if (!Array.isArray(data.reviews.items)) data.reviews.items = [];
  if (!data.contacts) data.contacts = { title: "Контакты", items: [] };
  if (!Array.isArray(data.contacts.items)) data.contacts.items = [];
  if (!data.booking) {
    data.booking = {
      prepaymentPercent: 20,
      bank: { holder: "", bankName: "", account: "", note: "" },
      defaultSlots: ["10:00", "12:00", "14:00", "16:00", "18:00"],
      availableDates: [],
    };
  }
  if (!Array.isArray(data.booking.availableDates)) data.booking.availableDates = [];
}

function bindLogin() {
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pass = $("#login-password").value;
    if (pass === data.adminPassword) {
      sessionStorage.setItem(SESSION_KEY, "1");
      showApp();
    } else {
      toast("Неверный пароль");
    }
  });
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#admin-app").classList.remove("hidden");
  renderAll();
  bindTabs();
  bindSave();
  activateTab("requests");
  updateRequestBadge();
  $("#logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
}

function activateTab(tabId) {
  $$("#sidebar-nav button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  $$(".panel").forEach((p) => p.classList.remove("active"));
  $(`#panel-${tabId}`)?.classList.add("active");
  $("#panel-title").textContent = titles[tabId] || tabId;
  $("#save-btn").classList.toggle("hidden", !SITE_TABS.has(tabId));
  if (tabId === "requests") renderRequests();
}

function bindTabs() {
  $$("#sidebar-nav button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
}

function bindSave() {
  $("#save-btn").addEventListener("click", async () => {
    const ok = await persistData("Сохранено! Переход на сайт…");
    if (ok) window.location.href = "../index.html";
  });
}

function enqueueSave(task) {
  const run = saveChain.then(task);
  saveChain = run.catch(() => {});
  return run;
}

async function persistData(successMessage) {
  try {
    await enqueueSave(async () => {
      collectAll();
      await saveContent(data);
      updateSaveStatus("disk");
    });
    if (successMessage) toast(successMessage);
    return true;
  } catch (err) {
    toast(err.message || "Не удалось сохранить");
    updateSaveStatus("error");
    return false;
  }
}

async function persistPortfolio(message) {
  try {
    await enqueueSave(async () => {
      collectAll();
      await savePortfolio(data.portfolio || [], data);
      updateSaveStatus("disk");
    });
    if (message) toast(message);
    return true;
  } catch (err) {
    toast(err.message || "Не удалось сохранить портфолио");
    updateSaveStatus("error");
    return false;
  }
}

async function persistMoodboards(message) {
  try {
    await enqueueSave(async () => {
      collectAll();
      prepareMoodboardsForSave();
      const moodboards = structuredClone(data.moodboards || []);
      await saveMoodboards(moodboards, { ...data, moodboards });
      updateSaveStatus("disk");
    });
    if (message) toast(message);
    return true;
  } catch (err) {
    toast(err.message || "Не удалось сохранить идеи. Запустите: python3 server.py");
    updateSaveStatus("error");
    return false;
  }
}

function prepareMoodboardsForSave() {
  (data.moodboards || []).forEach((board) => {
    if (!board.id) board.id = uid();
    if (!Array.isArray(board.images)) board.images = [];
    if (!Array.isArray(board.tags)) board.tags = [];
    if (!Array.isArray(board.serviceIds)) board.serviceIds = [];
    board.title = (board.title || "").trim() || "Новая идея";
    board.pinterestUrl = (board.pinterestUrl || "").trim();
    if (board.cover && !board.images.includes(board.cover)) {
      board.images.unshift(board.cover);
    }
    if (!board.cover && board.images[0]) {
      board.cover = board.images[0];
    }
  });
}

async function persistServices(message) {
  try {
    await enqueueSave(async () => {
      collectAll();
      await saveServices(data.services, data);
      updateSaveStatus("disk");
    });
    if (message) toast(message);
    return true;
  } catch (err) {
    toast(err.message || "Не удалось сохранить услуги");
    updateSaveStatus("error");
    return false;
  }
}
function updateSaveStatus(mode = "disk") {
  const el = $("#save-status");
  if (!el) return;
  const works = data.portfolio?.length || 0;
  const ideas = data.moodboards?.length || 0;
  if (mode === "error") {
    el.textContent = "Ошибка сохранения — запустите python3 server.py";
    return;
  }
  el.textContent = `Сохранено · работ: ${works} · идей: ${ideas} · ${new Date().toLocaleTimeString("ru-RU")}`;
}

function collectAll() {
  collectSite();
  collectContacts();
  collectPortfolio();
  collectMoodboards();
  collectServices();
  collectReviews();
}

function collectReviews() {
  const panel = $("#panel-reviews");
  if (!panel || !data.reviews) return;
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    const item = data.reviews.items[i];
    if (!item) return;
    const imageEl = card.querySelector(`[data-field="rv-screenshot-${i}"]`);
    if (imageEl) item.image = imageEl.value;
  });
}

function collectPortfolio() {
  const panel = $("#panel-portfolio");
  if (!panel || !Array.isArray(data.portfolio)) return;
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    const item = data.portfolio[i];
    if (!item) return;
    const titleEl = card.querySelector(".pf-title");
    if (titleEl) item.title = titleEl.value;
    const coverEl = card.querySelector(`[data-field="pf-cover-${i}"]`);
    if (coverEl) item.cover = coverEl.value;
  });
}

function collectMoodboards() {
  const panel = $("#panel-moodboards");
  if (!panel || !Array.isArray(data.moodboards)) return;
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    const board = data.moodboards[i];
    if (!board) return;
    if (!Array.isArray(board.images)) board.images = [];
    if (!Array.isArray(board.tags)) board.tags = [];
    if (!Array.isArray(board.serviceIds)) board.serviceIds = [];
    const titleEl = card.querySelector(".mb-title");
    if (titleEl) board.title = titleEl.value;
    const descEl = card.querySelector(".mb-desc");
    if (descEl) board.description = descEl.value;
    const tagsEl = card.querySelector(".mb-tags");
    if (tagsEl) {
      board.tags = tagsEl.value.split(",").map((t) => t.trim()).filter(Boolean);
    }
    board.serviceIds = [...card.querySelectorAll(".mb-service:checked")].map((el) => el.value);
    const coverEl = card.querySelector(`[data-field="mb-cover-${i}"]`);
    if (coverEl) board.cover = coverEl.value;
    const pinterestEl = card.querySelector(".mb-pinterest");
    if (pinterestEl) board.pinterestUrl = pinterestEl.value.trim();
  });
}

function serviceRefs(item, index) {
  const refs = new Set([getServiceId(item, index), `service-${index}`]);
  if (item.id) refs.add(item.id);
  return refs;
}

function collectServices() {
  const panel = $("#panel-services");
  if (!panel || !data.services) return;
  const titleEl = panel.querySelector("#services-title");
  if (titleEl) data.services.title = titleEl.value;
  if (!Array.isArray(data.services.items)) data.services.items = [];
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    const item = data.services.items[i];
    if (!item) return;
    const titleInput = card.querySelector(".sv-title");
    if (titleInput) item.title = titleInput.value;
    const descEl = card.querySelector(".sv-desc");
    if (descEl) item.description = descEl.value;
    const priceEl = card.querySelector(".sv-price");
    if (priceEl) item.price = priceEl.value.trim();
    const amountEl = card.querySelector(".sv-priceAmount");
    if (amountEl) item.priceAmount = amountEl.value === "" ? null : Number(amountEl.value);
    const currencyEl = card.querySelector(".sv-currency");
    if (currencyEl) item.currency = currencyEl.value.trim() || "KZT";
  });
}

function collectContacts() {
  const panel = $("#panel-contacts");
  if (!panel || !data.contacts) return;
  const titleEl = panel.querySelector("#contacts-title");
  if (titleEl) data.contacts.title = titleEl.value;
  if (!Array.isArray(data.contacts.items)) data.contacts.items = [];
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    const item = data.contacts.items[i];
    if (!item) return;
    const labelEl = card.querySelector(".ct-label");
    if (labelEl) item.label = labelEl.value;
    const urlEl = card.querySelector(".ct-url");
    if (urlEl) item.url = urlEl.value;
  });
}

function renderAll() {
  renderSite();
  renderPortfolio();
  renderMoodboards();
  renderServices();
  renderReviews();
  renderContacts();
  renderBooking();
  renderPublish();
  renderRequests();
  updateSaveStatus();
}

/* ── Site panel ── */

function renderSite() {
  const s = data.site;
  const paras = s.aboutParagraphs.join("\n\n");
  $("#panel-site").innerHTML = `
    <div class="card">
      <h3>Бренд и SEO</h3>
      <div class="field"><label>Имя / бренд</label><input id="f-brand" value="${esc(s.brand)}"></div>
      <div class="row-2">
        <div class="field"><label>Заголовок вкладки</label><input id="f-metaTitle" value="${esc(s.metaTitle)}"></div>
        <div class="field"><label>Локация (в подвале)</label><input id="f-location" value="${esc(s.location || "")}"></div>
      </div>
      <div class="field"><label>Описание для поисковиков</label><textarea id="f-metaDescription">${esc(s.metaDescription)}</textarea></div>
    </div>
    <div class="card">
      <h3>Главный экран</h3>
      ${imageField("f-heroImage", "Фото на главной", s.heroImage)}
    </div>
    <div class="card">
      <h3>Обо мне</h3>
      ${imageField("f-aboutImage", "Ваше фото", s.aboutImage)}
      <div class="field"><label>Заголовок</label><input id="f-aboutTitle" value="${esc(s.aboutTitle)}"></div>
      <div class="field"><label>Текст (абзацы через пустую строку)</label><textarea id="f-aboutParagraphs" rows="8">${esc(paras)}</textarea></div>
    </div>
    <div class="card">
      <h3>Заказ съёмки</h3>
      <div class="field"><label>Заголовок</label><input id="f-ctaTitle" value="${esc(s.ctaTitle)}"></div>
      <div class="field"><label>Текст</label><textarea id="f-ctaText">${esc(s.ctaText)}</textarea></div>
      <div class="row-2">
        <div class="field"><label>Текст кнопки</label><input id="f-ctaButton" value="${esc(s.ctaButton)}"></div>
        <div class="field"><label>Телефон</label><input id="f-phone" value="${esc(s.phone)}"></div>
      </div>
      <div class="field"><label>Ссылка (WhatsApp / Telegram)</label><input id="f-phoneLink" value="${esc(s.phoneLink)}"></div>
      <div class="field"><label>Сколько работ показывать сразу</label><input type="number" id="f-portfolioVisibleCount" min="1" value="${s.portfolioVisibleCount || 3}"></div>
      <div class="field"><label>Новый пароль админки</label><input type="password" id="f-adminPassword" placeholder="Оставьте пустым, чтобы не менять"></div>
    </div>`;
  bindImageUploads("#panel-site");
  $("#f-heroImage")?.addEventListener("input", (e) => updatePreview(e.target));
  $("#f-aboutImage")?.addEventListener("input", (e) => updatePreview(e.target));
  hydrateImageField("f-heroImage", s.heroImage);
  hydrateImageField("f-aboutImage", s.aboutImage);
}

function hydrateImageField(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = value || "";
  updatePreview(input);
}

function collectSite() {
  const s = data.site;
  s.brand = val("f-brand");
  s.metaTitle = val("f-metaTitle");
  s.metaDescription = val("f-metaDescription");
  s.location = val("f-location");
  s.heroImage = val("f-heroImage");
  s.aboutImage = val("f-aboutImage");
  s.aboutTitle = val("f-aboutTitle");
  s.aboutParagraphs = val("f-aboutParagraphs").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  s.portfolioTitle = s.portfolioTitle || "Портфолио";
  s.ctaTitle = val("f-ctaTitle");
  s.ctaText = val("f-ctaText");
  s.ctaButton = val("f-ctaButton");
  s.phone = val("f-phone");
  s.phoneLink = val("f-phoneLink");
  s.portfolioVisibleCount = Number(val("f-portfolioVisibleCount")) || 3;
  const newPass = val("f-adminPassword");
  if (newPass) data.adminPassword = newPass;
}

/* ── Portfolio ── */

function renderPortfolio() {
  const panel = $("#panel-portfolio");
  panel.innerHTML = `<button class="btn-add" type="button" id="add-portfolio">+ Добавить работу</button>` +
    data.portfolio.map((item, i) => portfolioCard(item, i)).join("");
  panel.querySelector("#add-portfolio").addEventListener("click", async () => {
    data.portfolio.unshift({
      id: uid(),
      title: "Новая работа",
      cover: "",
      images: [],
    });
    renderPortfolio();
    await persistPortfolio("Работа добавлена");
  });
  bindPortfolioEvents(panel);
  bindImageUploads(panel);
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    hydratePortfolioCard(card, data.portfolio[i], i);
  });
}

function portfolioCard(item, i) {
  const thumbCount = (item.images || []).length;
  const thumbs = Array.from({ length: thumbCount }, (_, j) => `
      <div class="gallery-thumb" data-ij="${j}">
        <img alt="">
        <button type="button" class="gallery-remove" data-ij="${j}" aria-label="Удалить">×</button>
      </div>`).join("");

  return `
    <div class="card item-card" data-i="${i}">
      <h3>Работа ${i + 1}: ${esc(item.title)}</h3>
      <div class="field"><label>Название</label><input class="pf-title" value="${esc(item.title)}"></div>
      ${imageField(`pf-cover-${i}`, "Обложка", item.cover, `pf-cover-${i}`, true)}
      <div class="field">
        <label>Фотографии портфолио (JPG / JPEG)</label>
        <div class="gallery-grid pf-gallery">${thumbs || '<p class="field-hint gallery-empty">Пока нет фото — загрузите файлы ниже</p>'}</div>
        <label class="file-upload-btn">
          + Загрузить фото
          <input type="file" class="pf-upload" accept=".jpg,.jpeg,image/jpeg" multiple>
        </label>
        <p class="field-hint">Можно выбрать сразу несколько файлов. Первое фото станет обложкой, если обложка пустая.</p>
      </div>
      <div class="item-actions">
        <button class="btn-sm danger pf-delete" type="button">Удалить работу</button>
      </div>
    </div>`;
}

function hydratePortfolioCard(card, item, i) {
  const coverInput = card.querySelector(`[data-field="pf-cover-${i}"]`);
  if (coverInput) {
    coverInput.value = item.cover || "";
    const preview = coverInput.closest(".field")?.querySelector(".img-preview");
    if (preview && item.cover) preview.src = item.cover;
    const label = coverInput.closest(".field")?.querySelector("[data-cover-label]");
    if (label) label.classList.toggle("hidden", !item.cover);
  }
  card.querySelectorAll(".gallery-thumb img").forEach((img, j) => {
    if (item.images?.[j]) img.src = item.images[j];
  });
}

function bindPortfolioEvents(panel) {
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector(".pf-title").addEventListener("input", (e) => {
      data.portfolio[i].title = e.target.value;
    });
    card.querySelector(".pf-title").addEventListener("change", () => persistPortfolio("Название сохранено"));
    card.querySelector(".pf-delete").addEventListener("click", async () => {
      if (confirm("Удалить эту работу?")) {
        data.portfolio.splice(i, 1);
        renderPortfolio();
        await persistPortfolio("Работа удалена");
      }
    });
    const coverInput = card.querySelector(`[data-field="pf-cover-${i}"]`);
    if (coverInput) {
      coverInput.addEventListener("input", async (e) => {
        data.portfolio[i].cover = e.target.value;
        updatePreview(coverInput);
      });
    }
    card.querySelectorAll(".gallery-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const j = Number(btn.dataset.ij);
        data.portfolio[i].images.splice(j, 1);
        if (data.portfolio[i].cover && !data.portfolio[i].images.includes(data.portfolio[i].cover)) {
          data.portfolio[i].cover = data.portfolio[i].images[0] || "";
        }
        renderPortfolio();
        await persistPortfolio("Фото удалено");
      });
    });
    const upload = card.querySelector(".pf-upload");
    if (upload) {
      upload.addEventListener("change", async () => {
        const files = [...upload.files];
        upload.value = "";
        let added = 0;
        for (const file of files) {
          try {
            const path = await uploadImageFile(file);
            if (!data.portfolio[i].images) data.portfolio[i].images = [];
            data.portfolio[i].images.push(path);
            if (!data.portfolio[i].cover) data.portfolio[i].cover = path;
            added++;
          } catch (err) {
            toast(err.message);
          }
        }
        if (added) {
          renderPortfolio();
          await persistPortfolio(`Добавлено фото: ${added}`);
        }
      });
    }
  });
}

/* ── Moodboards ── */

function renderMoodboards() {
  if (!Array.isArray(data.moodboards)) data.moodboards = [];
  const panel = $("#panel-moodboards");
  panel.innerHTML = `<p class="panel-hint">Заполните поля, добавьте обложку и ссылку на доску Pinterest, затем нажмите <strong>«Сохранить идею»</strong>.</p>
    <button class="btn-add" type="button" id="add-moodboard">+ Добавить идею</button>` +
    data.moodboards.map((b, i) => moodboardCard(b, i)).join("");
  panel.querySelector("#add-moodboard").addEventListener("click", async () => {
    data.moodboards.unshift({
      id: uid(),
      title: "Новая идея",
      description: "",
      tags: [],
      serviceIds: [],
      cover: "",
      pinterestUrl: "",
      images: [],
    });
    renderMoodboards();
    await persistMoodboards("Идея добавлена");
  });
  bindMoodboardEvents(panel);
  bindImageUploads(panel);
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    hydrateMoodboardCard(card, data.moodboards[i], i);
  });
}

function moodboardCard(b, i) {
  const serviceOptions = (data.services?.items || [])
    .map((s, si) => {
      const sid = getServiceId(s, si);
      const checked = (b.serviceIds || []).some((id) => serviceRefs(s, si).has(id)) ? "checked" : "";
      return `<label class="checkbox-label"><input type="checkbox" class="mb-service" value="${esc(sid)}" ${checked}> ${esc(s.title)}</label>`;
    })
    .join("");

  return `
    <div class="card item-card" data-i="${i}">
      <h3>Идея ${i + 1}: ${esc(b.title)}</h3>
      <div class="field"><label>Название</label><input class="mb-title" value="${esc(b.title)}"></div>
      <div class="field"><label>Описание</label><textarea class="mb-desc" rows="3">${esc(b.description)}</textarea></div>
      <div class="field"><label>Теги (через запятую)</label><input class="mb-tags" value="${esc((b.tags || []).join(", "))}"></div>
      <div class="field"><label>Услуги (необязательно — если не выбрано, идея видна для всех)</label><div class="checkbox-group">${serviceOptions || "<span class='field-hint'>Сначала добавьте услуги</span>"}</div></div>
      ${imageField(`mb-cover-${i}`, "Обложка (на карточке на сайте)", b.cover, `mb-cover-${i}`, true, "moodboards")}
      <div class="field">
        <label>Ссылка на доску Pinterest</label>
        <input class="mb-pinterest" type="url" value="${esc(b.pinterestUrl || "")}" placeholder="https://www.pinterest.com/ваш_аккаунт/название-доски/">
        <p class="field-hint">Клиенты увидят кнопку «Смотреть идеи на Pinterest» и перейдут на эту доску.</p>
      </div>
      <div class="item-actions">
        <button class="btn-sm primary mb-save" type="button">Сохранить идею</button>
        <button class="btn-sm danger mb-delete" type="button">Удалить</button>
      </div>
    </div>`;
}

function hydrateMoodboardCard(card, board, i) {
  const coverInput = card.querySelector(`[data-field="mb-cover-${i}"]`);
  if (coverInput) {
    coverInput.value = board.cover || "";
    const preview = coverInput.closest(".field")?.querySelector(".img-preview");
    if (preview && board.cover) preview.src = board.cover;
    const label = coverInput.closest(".field")?.querySelector("[data-cover-label]");
    if (label) label.classList.toggle("hidden", !board.cover);
  }
}

function bindMoodboardEvents(panel) {
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector(".mb-title").addEventListener("input", (e) => {
      data.moodboards[i].title = e.target.value;
    });
    card.querySelector(".mb-title").addEventListener("change", () => persistMoodboards("Название сохранено"));
    card.querySelector(".mb-desc").addEventListener("input", (e) => {
      data.moodboards[i].description = e.target.value;
    });
    card.querySelector(".mb-desc").addEventListener("change", () => persistMoodboards("Описание сохранено"));
    card.querySelector(".mb-tags").addEventListener("input", (e) => {
      data.moodboards[i].tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
    });
    card.querySelector(".mb-tags").addEventListener("change", () => persistMoodboards("Теги сохранены"));
    card.querySelector(".mb-pinterest")?.addEventListener("input", (e) => {
      data.moodboards[i].pinterestUrl = e.target.value;
    });
    card.querySelector(".mb-pinterest")?.addEventListener("change", () => persistMoodboards("Ссылка Pinterest сохранена"));
    card.querySelectorAll(".mb-service").forEach((cb) => {
      cb.addEventListener("change", () => {
        data.moodboards[i].serviceIds = [...card.querySelectorAll(".mb-service:checked")].map((el) => el.value);
        persistMoodboards("Услуги сохранены");
      });
    });
    card.querySelector(".mb-save")?.addEventListener("click", async () => {
      await persistMoodboards("Идея сохранена! Откройте «идеи съёмок» на сайте");
    });
    card.querySelector(".mb-delete").addEventListener("click", async () => {
      if (confirm("Удалить эту идею?")) {
        data.moodboards.splice(i, 1);
        renderMoodboards();
        await persistMoodboards("Идея удалена");
      }
    });
    const coverInput = card.querySelector(`[data-field="mb-cover-${i}"]`);
    if (coverInput) {
      coverInput.addEventListener("input", (e) => {
        data.moodboards[i].cover = e.target.value;
        updatePreview(coverInput);
      });
    }
  });
}

/* ── Services ── */

function renderServices() {
  if (!data.services) data.services = { title: "Услуги", items: [] };
  if (!Array.isArray(data.services.items)) data.services.items = [];

  const panel = $("#panel-services");
  panel.innerHTML = `
    <div class="field" style="margin-bottom:1rem"><label>Заголовок секции</label>
      <input id="services-title" value="${esc(data.services.title)}"></div>
    <button class="btn-add" type="button" id="add-service">+ Добавить услугу</button>` +
    data.services.items.map((s, i) => `
      <div class="card item-card" data-i="${i}">
        <h3>Услуга ${i + 1}: ${esc(s.title || "Без названия")}</h3>
        <div class="field"><label>Название</label><input class="sv-title" value="${esc(s.title)}"></div>
        <div class="field"><label>Описание</label><textarea class="sv-desc" rows="2">${esc(s.description)}</textarea></div>
        <div class="field">
          <label>Цена (на сайте)</label>
          <input class="sv-price" value="${esc(s.price)}" placeholder="от 80$">
          <p class="field-hint">Как на сайте: от 80$, от 50 000 ₸, по запросу</p>
        </div>
        <div class="row-2">
          <div class="field">
            <label>Цена для расчёта (число)</label>
            <input class="sv-priceAmount" type="number" min="0" step="1" value="${s.priceAmount ?? ""}" placeholder="80">
            <p class="field-hint">Для предоплаты 20% на странице записи</p>
          </div>
          <div class="field">
            <label>Валюта</label>
            <input class="sv-currency" value="${esc(s.currency || "KZT")}" placeholder="KZT">
          </div>
        </div>
        <button class="btn-sm danger sv-delete" type="button">Удалить</button>
      </div>`).join("");

  panel.querySelector("#add-service").addEventListener("click", async () => {
    data.services.items.push({ title: "Новая услуга", description: "", price: "", priceAmount: null, currency: "KZT" });
    renderServices();
    await persistServices("Услуга добавлена");
  });
  panel.querySelector("#services-title").addEventListener("input", (e) => {
    data.services.title = e.target.value;
  });
  panel.querySelector("#services-title").addEventListener("change", () => persistServices("Заголовок сохранён"));
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector(".sv-title").addEventListener("input", (e) => {
      data.services.items[i].title = e.target.value;
    });
    card.querySelector(".sv-title").addEventListener("change", () => persistServices("Название сохранено"));
    card.querySelector(".sv-desc").addEventListener("input", (e) => {
      data.services.items[i].description = e.target.value;
    });
    card.querySelector(".sv-desc").addEventListener("change", () => persistServices("Описание сохранено"));
    card.querySelector(".sv-price").addEventListener("input", (e) => {
      data.services.items[i].price = e.target.value;
    });
    card.querySelector(".sv-priceAmount")?.addEventListener("input", (e) => {
      data.services.items[i].priceAmount = e.target.value === "" ? null : Number(e.target.value);
    });
    card.querySelector(".sv-currency")?.addEventListener("input", (e) => {
      data.services.items[i].currency = e.target.value;
    });
    card.querySelector(".sv-price").addEventListener("change", () => persistServices("Цена сохранена"));
    card.querySelector(".sv-priceAmount")?.addEventListener("change", () => persistServices("Цена сохранена"));
    card.querySelector(".sv-currency")?.addEventListener("change", () => persistServices("Валюта сохранена"));
    card.querySelector(".sv-delete").addEventListener("click", async () => {
      if (confirm("Удалить эту услугу?")) {
        data.services.items.splice(i, 1);
        renderServices();
        await persistServices("Услуга удалена");
      }
    });
  });
}

/* ── Reviews ── */

function renderReviews() {
  const panel = $("#panel-reviews");
  panel.innerHTML = `
    <p class="panel-hint">Можно добавить скриншот переписки из WhatsApp или Instagram — он появится на сайте рядом с отзывом.</p>
    <div class="field" style="margin-bottom:1rem"><label>Заголовок</label>
      <input id="reviews-title" value="${esc(data.reviews.title)}"></div>
    <button class="btn-add" type="button" id="add-review">+ Добавить отзыв</button>` +
    data.reviews.items.map((r, i) => `
      <div class="card item-card" data-i="${i}">
        <div class="row-2">
          <div class="field"><label>Имя</label><input class="rv-name" value="${esc(r.name)}"></div>
          <div class="field"><label>Год</label><input class="rv-date" value="${esc(r.date)}"></div>
        </div>
        <div class="field"><label>Текст</label><textarea class="rv-text" rows="3">${esc(r.text)}</textarea></div>
        ${reviewImageField(i, r.image || "")}
        <button class="btn-sm danger rv-delete" type="button">Удалить</button>
      </div>`).join("");

  panel.querySelector("#add-review").addEventListener("click", () => {
    data.reviews.items.push({ name: "", text: "", date: new Date().getFullYear().toString(), image: "" });
    renderReviews();
  });
  panel.querySelector("#reviews-title").addEventListener("input", (e) => { data.reviews.title = e.target.value; });
  bindImageUploads(panel);
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    hydrateReviewCard(card, data.reviews.items[i], i);
    card.querySelector(".rv-name").addEventListener("input", (e) => { data.reviews.items[i].name = e.target.value; });
    card.querySelector(".rv-date").addEventListener("input", (e) => { data.reviews.items[i].date = e.target.value; });
    card.querySelector(".rv-text").addEventListener("input", (e) => { data.reviews.items[i].text = e.target.value; });
    const imageInput = card.querySelector(`[data-field="rv-screenshot-${i}"]`);
    if (imageInput) {
      imageInput.addEventListener("input", (e) => {
        data.reviews.items[i].image = e.target.value;
      });
    }
    card.querySelector(".rv-delete").addEventListener("click", () => {
      data.reviews.items.splice(i, 1);
      renderReviews();
    });
  });
}

function reviewImageField(i, value) {
  const hasImage = Boolean(value);
  return `
    <div class="field">
      <label>Скриншот из чата</label>
      <input type="hidden" data-field="rv-screenshot-${i}" value="${esc(value)}">
      <p class="field-hint cover-status ${hasImage ? "" : "hidden"}" data-cover-label>Скриншот загружен ✓</p>
      <div class="img-upload-row">
        <label class="file-upload-btn sm">
          Загрузить скриншот
          <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-target="rv-screenshot-${i}" data-folder="reviews" data-persist="reviews">
        </label>
      </div>
      <img class="img-preview review-screenshot-preview ${hasImage ? "" : "hidden"}" alt="">
      <p class="field-hint">Скриншот из WhatsApp, Instagram или другого мессенджера (JPG, PNG)</p>
    </div>`;
}

function hydrateReviewCard(card, item, i) {
  const imageInput = card.querySelector(`[data-field="rv-screenshot-${i}"]`);
  if (!imageInput) return;
  imageInput.value = item.image || "";
  const preview = imageInput.closest(".field")?.querySelector(".img-preview");
  if (preview && item.image) preview.src = item.image;
  const label = imageInput.closest(".field")?.querySelector("[data-cover-label]");
  if (label) label.classList.toggle("hidden", !item.image);
}

/* ── Contacts ── */

function renderContacts() {
  const panel = $("#panel-contacts");
  panel.innerHTML = `
    <div class="field" style="margin-bottom:1rem"><label>Заголовок</label>
      <input id="contacts-title" value="${esc(data.contacts.title)}"></div>
    <button class="btn-add" type="button" id="add-contact">+ Добавить ссылку</button>` +
    data.contacts.items.map((c, i) => `
      <div class="card item-card" data-i="${i}">
        <div class="row-2">
          <div class="field"><label>Название</label><input class="ct-label" value="${esc(c.label)}"></div>
          <div class="field"><label>URL</label><input class="ct-url" value="${esc(c.url)}"></div>
        </div>
        <button class="btn-sm danger ct-delete" type="button">Удалить</button>
      </div>`).join("");

  panel.querySelector("#add-contact").addEventListener("click", () => {
    data.contacts.items.push({ label: "Ссылка", url: "" });
    renderContacts();
  });
  panel.querySelector("#contacts-title").addEventListener("input", (e) => { data.contacts.title = e.target.value; });
  panel.querySelectorAll(".item-card").forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector(".ct-label").addEventListener("input", (e) => { data.contacts.items[i].label = e.target.value; });
    card.querySelector(".ct-url").addEventListener("input", (e) => { data.contacts.items[i].url = e.target.value; });
    card.querySelector(".ct-delete").addEventListener("click", () => {
      data.contacts.items.splice(i, 1);
      renderContacts();
    });
  });
}

/* ── Booking requests ── */

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatBookingDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_RU[m - 1]} ${y}`;
}

function formatCreatedAt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function whatsappLink(phone, text = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "#";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${q}`;
}

function clientInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function renderRequestCard(r) {
  const isPdf = r.receiptPath?.endsWith(".pdf");
  const prepay =
    r.prepaymentAmount != null
      ? `${Number(r.prepaymentAmount).toLocaleString("ru-RU")} ${r.prepaymentCurrency || "KZT"}`
      : "";
  const waText = `Здравствуйте! Ваша заявка на ${r.date} в ${r.time} получена ✨`;

  return `
    <article class="request-card">
      <div class="request-avatar" aria-hidden="true">${esc(clientInitial(r.clientName))}</div>
      <div class="request-body">
        <div class="request-head">
          <div>
            <h3>${esc(r.clientName)}</h3>
            <time class="request-time">${esc(formatCreatedAt(r.createdAt))}</time>
          </div>
          <span class="request-status ${esc(r.status || "pending")}">${r.status === "confirmed" ? "Подтверждена" : "Новая"}</span>
        </div>
        <div class="request-details">
          <div class="request-detail">
            <span class="request-detail-label">Телефон</span>
            <a href="tel:${esc(r.clientPhone)}">${esc(r.clientPhone)}</a>
          </div>
          ${r.clientEmail ? `<div class="request-detail"><span class="request-detail-label">Email</span><span>${esc(r.clientEmail)}</span></div>` : ""}
          <div class="request-detail">
            <span class="request-detail-label">Услуга</span>
            <span>${esc(r.serviceTitle)}</span>
          </div>
          ${r.ideaTitle ? `<div class="request-detail"><span class="request-detail-label">Идея</span><span>${esc(r.ideaTitle)}</span></div>` : ""}
          <div class="request-detail">
            <span class="request-detail-label">Дата и время</span>
            <span><strong>${esc(formatBookingDate(r.date))}</strong> · ${esc(r.time)}</span>
          </div>
          ${prepay ? `<div class="request-detail"><span class="request-detail-label">Предоплата</span><span>${esc(prepay)} ✓</span></div>` : ""}
          ${r.notes ? `<div class="request-detail request-detail--full"><span class="request-detail-label">Пожелания</span><span>${esc(r.notes)}</span></div>` : ""}
        </div>
        <div class="request-actions">
          <a class="request-action-btn whatsapp" href="${whatsappLink(r.clientPhone, waText)}" target="_blank" rel="noopener">WhatsApp</a>
          ${r.receiptPath ? `<a class="request-action-btn" href="../${esc(r.receiptPath)}" target="_blank" rel="noopener">${isPdf ? "📄 Чек PDF" : "📎 Чек"}</a>` : ""}
        </div>
      </div>
      ${
        r.receiptPath && !isPdf
          ? `<a class="request-receipt-thumb" href="../${esc(r.receiptPath)}" target="_blank" rel="noopener"><img src="../${esc(r.receiptPath)}" alt="Чек"></a>`
          : ""
      }
    </article>`;
}

async function updateRequestBadge() {
  const badge = $("#requests-badge");
  if (!badge) return;
  try {
    const bookings = await fetchBookings();
    const pending = bookings.filter((b) => (b.status || "pending") === "pending").length;
    badge.textContent = pending;
    badge.classList.toggle("hidden", pending === 0);
  } catch {
    badge.classList.add("hidden");
  }
}

async function renderRequests() {
  const panel = $("#panel-requests");
  panel.innerHTML = `<div class="requests-loading"><p>Загрузка заявок…</p></div>`;
  try {
    const bookings = await fetchBookings();
    await updateRequestBadge();
    if (!bookings.length) {
      panel.innerHTML = `
        <div class="requests-empty">
          <div class="requests-empty-icon" aria-hidden="true">📭</div>
          <h2>Пока нет заявок</h2>
          <p>Когда клиент заполнит форму на странице записи, заявка появится здесь.</p>
          <a class="btn-sm primary" href="../book.html" target="_blank">Открыть страницу записи</a>
        </div>`;
      return;
    }
    panel.innerHTML = `
      <p class="panel-hint">Все заявки с сайта — имя, контакты, дата съёмки и чек об оплате.</p>
      <div class="requests-list">${bookings.map(renderRequestCard).join("")}</div>`;
  } catch {
    panel.innerHTML = `<p class="panel-hint">Запустите <code>python3 server.py</code> и обновите страницу.</p>`;
  }
}

/* ── Booking ── */

async function persistBookingConfig(message) {
  try {
    await enqueueSave(async () => {
      collectBooking();
      await saveBookingConfig(data.booking, data);
      updateSaveStatus("disk");
    });
    if (message) toast(message);
    return true;
  } catch (err) {
    toast(err.message || "Не удалось сохранить настройки записи");
    updateSaveStatus("error");
    return false;
  }
}

function collectBooking() {
  if (!data.booking) return;
  const b = data.booking;
  b.prepaymentPercent = Number($("#bk-prepay")?.value) || 20;
  b.bank = {
    holder: val("bk-holder"),
    bankName: val("bk-bank"),
    account: val("bk-account"),
    note: val("bk-note"),
  };
  b.defaultSlots = val("bk-slots").split(",").map((s) => s.trim()).filter(Boolean);
}

async function renderBooking() {
  if (!data.booking) ensureDataShape();
  const b = data.booking;
  const panel = $("#panel-booking");
  panel.innerHTML = `
    <p class="panel-hint">Настройте реквизиты и свободные даты — клиенты увидят их в <a href="../book.html" target="_blank">календаре записи</a>. Заявки — во вкладке «Заявки» слева.</p>
    <div class="card">
      <h3>Оплата и реквизиты</h3>
      <div class="row-2">
        <div class="field"><label>Предоплата (%)</label><input type="number" id="bk-prepay" min="1" max="100" value="${b.prepaymentPercent || 20}"></div>
        <div class="field"><label>Слоты времени (через запятую)</label><input id="bk-slots" value="${esc((b.defaultSlots || []).join(", "))}"></div>
      </div>
      <div class="field"><label>Имя получателя</label><input id="bk-holder" value="${esc(b.bank?.holder || "")}"></div>
      <div class="field"><label>Банк</label><input id="bk-bank" value="${esc(b.bank?.bankName || "")}"></div>
      <div class="field"><label>Номер счёта / карты</label><input id="bk-account" value="${esc(b.bank?.account || "")}"></div>
      <div class="field"><label>Комментарий к переводу</label><input id="bk-note" value="${esc(b.bank?.note || "")}"></div>
      <button type="button" class="btn-sm primary" id="bk-save-config">Сохранить настройки</button>
    </div>
    <div class="card">
      <h3>Свободные даты</h3>
      <div class="row-2" style="align-items:end">
        <div class="field"><label>Дата</label><input type="date" id="bk-new-date"></div>
        <button type="button" class="btn-sm primary" id="bk-add-date">+ Добавить дату</button>
      </div>
      <div id="bk-dates-list">${renderBookingDatesList(b)}</div>
    </div>`;

  panel.querySelector("#bk-save-config").addEventListener("click", () => persistBookingConfig("Настройки записи сохранены"));
  panel.querySelector("#bk-add-date").addEventListener("click", async () => {
    const date = $("#bk-new-date").value;
    if (!date) return toast("Выберите дату");
    if (b.availableDates.some((d) => d.date === date)) return toast("Эта дата уже добавлена");
    b.availableDates.push({ date, slots: [...(b.defaultSlots || [])] });
    b.availableDates.sort((a, c) => a.date.localeCompare(c.date));
    renderBooking();
    await persistBookingConfig("Дата добавлена");
  });

  panel.querySelectorAll(".bk-remove-date").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const date = btn.dataset.date;
      b.availableDates = b.availableDates.filter((d) => d.date !== date);
      renderBooking();
      await persistBookingConfig("Дата удалена");
    });
  });
}

function renderBookingDatesList(b) {
  if (!b.availableDates?.length) return "<p class='field-hint'>Даты не добавлены — клиенты не смогут выбрать время</p>";
  return b.availableDates
    .map(
      (d) => `
    <div class="bk-date-row">
      <span><strong>${d.date}</strong> · ${(d.slots || []).join(", ")}</span>
      <button type="button" class="btn-sm danger bk-remove-date" data-date="${d.date}">Удалить</button>
    </div>`
    )
    .join("");
}

/* ── Publish ── */

function renderPublish() {
  $("#panel-publish").innerHTML = `
    <div class="publish-box">
      <h3>Как это работает</h3>
      <p>Фото сохраняются в папку <code>images/</code> на диске. Сайт нужно запускать через <code>python server.py</code>.</p>
      <p>Чтобы выложить в интернет — скачайте <code>content.json</code> и папку <code>images/</code> на хостинг.</p>
    </div>
    <div class="publish-box">
      <h3>Опубликовать для всех</h3>
      <p>Скачайте файл контента и загрузите его в папку <code>data/</code> на вашем хостинге (Netlify, GitHub Pages и т.д.).</p>
      <div class="publish-actions">
        <button class="primary" type="button" id="export-btn">Скачать content.json</button>
        <label>Импортировать файл <input type="file" id="import-file" accept=".json"></label>
        <button type="button" id="reset-btn">Сбросить к файлу с сервера</button>
      </div>
    </div>`;

  $("#export-btn").addEventListener("click", async () => {
    collectAll();
    try {
      await saveContent(data);
      exportContent(data);
      toast("Файл скачан!");
    } catch (err) {
      toast(err.message || "Не удалось сохранить перед экспортом");
    }
  });

  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      data = await importContentFile(file);
      await saveContent(data);
      renderAll();
      toast("Импортировано и сохранено!");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  });

  $("#reset-btn").addEventListener("click", () => {
    if (confirm("Сбросить все изменения в браузере?")) {
      clearSavedContent();
      location.reload();
    }
  });
}

/* ── Helpers ── */

function imageField(id, label, value, fieldKey, jpegOnly = false, uploadFolder = null) {
  const key = fieldKey || id;
  const hasImage = Boolean(value);
  const accept = jpegOnly ? ".jpg,.jpeg,image/jpeg" : ".jpg,.jpeg,image/jpeg";
  const hint = jpegOnly
    ? "Загрузите JPG или JPEG с компьютера"
    : "Загрузите JPG или JPEG с компьютера";
  let folder = "site";
  let persist = "site";
  if (key.startsWith("pf-cover")) {
    folder = "portfolio";
    persist = "portfolio";
  } else if (key.startsWith("mb-cover")) {
    folder = uploadFolder || "moodboards";
    persist = "moodboards";
  }
  return `
    <div class="field">
      <label>${label}</label>
      <input type="hidden" id="${id}" data-field="${key}">
      <p class="field-hint cover-status ${hasImage ? "" : "hidden"}" data-cover-label>Фото загружено ✓</p>
      <div class="img-upload-row">
        <label class="file-upload-btn sm">
          Выбрать файл
          <input type="file" accept="${accept}" data-target="${key}" data-folder="${folder}" data-persist="${persist}">
        </label>
      </div>
      <img class="img-preview ${hasImage ? "" : "hidden"}" alt="">
      <p class="field-hint">${hint}</p>
    </div>`;
}

function bindImageUploads(root) {
  const el = typeof root === "string" ? $(root) : root;
  el.querySelectorAll('input[type="file"][data-target]').forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const folder = input.dataset.folder || "site";
      try {
        const path =
          folder === "reviews"
            ? await uploadReviewImage(file)
            : await uploadImageFile(file, folder);
        const target = el.querySelector(`[data-field="${input.dataset.target}"]`);
        if (target) {
          target.value = path;
          target.dispatchEvent(new Event("input"));
          updatePreview(target);
          if (input.dataset.persist === "portfolio") {
            await persistPortfolio("Обложка сохранена");
          } else if (input.dataset.persist === "moodboards") {
            await persistMoodboards("Обложка сохранена");
          } else if (input.dataset.persist === "reviews") {
            collectReviews();
            await persistData("Скриншот сохранён");
          } else {
            await persistData("Фото сохранено");
          }
        }
      } catch (err) {
        toast(err.message);
      }
      input.value = "";
    });
  });
}

function updatePreview(input) {
  const field = input.closest(".field");
  const img = field.querySelector(".img-preview");
  const label = field.querySelector("[data-cover-label]");
  if (input.value) {
    if (img) {
      img.src = input.value;
      img.classList.remove("hidden");
    }
    label?.classList.remove("hidden");
  } else {
    if (img) {
      img.removeAttribute("src");
      img.classList.add("hidden");
    }
    label?.classList.add("hidden");
  }
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

init();
