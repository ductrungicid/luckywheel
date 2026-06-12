const wheelCanvas = document.getElementById("wheelCanvas");
const wheelTrigger = document.getElementById("wheelTrigger");
const wheelTriggerText = document.getElementById("wheelTriggerText");
const selectedValue = document.getElementById("selectedValue");
const statusText = document.getElementById("statusText");
const powerFill = document.getElementById("powerFill");
const powerValue = document.getElementById("powerValue");

const ctx = wheelCanvas.getContext("2d");
const palette = ["#f6c445", "#d62839", "#1d9bf0", "#2a9d55", "#7b2cbf", "#f77f00"];
const topOffset = -Math.PI / 2;

let settings = null;
let wheelSegments = [];
let wheelColors = [];
let rotation = 0;
let spinning = false;
let stopDuration = 3000;
let currentVelocity = 0;
let activeAnimationId = null;
let lastFrameTime = 0;
let chosenIndex = null;
let charging = false;
let chargeStartTime = 0;
let chargeLevel = 0;
let chargeAnimationId = null;
let activePointerId = null;
let spinStartTime = 0;
let spinInitialVelocity = 0;

function getMaxRpm() {
  return Number(settings?.max_rpm) || 300;
}

function getMaxAngularVelocity() {
  return (getMaxRpm() / 60) * Math.PI * 2;
}

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function buildColors(count) {
  if (count <= 0) {
    return [];
  }

  const colors = [];
  for (let index = 0; index < count; index += 1) {
    const previousColor = colors[index - 1];
    let availableColors = palette.filter((color) => color !== previousColor);

    if (index === count - 1 && count > 2 && colors[0]) {
      const withoutFirst = availableColors.filter((color) => color !== colors[0]);
      if (withoutFirst.length > 0) {
        availableColors = withoutFirst;
      }
    }

    colors.push(getRandomItem(availableColors));
  }

  return colors;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveWheelSegments(segments) {
  const explicitTotal = segments.reduce((sum, segment) => {
    const weight = normalizeNumber(segment.weight_percent);
    return weight === null ? sum : sum + weight;
  }, 0);

  const unsetCount = segments.filter((segment) => normalizeNumber(segment.weight_percent) === null).length;
  const remaining = Math.max(0, 100 - explicitTotal);
  const equalShare = unsetCount > 0 ? remaining / unsetCount : 0;

  let cursor = 0;
  return segments.map((segment) => {
    const configuredWeight = normalizeNumber(segment.weight_percent);
    const resolvedPercent = configuredWeight === null ? equalShare : configuredWeight;
    const angle = (resolvedPercent / 100) * Math.PI * 2;
    const resolved = {
      label: segment.label,
      originalIndex: segment.originalIndex,
      weight_percent: configuredWeight,
      resolved_percent: resolvedPercent,
      startAngle: (cursor / 100) * Math.PI * 2,
      endAngle: ((cursor + resolvedPercent) / 100) * Math.PI * 2,
      angle,
    };
    cursor += resolvedPercent;
    return resolved;
  });
}

function refreshWheelData() {
  const randomizedSegments = shuffleArray(
    (settings?.segments ?? []).map((segment, index) => ({
      ...segment,
      originalIndex: index,
    })),
  );
  wheelSegments = resolveWheelSegments(randomizedSegments);
  wheelColors = buildColors(wheelSegments.length);
}

function fetchSettings() {
  return fetch("/api/settings")
    .then((response) => response.json())
    .then((data) => {
      settings = data;
      refreshWheelData();
      drawWheel();
      setChargeLevel(0);
      updateIdleState();
    });
}

function setChargeLevel(level) {
  chargeLevel = Math.max(0, Math.min(1, level));
  const rpm = Math.round(chargeLevel * getMaxRpm());
  powerValue.textContent = String(rpm);

  if (window.innerWidth <= 920) {
    powerFill.style.width = `${chargeLevel * 100}%`;
    powerFill.style.height = "100%";
  } else {
    powerFill.style.height = `${chargeLevel * 100}%`;
    powerFill.style.width = "100%";
  }
}

function getOscillatingChargeLevel(elapsed, chargeDuration) {
  if (chargeDuration <= 0) {
    return 0;
  }

  const cycleDuration = chargeDuration * 2;
  const cyclePosition = elapsed % cycleDuration;
  if (cyclePosition <= chargeDuration) {
    return cyclePosition / chargeDuration;
  }

  return 1 - ((cyclePosition - chargeDuration) / chargeDuration);
}

function updateReadyButton() {
  wheelTriggerText.textContent = "Quay";
  wheelTrigger.disabled = !settings || settings.segments.length < 2;
}

function updateIdleState(message = "Giữ nút ở tâm vòng quay để nạp lực, thả ra để quay.") {
  updateReadyButton();
  updateResultPanel("Sẵn sàng quay", message);
}

function updateResultPanel(title, message, shouldPop = false) {
  selectedValue.textContent = title;
  statusText.textContent = message;
  selectedValue.classList.remove("pop");
  if (shouldPop) {
    void selectedValue.offsetWidth;
    selectedValue.classList.add("pop");
  }
}

function normalizeAngle(angle) {
  return ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
}

function getWinningIndex() {
  const pointerAngle = normalizeAngle(-rotation);
  return wheelSegments.findIndex((segment) => pointerAngle >= segment.startAngle && pointerAngle < segment.endAngle);
}

function drawWheel(highlightIndex = null) {
  if (!settings || wheelSegments.length === 0) {
    return;
  }

  const { width, height } = wheelCanvas;
  const radius = Math.min(width, height) / 2 - 30;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);

  wheelSegments.forEach((segment, index) => {
    const start = topOffset + segment.startAngle;
    const end = topOffset + segment.endAngle;
    const mid = start + (segment.angle / 2);
    const isHighlight = index === highlightIndex;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, isHighlight ? radius + 10 : radius, start, end);
    ctx.closePath();
    ctx.fillStyle = wheelColors[index] || palette[index % palette.length];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();

    ctx.save();
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fffef8";
    ctx.font = `${isHighlight ? "700 29px" : "600 22px"} "Segoe UI", sans-serif`;
    const textRadius = Math.max(92, radius - 56);
    const availableWidth = Math.max(90, Math.min(170, segment.angle * radius * 0.72));
    wrapText(segment.label, textRadius, 0, availableWidth, isHighlight ? 28 : 24);
    ctx.restore();
  });

  ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  const lines = [];

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });

  if (line) {
    lines.push(line);
  }

  const offset = ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((item, index) => {
    ctx.fillText(item, x, y - offset + (index * lineHeight));
  });
}

