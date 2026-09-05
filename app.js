const elements = {
  simpleMode: document.querySelector("#simpleMode"),
  workoutMode: document.querySelector("#workoutMode"),
  simpleSettings: document.querySelector("#simpleSettings"),
  workoutSettings: document.querySelector("#workoutSettings"),
  workoutDescription: document.querySelector("#workoutDescription"),
  workoutSummary: document.querySelector("#workoutSummary"),
  workoutList: document.querySelector("#workoutList"),
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

const workoutPlan = {
  description: "Workout Easy",
  exercises: [
    {
      name: "Cardio",
      workSeconds: 60,
      restSeconds: 0,
      betweenRestSeconds: 120,
      rounds: Array.from({ length: 10 }, (_, index) => ({
        label: `Sequence ${index + 1}`,
        description: `Cardio sequence ${index + 1}`,
      })),
    },
    {
      name: "Body",
      workSeconds: 40,
      restSeconds: 20,
      betweenRestSeconds: 120,
      rounds: Array.from({ length: 8 }, (_, index) => ({
        label: `Sequence ${index + 1}`,
        description: `Body sequence ${index + 1}`,
      })),
    },
    {
      name: "Abs",
      pattern: [
        { suffix: "A", seconds: 30 },
        { suffix: "B", seconds: 30 },
        { suffix: "C", seconds: 30 },
        { suffix: "D", seconds: 30 },
      ],
      restSeconds: 60,
      betweenRestSeconds: 0,
      rounds: Array.from({ length: 3 }, (_, roundIndex) =>
        ["A", "B", "C", "D"].map((suffix) => ({
          label: `Sequence ${roundIndex + 1}${suffix}`,
          description: `Abs sequence ${roundIndex + 1}${suffix}`,
        })),
      ).flat(),
    },
  ],
};

let audioContext;
let wakeLock;
let soundEnabled = true;
let running = false;
let activeMode = "simple";
let steps = [];
let currentStepIndex = 0;
let remainingMs = 0;
let phaseDurationMs = 0;
let lastTick = 0;
let lastCountdownSecond = null;
let rafId = 0;
let workoutPlanDirty = true;
let lastWorkoutActiveKey = "";

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

function buildSimpleSteps() {
  const settings = readSettings();
  const builtSteps = [];

  for (let round = 1; round <= settings.reps; round += 1) {
    builtSteps.push({
      type: "work",
      label: `Round ${round} of ${settings.reps}`,
      title: "Work",
      description: `${settings.work}s work`,
      seconds: settings.work,
      timelineKey: `work-${round}`,
    });

    if (settings.rest > 0 && round < settings.reps) {
      builtSteps.push({
        type: "rest",
        label: `Rest after round ${round}`,
        title: "Rest",
        description: `${settings.rest}s rest`,
        seconds: settings.rest,
        timelineKey: `rest-${round}`,
      });
    }
  }

  return builtSteps;
}

function buildWorkoutSteps() {
  const builtSteps = [];

  workoutPlan.exercises.forEach((exercise, exerciseIndex) => {
    const exerciseNumber = exerciseIndex + 1;

    if (exercise.pattern) {
      for (let round = 1; round <= 3; round += 1) {
        exercise.pattern.forEach((segment) => {
          const sequence = exercise.rounds.find((item) => item.label === `Sequence ${round}${segment.suffix}`);
          builtSteps.push({
            type: "work",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: sequence?.label ?? `Sequence ${round}${segment.suffix}`,
            description: sequence?.description ?? "",
            seconds: segment.seconds,
            timelineKey: `${exerciseIndex}-${round}-${segment.suffix}`,
          });
        });

        if (round < 3 && exercise.restSeconds > 0) {
          builtSteps.push({
            type: "rest",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: "Rest",
            description: `${exercise.restSeconds}s rest`,
            seconds: exercise.restSeconds,
            timelineKey: `${exerciseIndex}-${round}-rest`,
          });
        }
      }
    } else {
      exercise.rounds.forEach((round, roundIndex) => {
        builtSteps.push({
          type: "work",
          exerciseIndex,
          label: `Exercise ${exerciseNumber} - ${exercise.name}`,
          title: round.label,
          description: round.description,
          seconds: exercise.workSeconds,
          timelineKey: `${exerciseIndex}-${roundIndex}-work`,
        });

        if (exercise.restSeconds > 0 && roundIndex < exercise.rounds.length - 1) {
          builtSteps.push({
            type: "rest",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: "Rest",
            description: `${exercise.restSeconds}s rest`,
            seconds: exercise.restSeconds,
            timelineKey: `${exerciseIndex}-${roundIndex}-rest`,
          });
        }
      });
    }

    if (exercise.betweenRestSeconds > 0 && exerciseIndex < workoutPlan.exercises.length - 1) {
      builtSteps.push({
        type: "exercise-rest",
        exerciseIndex,
        label: `Rest before exercise ${exerciseNumber + 1}`,
        title: "Exercise Rest",
        description: `${exercise.betweenRestSeconds}s rest`,
        seconds: exercise.betweenRestSeconds,
        timelineKey: `${exerciseIndex}-between-rest`,
      });
    }
  });

  return builtSteps;
}

function rebuildSteps() {
  steps = activeMode === "simple" ? buildSimpleSteps() : buildWorkoutSteps();
  currentStepIndex = Math.min(currentStepIndex, Math.max(0, steps.length - 1));
  const step = currentStep();
  phaseDurationMs = step ? step.seconds * 1000 : 0;
  remainingMs = phaseDurationMs;
  lastCountdownSecond = null;
}

function currentStep() {
  return steps[currentStepIndex];
}

function setRingProgress() {
  const progress = phaseDurationMs ? remainingMs / phaseDurationMs : 0;
  elements.ring.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  elements.ring.classList.toggle("rest", currentStep()?.type !== "work");
}

function render() {
  const step = currentStep();
  elements.startPause.textContent = running ? "Pause" : "Start";
  elements.phase.className = "phase-pill";

  if (!step) {
    elements.phase.textContent = "Done";
    elements.phase.classList.add("done");
    elements.round.textContent = "Completed";
    elements.time.textContent = "00:00";
    elements.next.textContent = "Workout completed";
    setRingProgress();
    return;
  }

  const isRest = step.type !== "work";
  elements.phase.textContent = running ? step.title : "Ready";
  elements.phase.classList.toggle("rest", isRest);
  elements.round.textContent = step.label;
  elements.time.textContent = formatTime(remainingMs);
  elements.next.textContent = step.description;
  setRingProgress();

  if (activeMode === "simple") {
    renderSimpleTimeline();
    return;
  }

  const activeKey = step.timelineKey;
  if (workoutPlanDirty || activeKey !== lastWorkoutActiveKey) {
    renderWorkoutPlan();
    workoutPlanDirty = false;
    lastWorkoutActiveKey = activeKey;
  }
}

function renderSimpleTimeline() {
  const settings = readSettings();
  elements.reps.value = settings.reps;
  elements.work.value = settings.work;
  elements.rest.value = settings.rest;
  elements.timeline.innerHTML = "";

  for (let round = 1; round <= settings.reps; round += 1) {
    const workBlock = document.createElement("span");
    workBlock.title = `Round ${round}: work`;
    workBlock.classList.toggle("active", currentStep()?.timelineKey === `work-${round}`);
    elements.timeline.append(workBlock);

    if (settings.rest > 0 && round < settings.reps) {
      const restBlock = document.createElement("span");
      restBlock.className = "rest";
      restBlock.title = `Rest after round ${round}`;
      restBlock.classList.toggle("active", currentStep()?.timelineKey === `rest-${round}`);
      elements.timeline.append(restBlock);
    }
  }
}

function renderWorkoutPlan() {
  elements.workoutDescription.value = workoutPlan.description;
  elements.workoutSummary.textContent = `${workoutPlan.exercises.length} exercises`;
  elements.workoutList.innerHTML = "";
  const active = currentStep();

  workoutPlan.exercises.forEach((exercise, exerciseIndex) => {
    const card = document.createElement("article");
    card.className = "exercise-card";

    const title = document.createElement("h3");
    title.textContent = `Exercise ${exerciseIndex + 1} - ${exercise.name}`;
    card.append(title);

    const meta = document.createElement("div");
    meta.className = "exercise-meta";
    meta.append(textLine(formatExerciseTiming(exercise)));
    meta.append(textLine(`${exercise.rounds.length} sequences`));
    card.append(meta);

    const list = document.createElement("div");
    list.className = "sequence-list";
    exercise.rounds.forEach((round) => {
      const item = document.createElement("label");
      item.className = "sequence-item";
      item.classList.toggle("active", active?.description === round.description && active?.exerciseIndex === exerciseIndex);

      const label = document.createElement("span");
      label.className = "sequence-label";
      label.textContent = round.label;

      const input = document.createElement("input");
      input.type = "text";
      input.value = round.description;
      input.addEventListener("change", () => {
        round.description = input.value.trim() || round.label;
        if (!running) rebuildSteps();
        workoutPlanDirty = true;
        render();
      });

      item.append(label, input);
      list.append(item);
    });
    card.append(list);

    if (exercise.betweenRestSeconds > 0 && exerciseIndex < workoutPlan.exercises.length - 1) {
      const restField = document.createElement("label");
      restField.className = "field rest-row";

      const label = document.createElement("span");
      label.textContent = "Rest before next exercise";

      const inputUnit = document.createElement("div");
      inputUnit.className = "input-unit";
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "0";
      input.max = "3600";
      input.value = exercise.betweenRestSeconds;
      input.addEventListener("change", () => {
        exercise.betweenRestSeconds = clampNumber(input.value, 0, 3600, 120);
        if (!running) rebuildSteps();
        workoutPlanDirty = true;
        render();
      });
      const unit = document.createElement("span");
      unit.textContent = "s";
      inputUnit.append(input, unit);
      restField.append(label, inputUnit);
      card.append(restField);
    }

    elements.workoutList.append(card);
  });
}

function textLine(text) {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
}

function formatExerciseTiming(exercise) {
  if (exercise.pattern) {
    const pattern = exercise.pattern.map((item) => `${item.suffix} ${item.seconds}s`).join(", ");
    return `Timing: 3 rounds of ${pattern}, ${exercise.restSeconds}s rest`;
  }

  return `Timing: ${exercise.rounds.length} rounds, ${exercise.workSeconds}s work, ${exercise.restSeconds}s rest`;
}

function resetTimer() {
  running = false;
  currentStepIndex = 0;
  rebuildSteps();
  workoutPlanDirty = true;
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

  if (!currentStep()) resetTimer();
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

  playCountdownTick();
  if (remainingMs <= 0) advancePhase();
  render();
  rafId = requestAnimationFrame(tick);
}

function playCountdownTick() {
  if (remainingMs <= 0 || remainingMs > 3000) return;

  const countdownSecond = Math.ceil(remainingMs / 1000);
  if (countdownSecond < 1 || countdownSecond > 3 || countdownSecond === lastCountdownSecond) return;

  lastCountdownSecond = countdownSecond;
  playTone("tick");
}

function advancePhase() {
  const previousStep = currentStep();
  currentStepIndex += 1;
  const nextStep = currentStep();

  if (!nextStep) {
    running = false;
    remainingMs = 0;
    phaseDurationMs = 0;
    lastCountdownSecond = null;
    playTone("finish");
    releaseWakeLock();
    return;
  }

  phaseDurationMs = nextStep.seconds * 1000;
  remainingMs = phaseDurationMs;
  lastCountdownSecond = null;
  playTone(previousStep?.type === "work" ? "stop" : "start");
}

function setMode(mode) {
  if (mode === activeMode) return;
  activeMode = mode;
  elements.simpleMode.classList.toggle("active", mode === "simple");
  elements.workoutMode.classList.toggle("active", mode === "workout");
  elements.simpleMode.setAttribute("aria-selected", String(mode === "simple"));
  elements.workoutMode.setAttribute("aria-selected", String(mode === "workout"));
  elements.simpleSettings.classList.toggle("hidden", mode !== "simple");
  elements.workoutSettings.classList.toggle("hidden", mode !== "workout");
  workoutPlanDirty = true;
  resetTimer();
}

function vibrate(pattern) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

function playTone(type) {
  if (!soundEnabled) return;
  audioContext ||= new AudioContext();
  const now = audioContext.currentTime;
  const peakVolume = 0.85;
  const tones = {
    start: [
      [880, 0, 0.18],
      [1175, 0.2, 0.22],
    ],
    stop: [
      [392, 0, 0.18],
      [330, 0.2, 0.26],
    ],
    tick: [[1568, 0, 0.08]],
    finish: [
      [880, 0, 0.18],
      [988, 0.22, 0.18],
      [1320, 0.44, 0.34],
    ],
  }[type];

  const vibrationPatterns = {
    start: [120, 40, 120],
    stop: [260],
    tick: [40],
    finish: [160, 60, 160, 60, 260],
  };

  vibrate(vibrationPatterns[type]);

  tones.forEach(([frequency, delay, duration]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(peakVolume, now + delay + 0.015);
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
      if (!running && activeMode === "simple") resetTimer();
    });
  });
});

elements.workoutDescription.addEventListener("change", () => {
  workoutPlan.description = elements.workoutDescription.value.trim() || "Workout Easy";
  workoutPlanDirty = true;
  render();
});
elements.simpleMode.addEventListener("click", () => setMode("simple"));
elements.workoutMode.addEventListener("click", () => setMode("workout"));
elements.startPause.addEventListener("click", startPause);
elements.reset.addEventListener("click", resetTimer);
elements.soundToggle.addEventListener("click", toggleSound);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

resetTimer();
