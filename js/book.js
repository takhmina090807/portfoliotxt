import { loadBookingInfo, submitBooking, uploadReceiptFile } from "./store.js";
import { renderNav, getServiceId, resolveService } from "./nav.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  step: 1,
  info: null,
  availability: [],
  selectedDate: "",
  selectedTime: "",
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
};

function parsePriceAmount(service) {
  if (service?.priceAmount != null && service.priceAmount !== "") {
    return Number(service.priceAmount);
  }
  const match = String(service?.price || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function formatMoney(amount, currency = "KZT") {
  if (currency === "USD") return `$${amount}`;
  if (currency === "KZT") return `${Number(amount).toLocaleString("ru-RU")} ₸`;
  return `${amount} ${currency}`;
}

function getSelectedService() {
  const id = $("#book-service").value;
  return resolveService(state.info?.services || [], id);
}

function getSelectedIdea() {
  const id = $("#book-idea").value;
  if (!id) return null;
  return state.info?.moodboards?.find((b) => b.id === id);
}

function updateServicePriceHint() {
  const service = getSelectedService();
  const el = $("#book-service-price");
  if (!service) {
    el.textContent = "";
    return;
  }
  const amount = parsePriceAmount(service);
  const pct = state.info?.booking?.prepaymentPercent || 20;
  if (amount) {
    const prepay = Math.round(amount * pct) / 100;
    el.textContent = `Стоимость: ${service.price} · предоплата ${pct}%: ${formatMoney(prepay, service.currency || "KZT")}`;
  } else {
    el.textContent = `Стоимость: ${service.price} — точную сумму предоплаты уточним в WhatsApp`;
  }
}

function setStep(step) {
  state.step = step;
  $$(".booking-step").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.step) === step);
    el.classList.toggle("done", Number(el.dataset.step) < step);
  });
  $$(".booking-panel").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.panel) === step);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function availabilityMap() {
  const map = new Map();
  state.availability.forEach((d) => map.set(d.date, d.slots));
  return map;
}

function renderCalendar() {
  const grid = $("#booking-calendar");
  const label = $("#cal-month-label");
  const empty = $("#calendar-empty");
  const map = availabilityMap();
  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  label.textContent = `${monthNames[state.calMonth]} ${state.calYear}`;

  const first = new Date(state.calYear, state.calMonth, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '<div class="cal-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="cal-days">';
  for (let i = 0; i < startDay; i++) html += '<span class="cal-day empty"></span>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${state.calYear}-${String(state.calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(state.calYear, state.calMonth, day);
    const slots = map.get(dateStr);
    const isPast = dateObj < today;
    const isAvailable = slots?.length && !isPast;
    const selected = state.selectedDate === dateStr ? " selected" : "";
    const cls = isAvailable ? `cal-day available${selected}` : isPast ? "cal-day past" : "cal-day";
    html += isAvailable
      ? `<button type="button" class="${cls}" data-date="${dateStr}">${day}</button>`
      : `<span class="${cls}">${day}</span>`;
  }
  html += "</div>";
  grid.innerHTML = html;

  empty.classList.toggle("hidden", state.availability.length > 0);
  grid.querySelectorAll(".cal-day.available").forEach((btn) => {
    btn.addEventListener("click", () => selectDate(btn.dataset.date));
  });
}

function selectDate(dateStr) {
  state.selectedDate = dateStr;
  state.selectedTime = "";
  renderCalendar();
  renderTimeSlots();
  $("#step2-next").disabled = true;
}

function renderTimeSlots() {
  const field = $("#time-field");
  const container = $("#time-slots");
  if (!state.selectedDate) {
    field.classList.add("hidden");
    return;
  }
  const day = state.availability.find((d) => d.date === state.selectedDate);
  const slots = day?.slots || [];
  field.classList.remove("hidden");
  container.innerHTML = slots
    .map(
      (t) =>
        `<button type="button" class="time-slot${state.selectedTime === t ? " selected" : ""}" data-time="${t}">${t}</button>`
    )
    .join("");
  container.querySelectorAll(".time-slot").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedTime = btn.dataset.time;
      renderTimeSlots();
      $("#step2-next").disabled = false;
    });
  });
}

