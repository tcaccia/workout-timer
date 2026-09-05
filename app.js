const elements = {
  reps: document.querySelector("#repsInput"),
  work: document.querySelector("#workInput"),
  rest: document.querySelector("#restInput"),
  phase: document.querySelector("#phaseLabel"),
  round: document.querySelector("#roundLabel"),
  time: document.querySelector("#timeLabel"),
  next: document.querySelector("#nextLabel"),
  startPause: document.querySelector("#startPause"),
  reset: document.querySelector("#reset"),
  soundToggle: document.querySelector("#soundToggle"),
  soundIcon: document.querySelector("#soundIcon"),
  ring: document.querySelector("#ringProgress"),
  timeline: document.querySelector("#timeline"),
};

const radius = 104;
const circumference = 2 * Math.PI * radius;
elements.ring.style.strokeDasharray = `${circumference}`;

let audioContext;
let wakeLock;
let soundEnabled = true;
let running = false;
let phase = "work";
let currentRep = 1;
let remainingMs = readSettings().work * 1000;
let phaseDurationMs = remainingMs;
let lastTick = 0;
let rafId = 0;

function readSettings() {
  return {
    reps: clampNumber(elements.reps.value, 1, 99, 10),
    work: clampNumber(elements.work.value, 1, 3600, 40),
    rest: clampNumber(elements.rest.value, 0, 3600, 20),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function formatTime(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function setRingProgress() {
  const progress = phaseDurationMs ? remainingMs / phaseDurationMs : 0;
  elements.ring.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  elements.ring.classList.toggle("rest", phase === "rest");
}

function render() {
  const settings = readSettings();
  elements.reps.value = settings.reps;
  elements.work.value = settings.work;
  elements.rest.value = settings.rest;
  elements.time.textContent = formatTime(remainingMs);
  elements.round.textContent = currentRep > settings.reps ? "Completed" : `Round ${currentRep} of ${settings.reps}`;
  elements.startPause.textContent = running ? "Pause" : "Start";
  elements.phase.className = "phase-pill";

  if (currentRep > settings.reps) {
    elements.phase.textContent = "Done";
    elements.phase.classList.add("done");
    elements.next.textContent = "Workout completed";
  } else if (phase === "rest") {
    elements.phase.textContent = "Rest";
    elements.phase.classList.add("rest");
    elements.next.textContent = `Then round ${currentRep + 1} of ${settings.reps}`;
  } else {
    elements.phase.textContent = running ? "Work" : "Ready";
    elements.next.textContent = `${settings.reps} rounds, ${settings.rest}s rest`;
  }

  setRingProgress();
  renderTimeline(settings);
}

function renderTimeline(settings) {
  elements.timeline.innerHTML = "";
  for (let i = 1; i <= settings.reps; i += 1) {
    const workBlock = document.createElement("span");
    workBlock.title = `Round ${i}: work`;
    elements.timeline.append(workBlock);

    if (settings.rest > 0 && i < settings.reps) {
      const restBlock = document.createElement("span");
      restBlock.className = "rest";
      restBlock.title = `Rest after round ${i}`;
      elements.timeline.append(restBlock);
    }
  }
}

function resetTimer() {
  const settings = readSettings();
  running = false;
  phase = "work";
  currentRep = 1;
  phaseDurationMs = settings.work * 1000;
  remainingMs = phaseDurationMs;
  cancelAnimationFrame(rafId);
  releaseWakeLock();
  render();
}

function startPause() {
  if (running) {
    running = false;
    cancelAnimationFrame(rafId);
    releaseWakeLock();
    render();
    return;
  }

  if (currentRep > readSettings().reps) resetTimer();
  running = true;
  lastTick = performance.now();
  playTone("start");
  requestWakeLock();
  rafId = requestAnimationFrame(tick);
  render();
}

function tick(now) {
  if (!running) return;
  const elapsed = now - lastTick;
  lastTick = now;
  remainingMs -= elapsed;

  if (remainingMs <= 0) advancePhase();
  render();
  rafId = requestAnimationFrame(tick);
}

function advancePhase() {
  const settings = readSettings();

  if (phase === "work" && settings.rest > 0 && currentRep < settings.reps) {
    phase = "rest";
    phaseDurationMs = settings.rest * 1000;
    remainingMs = phaseDurationMs;
    playTone("stop");
    return;
  }

  if (phase === "rest") {
    currentRep += 1;
    phase = "work";
    phaseDurationMs = settings.work * 1000;
    remainingMs = phaseDurationMs;
    playTone("start");
    return;
  }

  currentRep += 1;
  if (currentRep <= settings.reps) {
    phaseDurationMs = settings.work * 1000;
    remainingMs = phaseDurationMs;
    playTone("start");
  } else {
    running = false;
    remainingMs = 0;
    playTone("finish");
    releaseWakeLock();
  }
}

function playTone(type) {
  if (!soundEnabled) return;
  audioContext ||= new AudioContext();
  const now = audioContext.currentTime;
  const tones = {
    start: [
      [880, 0, 0.12],
      [1175, 0.15, 0.12],
    ],
    stop: [[330, 0, 0.22]],
    finish: [
      [880, 0, 0.14],
      [988, 0.16, 0.14],
      [1320, 0.32, 0.24],
    ],
  }[type];

  tones.forEach(([frequency, delay, duration]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.22, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.03);
  });
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.release();
  wakeLock = null;
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  elements.soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  elements.soundToggle.title = soundEnabled ? "Sound on" : "Sound off";
  elements.soundIcon.textContent = soundEnabled ? "♪" : "×";
}

["input", "change"].forEach((eventName) => {
  [elements.reps, elements.work, elements.rest].forEach((input) => {
    input.addEventListener(eventName, () => {
      if (!running) resetTimer();
    });
  });
});

elements.startPause.addEventListener("click", startPause);
elements.reset.addEventListener("click", resetTimer);
elements.soundToggle.addEventListener("click", toggleSound);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

resetTimer();
