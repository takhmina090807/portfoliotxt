const $ = (s, r = document) => r.querySelector(s);

function homePrefix() {
  const p = location.pathname;
  if (p.endsWith("moodboards.html") || p.endsWith("book.html")) return "index.html";
  return "";
}

export function renderNav(content) {
  const slot = $("#services-nav-slot");
  if (!slot) return;

  const items = content?.services?.items;
  if (!items?.length) return;

  const hp = homePrefix();
  const services = items.map((s, i) => ({
    id: getServiceId(s, i),
    title: s.title,
  }));

  slot.outerHTML = `
    <div class="nav-dropdown" id="services-dropdown">
      <button type="button" class="nav-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
        Услуги <span class="nav-chevron" aria-hidden="true">▾</span>
      </button>
      <ul class="nav-dropdown-menu" role="menu">
        ${services
          .map(
            (s) =>
              `<li role="none"><a role="menuitem" href="moodboards.html?service=${encodeURIComponent(s.id)}">${s.title}</a></li>`
          )
          .join("")}
        <li class="nav-dropdown-divider" role="none"><a role="menuitem" href="${hp}#services">Все услуги и цены</a></li>
      </ul>
    </div>`;

  initServicesDropdown();
}

function initServicesDropdown() {
  const dropdown = $("#services-dropdown");
  if (!dropdown) return;

  const trigger = $(".nav-dropdown-trigger", dropdown);
  const menu = $(".nav-dropdown-menu", dropdown);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle("open");
    trigger.setAttribute("aria-expanded", open);
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      dropdown.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

export function getServiceId(item, index) {
  return item?.id || `service-${index}`;
}

export function resolveService(services, ref) {
  if (!ref || !services?.length) return null;
  const byKey = services.find((s, i) => getServiceId(s, i) === ref);
  if (byKey) return byKey;
  const byId = services.find((s) => s.id === ref);
  if (byId) return byId;
  const indexMatch = ref.match(/^service-(\d+)$/);
  if (indexMatch) return services[Number(indexMatch[1])] || null;
  return services.find((s) => s.title === ref) || null;
}

export function moodboardMatchesService(board, serviceId, services = []) {
  if (!serviceId) return true;
  const linked = board.serviceIds?.length
    ? board.serviceIds
    : board.serviceId
      ? [board.serviceId]
      : [];
  if (!linked.length) return true;

  const service = resolveService(services, serviceId);
  const keys = new Set([serviceId]);
  if (service) {
    const index = services.indexOf(service);
    keys.add(getServiceId(service, index));
    if (service.id) keys.add(service.id);
    keys.add(`service-${index}`);
  }
  return linked.some((id) => keys.has(id));
}
