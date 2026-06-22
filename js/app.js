import { loadContent } from "./store.js";
import { renderNav, getServiceId, moodboardMatchesService } from "./nav.js";

let content;
let visibleCount = 3;

const $ = (s, r = document) => r.querySelector(s);

async function init() {
  try {
    content = await loadContent();
    visibleCount = content.site?.portfolioVisibleCount || 3;
    renderMeta();
    renderHero();
    renderAbout();
    renderPortfolio();
    renderServices();
    renderReviews();
    renderCta();
    renderNav(content);
    initPortfolioMore();
    initSeriesModal();
    initShare();
    initHeader();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#fee;padding:1rem;text-align:center;font-family:sans-serif">Ошибка загрузки сайта. Запустите <code>python3 server.py</code> в папке проекта.</div>`
    );
  }
}

function renderMeta() {
  document.title = content.site.metaTitle || content.site.brand;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = content.site.metaDescription || "";
}

function renderHero() {
  $("#brand-name").textContent = content.site.brand;
  $("#hero-bg").style.backgroundImage = `url('${content.site.heroImage}')`;
}

function renderAbout() {
  $("#about-title").textContent = content.site.aboutTitle;
  const img = $("#about-image");
  img.src = content.site.aboutImage;
  img.alt = content.site.brand;
  $("#about-paragraphs").innerHTML = (content.site.aboutParagraphs || [])
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function renderPortfolio() {
  $("#portfolio-title").textContent = content.site.portfolioTitle;
  const grid = $("#portfolio-grid");
  const portfolio = content.portfolio || [];
  const items = portfolio.slice(0, visibleCount);

  grid.innerHTML = items
    .map((item, i) => {
      const images = item.images?.length ? item.images : item.cover ? [item.cover] : [];
      const cover = item.cover || images[0] || "";
      const countLabel = images.length > 1 ? `${images.length} фото` : "";
      return `
    <button class="portfolio-item" type="button" data-index="${i}" aria-label="${item.title}">
      <img src="${cover}" alt="${item.title}" loading="lazy">
      <span class="portfolio-item-title">${item.title}</span>
      ${countLabel ? `<span class="portfolio-item-count">${countLabel}</span>` : ""}
    </button>`;
    })
    .join("");

  const moreBtn = $("#portfolio-more");
  moreBtn.style.display = visibleCount >= portfolio.length ? "none" : "inline-flex";

  grid.querySelectorAll(".portfolio-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = portfolio[Number(btn.dataset.index)];
      openSeriesModal(item);
    });
  });
}

function renderServices() {
  $("#services-title").textContent = content.services.title;
  $("#services-grid").innerHTML = (content.services?.items || [])
    .map(
      (s, i) => `
    <article class="service-card">
      <h3>${s.title}</h3>
      <p>${s.description}</p>
      <span class="service-price">${s.price}</span>
      <a class="btn-outline service-ideas-btn" href="moodboards.html?service=${encodeURIComponent(getServiceId(s, i))}">Смотреть идеи</a>
      <a class="btn-outline service-book-btn" href="book.html?service=${encodeURIComponent(getServiceId(s, i))}">Записаться</a>
    </article>`
    )
    .join("");
}

function renderReviews() {
  $("#reviews-title").textContent = content.reviews.title;
  $("#reviews-grid").innerHTML = (content.reviews?.items || [])
    .map(
      (r) => `
    <blockquote class="review-card">
      ${r.image ? `<figure class="review-chat"><img src="${r.image}" alt="Отзыв от ${r.name}" loading="lazy"></figure>` : ""}
      <p>«${r.text}»</p>
      <footer>— ${r.name}, ${r.date}</footer>
    </blockquote>`
    )
    .join("");
}

function renderCta() {
  $("#cta-title").textContent = content.site.ctaTitle;
  $("#cta-text").textContent = content.site.ctaText;
  const btn = $("#cta-button");
  btn.textContent = content.site.ctaButton;
  btn.href = "book.html";
  const phone = $("#cta-phone");
  phone.textContent = content.site.phone;
  phone.href = content.site.phoneLink || `tel:${content.site.phone}`;
  $("#footer-text").textContent = `© ${new Date().getFullYear()} ${content.site.brand} · ${content.site.location || ""}`;
  $("#contact-links").innerHTML = (content.contacts?.items || [])
    .map((c) => `<a href="${c.url}" target="_blank" rel="noopener">${c.label}</a>`)
    .join("");
}

function initPortfolioMore() {
  $("#portfolio-more").addEventListener("click", () => {
    visibleCount += content.site.portfolioVisibleCount || 3;
    renderPortfolio();
  });
}

function openSeriesModal(item) {
  const images = item.images?.length ? item.images : item.cover ? [item.cover] : [];
  $("#series-modal-title").textContent = item.title;
  $("#series-modal-count").textContent = images.length
    ? `${images.length} ${images.length === 1 ? "фотография" : images.length < 5 ? "фотографии" : "фотографий"}`
    : "";
  $("#series-modal-gallery").innerHTML = images
    .map((src) => `<img src="${src}" alt="${item.title}" loading="lazy">`)
    .join("");
  $("#gallery-lightbox").showModal();
}

function initSeriesModal() {
  const dialog = $("#gallery-lightbox");
  $(".lightbox-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function initShare() {
  $("#share-btn").addEventListener("click", async () => {
    const data = { title: content.site.brand, url: location.href };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {}
    } else {
      await navigator.clipboard.writeText(location.href);
      alert("Ссылка скопирована!");
    }
  });
}

function initHeader() {
  const header = $(".header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 60);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

init();