function animate(timestamp) {
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const delta = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;
  if (!spinning) {
    activeAnimationId = null;
    return;
  }

  const elapsed = timestamp - spinStartTime;
  const elapsedSeconds = elapsed / 1000;
  const durationSeconds = stopDuration / 1000;
  const deceleration = spinInitialVelocity / durationSeconds;
  currentVelocity = Math.max(spinInitialVelocity - (deceleration * elapsedSeconds), 0);
  rotation += currentVelocity * delta;
  setChargeLevel(currentVelocity / getMaxAngularVelocity());
  drawWheel();

  if (currentVelocity > 0) {
    activeAnimationId = requestAnimationFrame(animate);
    return;
  }

  spinning = false;
  activeAnimationId = null;
  lastFrameTime = 0;
  setChargeLevel(0);
  chosenIndex = getWinningIndex();
  drawWheel(chosenIndex);
  const label = wheelSegments[chosenIndex]?.label || "Không xác định";
  updateResultPanel(label, "Bạn đã quay trúng ô này.", true);
  updateReadyButton();
}

function startSpin() {
  if (!settings || settings.segments.length < 2 || spinning) {
    return;
  }

  chosenIndex = null;
  spinning = true;
  const maxAngularVelocity = getMaxAngularVelocity();
  currentVelocity = Math.max(maxAngularVelocity * 0.15, chargeLevel * maxAngularVelocity);
  spinInitialVelocity = currentVelocity;
  spinStartTime = performance.now();
  const normalizedForce = currentVelocity / maxAngularVelocity;
  stopDuration = Math.max(300, settings.deceleration_seconds * normalizedForce * 1000);
  wheelTriggerText.textContent = "Đang";
  wheelTrigger.disabled = true;
  updateResultPanel(
    "Đang quay...",
    `Tốc độ ${Math.round(normalizedForce * getMaxRpm())} vòng/phút. Thời gian quay ${Math.max(stopDuration / 1000, 0.3).toFixed(1)} giây.`,
  );
  lastFrameTime = 0;
  activeAnimationId = requestAnimationFrame(animate);
}

function tickCharge(timestamp) {
  if (!charging) {
    chargeAnimationId = null;
    return;
  }

  const elapsed = timestamp - chargeStartTime;
  const chargeDuration = (settings?.charge_seconds ?? 2.2) * 1000;
  setChargeLevel(getOscillatingChargeLevel(elapsed, chargeDuration));
  updateResultPanel(
    "Đang nạp lực...",
    `Thanh lực đang lên xuống liên tục. Thả nút để chốt ${Math.round(chargeLevel * getMaxRpm())} vòng/phút.`,
  );
  chargeAnimationId = requestAnimationFrame(tickCharge);
}

function startCharging(event) {
  if (!settings || settings.segments.length < 2 || spinning || charging) {
    return;
  }

  event.preventDefault();
  charging = true;
  activePointerId = event.pointerId;
  chargeStartTime = performance.now();
  setChargeLevel(0);
  updateResultPanel("Đang nạp lực...", "Giữ nút ở tâm càng lâu, lực quay càng cao.");
  wheelTriggerText.textContent = "Thả";
  wheelTrigger.setPointerCapture(event.pointerId);
  chargeAnimationId = requestAnimationFrame(tickCharge);
}

function releaseCharge(event) {
  if (!charging || (event && activePointerId !== null && event.pointerId !== activePointerId)) {
    return;
  }

  if (event) {
    event.preventDefault();
  }

  charging = false;
  if (chargeAnimationId) {
    cancelAnimationFrame(chargeAnimationId);
    chargeAnimationId = null;
  }

  if (activePointerId !== null && wheelTrigger.hasPointerCapture(activePointerId)) {
    wheelTrigger.releasePointerCapture(activePointerId);
  }
  activePointerId = null;

  if (chargeLevel <= 0) {
    setChargeLevel(0.15);
  }

  startSpin();
}

wheelTrigger.addEventListener("pointerdown", (event) => {
  startCharging(event);
});

wheelTrigger.addEventListener("pointerup", releaseCharge);
wheelTrigger.addEventListener("pointercancel", releaseCharge);
wheelTrigger.addEventListener("lostpointercapture", releaseCharge);
wheelTrigger.addEventListener("pointerleave", (event) => {
  if (charging && event.buttons === 0) {
    releaseCharge(event);
  }
});

window.addEventListener("resize", () => setChargeLevel(chargeLevel));

fetchSettings();
