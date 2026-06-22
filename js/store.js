const DATA_URL = new URL("../data/content.json", import.meta.url).href;
const USER_CONTENT_URL = "/data/user-content.json";

function deepMerge(base, override) {
  if (!override) return structuredClone(base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === "object") {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function fetchUserContent() {
  try {
    const res = await fetch(`${USER_CONTENT_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchDefaultContent() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("Не удалось загрузить контент");
  return res.json();
}

export async function loadContent() {
  const defaults = await fetchDefaultContent();
  const saved = await fetchUserContent();
  return saved ? deepMerge(defaults, saved) : defaults;
}

export async function saveContent(data) {
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Не удалось сохранить. Запустите: python3 server.py");
  }
  return res.json();
}

async function savePartial(endpoint, body, fullData, mergeKey) {
  const payload = { ...fullData, [mergeKey]: body[mergeKey] };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
  } catch {
    /* dedicated endpoint unavailable — save full content below */
  }
  return saveContent(payload);
}

export async function savePortfolio(portfolio, fullData) {
  return savePartial("/api/save-portfolio", { portfolio }, fullData, "portfolio");
}

export async function saveMoodboards(moodboards, fullData) {
  return savePartial("/api/save-moodboards", { moodboards }, fullData, "moodboards");
}

export async function saveServices(services, fullData) {
  return savePartial("/api/save-services", { services }, fullData, "services");
}

export async function clearSavedContent() {
  const defaults = await fetchDefaultContent();
  return saveContent(defaults);
}

export function exportContent(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "content.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importContentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error("Неверный формат файла"));
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsText(file);
  });
}

export function isJpegFile(file) {
  return /^image\/jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
}

export function isReceiptFile(file) {
  const type = (file.type || "").toLowerCase();
  if (/^image\/(jpe?g|png|webp)$/i.test(type) || type === "application/pdf") return true;
  return /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
}

export function isReviewImageFile(file) {
  const type = (file.type || "").toLowerCase();
  if (/^image\/(jpe?g|png|webp)$/i.test(type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export async function uploadReviewImage(file) {
  if (!isReviewImageFile(file)) {
    throw new Error("Загрузите скриншот в формате JPG или PNG");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "reviews");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Не удалось загрузить скриншот");
  }
  return (await res.json()).path;
}

export async function uploadReceiptFile(file) {
  if (!isReceiptFile(file)) {
    throw new Error("Прикрепите чек в формате JPG, PNG или PDF");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "receipts");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Не удалось загрузить чек. Запустите: python3 server.py");
  }
  return (await res.json()).path;
}

export async function uploadImageFile(file, folder = "portfolio") {
  if (!isJpegFile(file)) {
    throw new Error("Поддерживаются только JPG и JPEG");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Загрузка не удалась. Запустите: python3 server.py");
  }
  return (await res.json()).path;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function fetchBookingInfo() {
  const res = await fetch(`/api/booking-info?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Не удалось загрузить данные бронирования");
  }
  return res.json();
}

function bookingInfoFromContent(content) {
  const booking = content.booking || {};
  return {
    ok: true,
    brand: content.site?.brand || "",
    phone: content.site?.phone || "",
    phoneLink: content.site?.phoneLink || "",
    services: content.services?.items || [],
    moodboards: (content.moodboards || []).map((b) => ({ id: b.id, title: b.title })),
    booking: {
      prepaymentPercent: booking.prepaymentPercent ?? 20,
      bank: booking.bank || {},
      defaultSlots: booking.defaultSlots || [],
    },
    availability: [],
  };
}

/** API first; falls back to merged content.json if server is old or offline. */
export async function loadBookingInfo() {
  try {
    const info = await fetchBookingInfo();
    if (info?.services?.length) return info;
  } catch {
    /* try content files below */
  }
  const content = await loadContent();
  return bookingInfoFromContent(content);
}

export async function submitBooking(payload) {
  const res = await fetch("/api/booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Не удалось отправить заявку");
  return data;
}

export async function fetchBookings() {
  const res = await fetch(`/api/bookings?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить заявки");
  return (await res.json()).bookings || [];
}

export async function saveBookingConfig(booking, fullData) {
  return savePartial("/api/save-booking-config", { booking }, fullData, "booking");
}