function renderSummary() {
  const service = getSelectedService();
  const idea = getSelectedIdea();
  const pct = state.info?.booking?.prepaymentPercent || 20;
  const amount = service ? parsePriceAmount(service) : null;
  const prepay = amount ? Math.round(amount * pct) / 100 : null;
  const currency = service?.currency || "KZT";

  $("#booking-summary").innerHTML = `
    <p><strong>Услуга:</strong> ${service?.title || "—"}</p>
    ${idea ? `<p><strong>Идея:</strong> ${idea.title}</p>` : ""}
    <p><strong>Дата:</strong> ${state.selectedDate}</p>
    <p><strong>Время:</strong> ${state.selectedTime}</p>
    <p><strong>Имя:</strong> ${$("#book-name").value}</p>
    <p><strong>Телефон:</strong> ${$("#book-phone").value}</p>
    ${
      prepay
        ? `<p class="booking-prepay"><strong>Предоплата ${pct}%:</strong> ${formatMoney(prepay, currency)}</p>`
        : `<p class="booking-prepay"><strong>Предоплата:</strong> уточним в WhatsApp</p>`
    }`;

  const bank = state.info?.booking?.bank || {};
  $("#bank-card").innerHTML = `
    <h3>Реквизиты для перевода</h3>
    ${bank.holder ? `<p><span>Получатель</span><strong>${bank.holder}</strong></p>` : ""}
    ${bank.bankName ? `<p><span>Банк</span><strong>${bank.bankName}</strong></p>` : ""}
    ${bank.account ? `<p><span>Счёт / карта</span><strong class="bank-account" id="bank-account">${bank.account}</strong> <button type="button" class="copy-btn" id="copy-account">Копировать</button></p>` : ""}
    ${bank.note ? `<p class="bank-note">${bank.note}</p>` : ""}
    ${prepay ? `<p class="bank-amount">Сумма к переводу: <strong>${formatMoney(prepay, currency)}</strong></p>` : ""}`;

  $("#copy-account")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(bank.account);
      $("#copy-account").textContent = "Скопировано ✓";
    } catch {
      alert(bank.account);
    }
  });

  return { prepay, currency };
}

function bindReceiptUpload() {
  const input = $("#book-receipt");
  const preview = $("#receipt-preview");
  const img = $("#receipt-preview-img");
  const nameEl = $("#receipt-preview-name");
  const label = $("#receipt-upload-label");

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      preview.classList.add("hidden");
      label.textContent = "Выбрать файл";
      return;
    }
    preview.classList.remove("hidden");
    nameEl.textContent = file.name;
    label.textContent = "Заменить файл";
    if (file.type.startsWith("image/")) {
      img.src = URL.createObjectURL(file);
      img.classList.remove("hidden");
    } else {
      img.classList.add("hidden");
      img.removeAttribute("src");
    }
  });
}

function populateServiceSelect(services) {
  const serviceSelect = $("#book-service");
  if (!services?.length) {
    serviceSelect.innerHTML = `<option value="">— Добавьте услуги в админке —</option>`;
    serviceSelect.disabled = true;
    return;
  }
  serviceSelect.disabled = false;
  serviceSelect.innerHTML = services
    .map((s, i) => {
      const id = getServiceId(s, i);
      return `<option value="${id}">${s.title} — ${s.price || "цена не указана"}</option>`;
    })
    .join("");
}

