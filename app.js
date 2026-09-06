const elements = {
  simpleMode: document.querySelector("#simpleMode"),
  workoutMode: document.querySelector("#workoutMode"),
  savedMode: document.querySelector("#savedMode"),
  aboutMode: document.querySelector("#aboutMode"),
  simpleSettings: document.querySelector("#simpleSettings"),
  workoutSettings: document.querySelector("#workoutSettings"),
  savedSettings: document.querySelector("#savedSettings"),
  aboutSettings: document.querySelector("#aboutSettings"),
  workoutTitle: document.querySelector("#workoutTitle"),
  workoutDescription: document.querySelector("#workoutDescription"),
  workoutSummary: document.querySelector("#workoutSummary"),
  exerciseCount: document.querySelector("#exerciseCount"),
  workoutList: document.querySelector("#workoutList"),
  addExercise: document.querySelector("#addExercise"),
  saveWorkout: document.querySelector("#saveWorkout"),
  savedSummary: document.querySelector("#savedSummary"),
  savedList: document.querySelector("#savedList"),
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
const STORAGE_KEY = "workout-timer-plan-v1";
const SAVED_WORKOUTS_KEY = "workout-timer-saved-workouts-v1";
const nativePreferences = window.Capacitor?.Plugins?.Preferences;
const DEFAULT_PATTERN = [
  { suffix: "A", seconds: 30 },
  { suffix: "B", seconds: 30 },
  { suffix: "C", seconds: 30 },
  { suffix: "D", seconds: 30 },
];

elements.ring.style.strokeDasharray = `${circumference}`;

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
let nextExerciseId = 1;

const workoutPlan = loadWorkoutPlan();
let savedWorkouts = loadSavedWorkouts();

async function hydrateNativeStorage() {
  if (!nativePreferences) return;

  try {
    const [storedPlan, storedSaved] = await Promise.all([nativePreferences.get({ key: STORAGE_KEY }), nativePreferences.get({ key: SAVED_WORKOUTS_KEY })]);
    if (storedPlan.value) {
      replaceWorkoutPlan(JSON.parse(storedPlan.value));
    }
    if (storedSaved.value) {
      savedWorkouts = normalizeSavedWorkouts(JSON.parse(storedSaved.value));
    }
  } catch {
    savedWorkouts = loadSavedWorkouts();
  }
  render();
}

function writeStorage(key, value) {
  const payload = JSON.stringify(value);
  localStorage.setItem(key, payload);
  nativePreferences?.set({ key, value: payload }).catch(() => {});
}

function loadWorkoutPlan() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.exercises?.length) return normalizeWorkoutPlan(stored);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return normalizeWorkoutPlan({
    description: "Workout Easy",
    exercises: [
      createExercise({ name: "Cardio", mode: "single", rounds: 10, workSeconds: 60, restSeconds: 0, betweenRestSeconds: 120 }),
      createExercise({ name: "Body", mode: "single", rounds: 8, workSeconds: 40, restSeconds: 20, betweenRestSeconds: 120 }),
      createExercise({ name: "Abs", mode: "abcd", rounds: 3, restSeconds: 60, betweenRestSeconds: 0 }),
    ],
  });
}

function loadSavedWorkouts() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVED_WORKOUTS_KEY));
    if (Array.isArray(stored)) return normalizeSavedWorkouts(stored);
  } catch {
    localStorage.removeItem(SAVED_WORKOUTS_KEY);
  }

  return [];
}

