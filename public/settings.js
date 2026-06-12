const segmentCountInput = document.getElementById("segmentCount");
const decelerationSecondsInput = document.getElementById("decelerationSeconds");
const chargeSecondsInput = document.getElementById("chargeSeconds");
const segmentsTableBody = document.getElementById("segmentsTableBody");
const percentSummary = document.getElementById("percentSummary");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const settingsMessage = document.getElementById("settingsMessage");

let settings = null;

function setMessage(message, isError = false) {
  settingsMessage.textContent = message;
  settingsMessage.style.color = isError ? "#7d1010" : "#7a5a45";
}

function createDefaultSegment(index) {
  return {
    label: `Phần thưởng ${index + 1}`,
    weight_percent: null,
  };
}

function normalizeSegments(segments, targetCount) {
  const next = [];
  for (let index = 0; index < targetCount; index += 1) {
    const current = segments[index];
    if (current) {
      next.push({
        label: String(current.label || "").trim() || `Phần thưởng ${index + 1}`,
        weight_percent: current.weight_percent === "" || current.weight_percent === null || current.weight_percent === undefined
          ? null
          : Number(current.weight_percent),
      });
    } else {
      next.push(createDefaultSegment(index));
    }
  }
  return next;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSegmentsTable(segments) {
  segmentsTableBody.innerHTML = "";
  segments.forEach((segment, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><input class="table-input" type="text" data-field="label" value="${escapeHtml(segment.label)}"></td>
      <td><input class="table-input" type="number" min="1" max="50" step="1" data-field="weight_percent" value="${segment.weight_percent ?? ""}" placeholder="Để trống"></td>
    `;
    segmentsTableBody.appendChild(row);
  });
}

function getSegmentsFromTable() {
  const rows = [...segmentsTableBody.querySelectorAll("tr")];
  return rows.map((row, index) => {
    const labelInput = row.querySelector('[data-field="label"]');
    const percentInput = row.querySelector('[data-field="weight_percent"]');
    const label = labelInput.value.trim() || `Phần thưởng ${index + 1}`;
    const rawPercent = percentInput.value.trim();
    return {
      label,
      weight_percent: rawPercent === "" ? null : Number(rawPercent),
    };
  });
}

function calculatePercentState(segments) {
  let explicitTotal = 0;
  let unsetCount = 0;
  let hasInvalidPercent = false;

  segments.forEach((segment) => {
    if (segment.weight_percent === null || segment.weight_percent === undefined || Number.isNaN(segment.weight_percent)) {
      unsetCount += 1;
      return;
    }

    if (segment.weight_percent < 1 || segment.weight_percent > 50) {
      hasInvalidPercent = true;
      return;
    }

    explicitTotal += segment.weight_percent;
  });

  return {
    explicitTotal,
    unsetCount,
    remaining: 100 - explicitTotal,
    hasInvalidPercent,
  };
}

function updatePercentSummary() {
  const state = calculatePercentState(getSegmentsFromTable());

  if (state.hasInvalidPercent) {
    percentSummary.textContent = "Có tỷ lệ ngoài khoảng 1-50%";
    percentSummary.classList.add("summary-error");
    return false;
  }

  if (state.explicitTotal > 100) {
    percentSummary.textContent = `Tổng đã đặt ${state.explicitTotal}% vượt quá 100%`;
    percentSummary.classList.add("summary-error");
    return false;
  }

  if (state.unsetCount === 0 && state.explicitTotal < 100) {
    percentSummary.textContent = `Thiếu ${state.remaining}% và không còn ô trống để chia`;
    percentSummary.classList.add("summary-error");
    return false;
  }

  percentSummary.classList.remove("summary-error");
  if (state.unsetCount > 0) {
    percentSummary.textContent = `Đã đặt ${state.explicitTotal}%, còn ${state.remaining}% chia đều cho ${state.unsetCount} ô`;
  } else {
    percentSummary.textContent = "Tổng tỷ lệ đã đủ 100%";
  }
  return true;
}

function fillForm() {
  segmentCountInput.value = settings.segments.length;
  decelerationSecondsInput.value = settings.deceleration_seconds;
  chargeSecondsInput.value = settings.charge_seconds;
  renderSegmentsTable(settings.segments);
  updatePercentSummary();
}

function loadSettings() {
  fetch("/api/settings")
    .then((response) => response.json())
    .then((data) => {
      settings = data;
      fillForm();
    })
    .catch(() => {
      setMessage("Không tải được cài đặt.", true);
    });
}

function syncSegmentCount() {
  const count = Number.parseInt(segmentCountInput.value, 10);
  if (!Number.isInteger(count) || count < 2) {
    setMessage("Số ô phải lớn hơn 1.", true);
    return;
  }

  settings.segments = normalizeSegments(getSegmentsFromTable(), count);
  renderSegmentsTable(settings.segments);
  updatePercentSummary();
  setMessage("Bảng nội dung đã được cập nhật theo số lượng ô.");
}

function readForm() {
  const count = Number.parseInt(segmentCountInput.value, 10);
  const deceleration = Number.parseFloat(decelerationSecondsInput.value);
  const chargeSeconds = Number.parseFloat(chargeSecondsInput.value);
  const segments = getSegmentsFromTable();
  const state = calculatePercentState(segments);

  if (!Number.isInteger(count) || count < 2) {
    throw new Error("Số ô phải lớn hơn 1.");
  }
  if (!Number.isFinite(deceleration) || deceleration < 0.5) {
    throw new Error("Thời gian giảm tốc tối đa phải từ 0.5 giây trở lên.");
  }
  if (!Number.isFinite(chargeSeconds) || chargeSeconds < 0.2) {
    throw new Error("Thời gian nạp lực phải từ 0.2 giây trở lên.");
  }
  if (segments.length !== count) {
    throw new Error("Số dòng trong bảng phải khớp với số ô.");
  }
  if (state.hasInvalidPercent) {
    throw new Error("Mỗi tỷ lệ phải nằm trong khoảng từ 1 đến 50% hoặc để trống.");
  }
  if (state.explicitTotal > 100) {
    throw new Error("Tổng tỷ lệ của tất cả các ô không được vượt quá 100%.");
  }
  if (state.unsetCount === 0 && state.explicitTotal < 100) {
    throw new Error("Nếu tất cả các ô đều được đặt tỷ lệ, tổng phải đúng bằng 100%.");
  }

  return {
    segments,
    deceleration_seconds: deceleration,
    charge_seconds: chargeSeconds,
  };
}

function saveSettings() {
  let payload;
  try {
    payload = readForm();
  } catch (error) {
    setMessage(error.message, true);
    return;
  }

  fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Lưu cài đặt thất bại.");
      }
      return response.json();
    })
    .then((data) => {
      settings = data;
      fillForm();
      setMessage("Đã lưu cài đặt.");
    })
    .catch((error) => {
      setMessage(error.message, true);
    });
}

segmentCountInput.addEventListener("input", syncSegmentCount);
segmentCountInput.addEventListener("change", syncSegmentCount);
segmentsTableBody.addEventListener("input", () => {
  updatePercentSummary();
});
saveSettingsButton.addEventListener("click", saveSettings);

loadSettings();