function prefillFromQuery() {
  const params = new URLSearchParams(location.search);
  const serviceId = params.get("service");
  const ideaId = params.get("idea");
  const serviceSelect = $("#book-service");

  if (serviceId && serviceSelect.options.length) {
    const services = state.info.services || [];
    const match = resolveService(services, serviceId);
    const value = match ? getServiceId(match, services.indexOf(match)) : serviceId;
    const hasOption = [...serviceSelect.options].some((o) => o.value === value);
    if (hasOption) serviceSelect.value = value;
  }

  if (ideaId) {
    const ideaSelect = $("#book-idea");
    if ([...ideaSelect.options].some((o) => o.value === ideaId)) {
      ideaSelect.value = ideaId;
    }
  }
}

async function init() {
  try {
    state.info = await loadBookingInfo();
  } catch {
    $("#booking-subtitle").textContent = "Не удалось загрузить данные. Запустите python3 server.py и обновите страницу.";
    populateServiceSelect([]);
    return;
  }

  if (!state.info.availability?.length) {
    $("#booking-subtitle").textContent =
      "Выберите услугу, дату и время. Предоплата 20% фиксирует ваш слот. Свободные даты добавьте в админке → Запись.";
  }

  renderNav({ services: { items: state.info.services || [] } });
  $("#footer-text").textContent = `© ${new Date().getFullYear()} ${state.info.brand || "Takhmina.txt"}`;

  populateServiceSelect(state.info.services || []);

  const ideaSelect = $("#book-idea");
  (state.info.moodboards || []).forEach((b) => {
    ideaSelect.insertAdjacentHTML("beforeend", `<option value="${b.id}">${b.title}</option>`);
  });

  state.availability = state.info.availability || [];
  prefillFromQuery();
  updateServicePriceHint();
  renderCalendar();

  $("#book-service").addEventListener("change", updateServicePriceHint);
  bindReceiptUpload();

  $$(".booking-next").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = Number(btn.dataset.next);
      if (next === 4) renderSummary();
      setStep(next);
    });
  });

  $$(".booking-back").forEach((btn) => {
    btn.addEventListener("click", () => setStep(Number(btn.dataset.back)));
  });

  $("#cal-prev").addEventListener("click", () => {
    state.calMonth -= 1;
    if (state.calMonth < 0) {
      state.calMonth = 11;
      state.calYear -= 1;
    }
    renderCalendar();
  });

  $("#cal-next").addEventListener("click", () => {
    state.calMonth += 1;
    if (state.calMonth > 11) {
      state.calMonth = 0;
      state.calYear += 1;
    }
    renderCalendar();
  });

  $("#booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const service = getSelectedService();
    const idea = getSelectedIdea();
    const { prepay, currency } = renderSummary();
    const receiptFile = $("#book-receipt").files?.[0];
    if (!$("#book-paid").checked) {
      alert("Подтвердите, что перевели предоплату");
      return;
    }
    if (!receiptFile) {
      alert("Прикрепите чек об оплате");
      return;
    }
    const submitBtn = $(".booking-submit");
    submitBtn.disabled = true;

    try {
      submitBtn.textContent = "Загрузка чека…";
      const receiptPath = await uploadReceiptFile(receiptFile);
      submitBtn.textContent = "Отправка…";
      const result = await submitBooking({
        clientName: $("#book-name").value.trim(),
        clientPhone: $("#book-phone").value.trim(),
        clientEmail: $("#book-email").value.trim(),
        serviceId: $("#book-service").value,
        serviceTitle: service?.title || "",
        ideaId: idea?.id || "",
        ideaTitle: idea?.title || "",
        date: state.selectedDate,
        time: state.selectedTime,
        prepaymentAmount: prepay,
        prepaymentCurrency: currency,
        prepaymentPaid: true,
        receiptPath,
        notes: $("#book-notes").value.trim(),
      });
      $("#booking-form").classList.add("hidden");
      $("#booking-steps").classList.add("hidden");
      $("#booking-success").classList.remove("hidden");
      $("#success-whatsapp").href = result.whatsappUrl || state.info.phoneLink;
    } catch (err) {
      alert(err.message || "Не удалось отправить заявку");
      submitBtn.disabled = false;
      submitBtn.textContent = "Подтвердить и написать в WhatsApp";
    }
  });
}

init();