function normalizeSavedWorkouts(workouts) {
  return workouts
    .filter((item) => item?.plan?.exercises?.length)
    .map((item) => ({
      id: item.id || `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: item.name || item.plan.description || "Saved workout",
      savedAt: item.savedAt || new Date().toISOString(),
      plan: normalizeWorkoutPlan(item.plan),
    }));
}

function saveSavedWorkouts() {
  writeStorage(SAVED_WORKOUTS_KEY, savedWorkouts);
}

function normalizeWorkoutPlan(plan) {
  const normalized = {
    description: plan.description || "Workout Easy",
    exercises: plan.exercises.map((exercise, index) =>
      createExercise({
        id: exercise.id,
        name: exercise.name || `Exercise ${index + 1}`,
        mode: exercise.mode === "abcd" ? "abcd" : "single",
        rounds: exercise.rounds,
        workSeconds: exercise.workSeconds,
        restSeconds: exercise.restSeconds,
        betweenRestSeconds: exercise.betweenRestSeconds,
        pattern: exercise.pattern,
        sequences: exercise.sequences,
      }),
    ),
  };

  ensureExerciseCount(normalized.exercises.length, normalized);
  return normalized;
}

function cloneWorkoutPlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function replaceWorkoutPlan(plan) {
  const normalized = normalizeWorkoutPlan(plan);
  workoutPlan.description = normalized.description;
  workoutPlan.exercises = normalized.exercises;
  saveWorkoutPlan();
  workoutPlanDirty = true;
  resetTimer();
}

function addExercise() {
  workoutPlan.exercises.push(createExercise({ name: `Exercise ${workoutPlan.exercises.length + 1}` }));
  applyWorkoutChange(true);
}

function duplicateExercise(index) {
  const source = workoutPlan.exercises[index];
  const copy = createExercise({
    ...cloneWorkoutPlan(source),
    id: undefined,
    name: `${source.name} Copy`,
  });
  workoutPlan.exercises.splice(index + 1, 0, copy);
  applyWorkoutChange(true);
}

function moveExercise(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= workoutPlan.exercises.length) return;

  const [exercise] = workoutPlan.exercises.splice(index, 1);
  workoutPlan.exercises.splice(nextIndex, 0, exercise);
  applyWorkoutChange(true);
}

function deleteExercise(index) {
  if (workoutPlan.exercises.length <= 1) return;
  if (!confirm("Delete this exercise?")) return;

  workoutPlan.exercises.splice(index, 1);
  applyWorkoutChange(true);
}

function createExercise(options = {}) {
  const exercise = {
    id: options.id || `exercise-${Date.now()}-${nextExerciseId++}`,
    name: options.name || "New exercise",
    mode: options.mode === "abcd" ? "abcd" : "single",
    rounds: clampNumber(options.rounds, 1, 99, 3),
    workSeconds: clampNumber(options.workSeconds, 1, 3600, 40),
    restSeconds: clampNumber(options.restSeconds, 0, 3600, 20),
    betweenRestSeconds: clampNumber(options.betweenRestSeconds, 0, 3600, 0),
    pattern: normalizePattern(options.pattern),
    sequences: Array.isArray(options.sequences) ? options.sequences : [],
  };

  syncExerciseSequences(exercise);
  return exercise;
}

function normalizePattern(pattern) {
  if (!Array.isArray(pattern) || pattern.length !== DEFAULT_PATTERN.length) return DEFAULT_PATTERN.map((item) => ({ ...item }));
  return DEFAULT_PATTERN.map((item, index) => ({
    suffix: item.suffix,
    seconds: clampNumber(pattern[index]?.seconds, 1, 3600, item.seconds),
  }));
}

function ensureExerciseCount(count, plan = workoutPlan) {
  const target = clampNumber(count, 1, 12, 1);
  while (plan.exercises.length < target) {
    plan.exercises.push(createExercise({ name: `Exercise ${plan.exercises.length + 1}` }));
  }
  plan.exercises.length = target;
  plan.exercises.forEach(syncExerciseSequences);
}

function sequenceLabels(exercise) {
  if (exercise.mode === "abcd") {
    return Array.from({ length: exercise.rounds }, (_, roundIndex) =>
      exercise.pattern.map((segment) => `Sequence ${roundIndex + 1}${segment.suffix}`),
    ).flat();
  }

  return Array.from({ length: exercise.rounds }, (_, index) => `Sequence ${index + 1}`);
}

function syncExerciseSequences(exercise, options = {}) {
  const preserveByIndex = options.preserveByIndex ?? true;
  const existingByLabel = new Map(exercise.sequences.map((sequence) => [sequence.label, sequence.description]));
  const labels = sequenceLabels(exercise);
  exercise.sequences = labels.map((label, index) => ({
    label,
    description: existingByLabel.get(label) || (preserveByIndex ? exercise.sequences[index]?.description : "") || `${exercise.name} ${label}`,
  }));
}

function saveWorkoutPlan() {
  writeStorage(STORAGE_KEY, workoutPlan);
}

function readSettings() {
  return {
    reps: clampNumber(elements.reps.value, 1, 99, 1),
    work: clampNumber(elements.work.value, 1, 3600, 1),
    rest: clampNumber(elements.rest.value, 0, 3600, 0),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function hasValidInteger(value, min, max) {
  if (value === "") return false;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= min && number <= max;
}

function setInputValueWhenBlurred(input, value) {
  if (document.activeElement !== input) input.value = value;
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
    syncExerciseSequences(exercise);
    const exerciseNumber = exerciseIndex + 1;

    if (exercise.mode === "abcd") {
      for (let round = 1; round <= exercise.rounds; round += 1) {
        exercise.pattern.forEach((segment) => {
          const sequence = exercise.sequences.find((item) => item.label === `Sequence ${round}${segment.suffix}`);
          builtSteps.push({
            type: "work",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: sequence?.label ?? `Sequence ${round}${segment.suffix}`,
            description: sequence?.description ?? "",
            seconds: segment.seconds,
            timelineKey: `${exercise.id}-${round}-${segment.suffix}`,
          });
        });

        if (round < exercise.rounds && exercise.restSeconds > 0) {
          builtSteps.push({
            type: "rest",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: "Rest",
            description: `${exercise.restSeconds}s rest`,
            seconds: exercise.restSeconds,
            timelineKey: `${exercise.id}-${round}-rest`,
          });
        }
      }
    } else {
      exercise.sequences.forEach((sequence, sequenceIndex) => {
        builtSteps.push({
          type: "work",
          exerciseIndex,
          label: `Exercise ${exerciseNumber} - ${exercise.name}`,
          title: sequence.label,
          description: sequence.description,
          seconds: exercise.workSeconds,
          timelineKey: `${exercise.id}-${sequenceIndex}-work`,
        });

        if (exercise.restSeconds > 0 && sequenceIndex < exercise.sequences.length - 1) {
          builtSteps.push({
            type: "rest",
            exerciseIndex,
            label: `Exercise ${exerciseNumber} - ${exercise.name}`,
            title: "Rest",
            description: `${exercise.restSeconds}s rest`,
            seconds: exercise.restSeconds,
            timelineKey: `${exercise.id}-${sequenceIndex}-rest`,
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
        timelineKey: `${exercise.id}-between-rest`,
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

  if (activeMode === "saved") {
    renderSavedWorkouts();
    return;
  }

  if (activeMode === "about") return;

  const activeKey = step.timelineKey;
  if (workoutPlanDirty || activeKey !== lastWorkoutActiveKey) {
    renderWorkoutPlan();
    workoutPlanDirty = false;
    lastWorkoutActiveKey = activeKey;
  }
}

function renderSimpleTimeline() {
  const settings = readSettings();
  setInputValueWhenBlurred(elements.reps, settings.reps);
  setInputValueWhenBlurred(elements.work, settings.work);
  setInputValueWhenBlurred(elements.rest, settings.rest);
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
  elements.workoutTitle.textContent = workoutPlan.description;
  elements.workoutDescription.value = workoutPlan.description;
  elements.exerciseCount.value = workoutPlan.exercises.length;
  elements.workoutSummary.textContent = `${workoutPlan.exercises.length} exercises`;
  elements.workoutList.innerHTML = "";
  const active = currentStep();

  workoutPlan.exercises.forEach((exercise, exerciseIndex) => {
    const card = document.createElement("article");
    card.className = "exercise-card";

    const header = document.createElement("div");
    header.className = "exercise-header";

    const title = document.createElement("h3");
    title.textContent = `Exercise ${exerciseIndex + 1}`;

    const actions = document.createElement("div");
    actions.className = "exercise-actions";
    actions.append(
      actionButton("Up", () => moveExercise(exerciseIndex, -1), exerciseIndex === 0),
      actionButton("Down", () => moveExercise(exerciseIndex, 1), exerciseIndex === workoutPlan.exercises.length - 1),
      actionButton("Duplicate", () => duplicateExercise(exerciseIndex)),
      actionButton("Delete", () => deleteExercise(exerciseIndex), workoutPlan.exercises.length <= 1),
    );

    header.append(title, actions);
    card.append(header);

    const controls = document.createElement("div");
    controls.className = "exercise-controls";

    controls.append(
      textInputField("Description", exercise.name, (value) => {
        exercise.name = value || `Exercise ${exerciseIndex + 1}`;
        syncExerciseSequences(exercise);
        applyWorkoutChange(true);
      }),
    );

    controls.append(
      selectField(
        "Timing type",
        exercise.mode,
        [
          ["single", "Single interval"],
          ["abcd", "ABCD sequence"],
        ],
        (value) => {
          exercise.mode = value;
          syncExerciseSequences(exercise, { preserveByIndex: false });
          applyWorkoutChange(true);
        },
      ),
    );

    controls.append(numberField("Rounds", exercise.rounds, 1, 99, "", (value) => {
      exercise.rounds = value;
      syncExerciseSequences(exercise);
      applyWorkoutChange(true);
    }));

    if (exercise.mode === "single") {
      controls.append(numberField("Work", exercise.workSeconds, 1, 3600, "s", (value) => {
        exercise.workSeconds = value;
        applyWorkoutChange(true);
      }));
    } else {
      exercise.pattern.forEach((segment) => {
        controls.append(numberField(`${segment.suffix} work`, segment.seconds, 1, 3600, "s", (value) => {
          segment.seconds = value;
          applyWorkoutChange(true);
        }));
      });
    }

    controls.append(numberField(exercise.mode === "abcd" ? "Rest after ABCD round" : "Rest between sequences", exercise.restSeconds, 0, 3600, "s", (value) => {
      exercise.restSeconds = value;
      applyWorkoutChange(true);
    }));

    if (exerciseIndex < workoutPlan.exercises.length - 1) {
      controls.append(numberField("Rest before next exercise", exercise.betweenRestSeconds, 0, 3600, "s", (value) => {
        exercise.betweenRestSeconds = value;
        applyWorkoutChange(true);
      }));
    }

    card.append(controls);

    const meta = document.createElement("div");
    meta.className = "exercise-meta";
    meta.append(textLine(formatExerciseTiming(exercise)));
    meta.append(textLine(`${exercise.sequences.length} sequences`));
    card.append(meta);

    const list = document.createElement("div");
    list.className = "sequence-list";
    exercise.sequences.forEach((sequence) => {
      const item = document.createElement("label");
      item.className = "sequence-item";
      item.classList.toggle("active", active?.title === sequence.label && active?.exerciseIndex === exerciseIndex);

      const label = document.createElement("span");
      label.className = "sequence-label";
      label.textContent = sequence.label;

      const input = document.createElement("input");
      input.type = "text";
      input.value = sequence.description;
      input.addEventListener("change", () => {
        sequence.description = input.value.trim() || sequence.label;
        applyWorkoutChange(false);
      });

      item.append(label, input);
      list.append(item);
    });
    card.append(list);

    elements.workoutList.append(card);
  });
}

function renderSavedWorkouts() {
  elements.savedSummary.textContent = `${savedWorkouts.length} saved`;
  elements.savedList.innerHTML = "";

  if (!savedWorkouts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No saved workouts yet.";
    elements.savedList.append(empty);
    return;
  }

  savedWorkouts.forEach((saved) => {
    const card = document.createElement("article");
    card.className = "saved-card";

    const details = document.createElement("div");
    details.className = "saved-details";

    const title = document.createElement("h3");
    title.textContent = saved.name;

    const meta = document.createElement("p");
    meta.textContent = `${saved.plan.exercises.length} exercises`;

    details.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "saved-actions";

    const loadButton = document.createElement("button");
    loadButton.className = "primary-button compact-button";
    loadButton.type = "button";
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => {
      replaceWorkoutPlan(saved.plan);
      setMode("workout");
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button compact-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      savedWorkouts = savedWorkouts.filter((item) => item.id !== saved.id);
      saveSavedWorkouts();
      renderSavedWorkouts();
    });

    actions.append(loadButton, deleteButton);
    card.append(details, actions);
    elements.savedList.append(card);
  });
}

function textLine(text) {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
}

function textInputField(labelText, value, onChange) {
  const field = document.createElement("label");
  field.className = "field";

  const label = document.createElement("span");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value.trim()));

  field.append(label, input);
  return field;
}

function numberField(labelText, value, min, max, unitText, onChange) {
  const field = document.createElement("label");
  field.className = "field";

  const label = document.createElement("span");
  label.textContent = labelText;

  const inputWrap = document.createElement("div");
  inputWrap.className = unitText ? "input-unit" : "input-unit no-unit";

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = String(min);
  input.max = String(max);
  input.value = value;
  input.addEventListener("change", () => {
    const nextValue = clampNumber(input.value, min, max, value);
    input.value = nextValue;
    onChange(nextValue);
  });

  inputWrap.append(input);
  if (unitText) {
    const unit = document.createElement("span");
    unit.textContent = unitText;
    inputWrap.append(unit);
  }

  field.append(label, inputWrap);
  return field;
}

function selectField(labelText, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "field";

  const label = document.createElement("span");
  label.textContent = labelText;

  const select = document.createElement("select");
  options.forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    option.selected = optionValue === value;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));

  field.append(label, select);
  return field;
}

function actionButton(label, onClick, disabled = false) {
  const button = document.createElement("button");
  button.className = "secondary-button tiny-button";
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function formatExerciseTiming(exercise) {
  if (exercise.mode === "abcd") {
    const pattern = exercise.pattern.map((item) => `${item.suffix} ${item.seconds}s`).join(", ");
    return `Timing: ${exercise.rounds} rounds of ${pattern}, ${exercise.restSeconds}s rest`;
  }

  return `Timing: ${exercise.rounds} rounds, ${exercise.workSeconds}s work, ${exercise.restSeconds}s rest`;
}

function applyWorkoutChange(structural) {
  saveWorkoutPlan();
  workoutPlanDirty = true;
  if (structural || !running) rebuildSteps();
  render();
}

function saveCurrentWorkout() {
  saveWorkoutPlan();
  const now = new Date().toISOString();
  const name = workoutPlan.description || "Saved workout";
  savedWorkouts = [
    {
      id: `saved-${Date.now()}`,
      name,
      savedAt: now,
      plan: cloneWorkoutPlan(workoutPlan),
    },
    ...savedWorkouts,
  ];
  saveSavedWorkouts();
  setMode("saved");
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
  elements.savedMode.classList.toggle("active", mode === "saved");
  elements.aboutMode.classList.toggle("active", mode === "about");
  elements.simpleMode.setAttribute("aria-selected", String(mode === "simple"));
  elements.workoutMode.setAttribute("aria-selected", String(mode === "workout"));
  elements.savedMode.setAttribute("aria-selected", String(mode === "saved"));
  elements.aboutMode.setAttribute("aria-selected", String(mode === "about"));
  elements.simpleSettings.classList.toggle("hidden", mode !== "simple");
  elements.workoutSettings.classList.toggle("hidden", mode !== "workout");
  elements.savedSettings.classList.toggle("hidden", mode !== "saved");
  elements.aboutSettings.classList.toggle("hidden", mode !== "about");
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

[
  [elements.reps, 1, 99],
  [elements.work, 1, 3600],
  [elements.rest, 0, 3600],
].forEach(([input, min, max]) => {
  input.addEventListener("input", () => {
    if (running || activeMode !== "simple" || !hasValidInteger(input.value, min, max)) return;
    resetTimer();
  });

  input.addEventListener("change", () => {
    if (!running && activeMode === "simple") resetTimer();
  });

  input.addEventListener("blur", () => {
    input.value = clampNumber(input.value, min, max, min);
    if (!running && activeMode === "simple") resetTimer();
  });
});

elements.workoutDescription.addEventListener("change", () => {
  workoutPlan.description = elements.workoutDescription.value.trim() || "Workout Easy";
  applyWorkoutChange(false);
});

elements.exerciseCount.addEventListener("change", () => {
  ensureExerciseCount(elements.exerciseCount.value);
  applyWorkoutChange(true);
});

elements.simpleMode.addEventListener("click", () => setMode("simple"));
elements.workoutMode.addEventListener("click", () => setMode("workout"));
elements.savedMode.addEventListener("click", () => setMode("saved"));
elements.aboutMode.addEventListener("click", () => setMode("about"));
elements.addExercise.addEventListener("click", addExercise);
elements.saveWorkout.addEventListener("click", saveCurrentWorkout);
elements.startPause.addEventListener("click", startPause);
elements.reset.addEventListener("click", resetTimer);
elements.soundToggle.addEventListener("click", toggleSound);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

resetTimer();
hydrateNativeStorage();
