import { loadContent } from "./store.js";
import { renderNav, moodboardMatchesService, resolveService, getServiceId } from "./nav.js";

const $ = (s, r = document) => r.querySelector(s);

function getServiceFilter(content) {
  const id = new URLSearchParams(location.search).get("service");
  if (!id) return null;
  return resolveService(content.services?.items || [], id);
}

function renderMoodboardCard(board) {
  const hasPinterest = Boolean(board.pinterestUrl);
  return `
    <article class="moodboard-card" data-id="${board.id}" tabindex="0" role="button" aria-label="${board.title}">
      <div class="moodboard-cover">
        <img src="${board.cover || board.images?.[0] || ""}" alt="${board.title}" loading="lazy">
        ${hasPinterest ? '<span class="moodboard-pinterest-badge">Pinterest</span>' : ""}
      </div>
      <div class="moodboard-info">
        <h2>${board.title}</h2>
        <p>${board.description}</p>
        <div class="moodboard-tags">${(board.tags || []).map((t) => `<span>${t}</span>`).join("")}</div>
      </div>
    </article>`;
}

function openBoardModal(board, content) {
  const modal = $("#moodboard-modal");
  const modalContent = $("#moodboard-modal-content");
  const pinterestUrl = (board.pinterestUrl || "").trim();
  const ideaParam = encodeURIComponent(board.id);
  const serviceQ = board.serviceIds?.[0] ? `&service=${encodeURIComponent(board.serviceIds[0])}` : "";
  const bookingUrl = `book.html?idea=${ideaParam}${serviceQ}`;

  modalContent.innerHTML = `
    <h2>${board.title}</h2>
    <p class="moodboard-modal-desc">${(board.description || "").replace(/\n/g, "<br>")}</p>
    <div class="moodboard-modal-tags">${(board.tags || []).map((t) => `<span>${t}</span>`).join("")}</div>
    <div class="moodboard-modal-actions">
      ${
        pinterestUrl
          ? `<a class="btn-pinterest" href="${pinterestUrl}" target="_blank" rel="noopener noreferrer">Смотреть идеи на Pinterest ↗</a>`
          : `<p class="moodboard-modal-note">Доска с идеями скоро появится ✨</p>`
      }
      <a class="btn-outline" href="${bookingUrl}">Забронировать эту съёмку</a>
    </div>`;

  modal.showModal();
}

async function init() {
  const content = await loadContent();
  renderNav(content);

  const serviceItems = content.services?.items || [];
  const service = getServiceFilter(content);
  const serviceId = service
    ? getServiceId(service, serviceItems.indexOf(service))
    : new URLSearchParams(location.search).get("service");

  const filtered = serviceId
    ? (content.moodboards || []).filter((b) => moodboardMatchesService(b, serviceId, serviceItems))
    : content.moodboards || [];

  const heading = $("#moodboards-heading");
  const subtitle = $("#moodboards-subtitle");
  const backLink = $("#moodboards-back");

  if (service) {
    document.title = `Идеи — ${service.title} · ${content.site.brand}`;
    heading.textContent = `Идеи: ${service.title}`;
    subtitle.textContent = `Выберите стиль — откроется доска с идеями на Pinterest.`;
    backLink.classList.remove("hidden");
  } else {
    document.title = `Идеи съёмок — ${content.site.brand}`;
    subtitle.textContent = "Выберите стиль съёмки — идеи и вдохновение откроются на Pinterest.";
  }

  const grid = $("#moodboards-grid");
  if (!filtered.length) {
    grid.innerHTML = `
      <div class="moodboards-empty">
        <p>Пока нет идей для этой услуги — скоро добавлю новые ✨</p>
        <a class="btn-outline" href="moodboards.html">Смотреть все идеи</a>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderMoodboardCard).join("");

  const modal = $("#moodboard-modal");

  const handleSelect = (card) => {
    const board = (content.moodboards || []).find((b) => b.id === card.dataset.id);
    if (!board) return;
    openBoardModal(board, content);
  };

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".moodboard-card");
    if (!card) return;
    handleSelect(card);
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".moodboard-card");
    if (!card) return;
    e.preventDefault();
    handleSelect(card);
  });

  $(".lightbox-close", modal).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.close();
  });
}

init();
