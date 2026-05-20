const TOUR_KEY = 'tour';

const DEFAULT_STATE = { completed: false, completedAt: null, inProgress: null };

export async function readTourState() {
  const { [TOUR_KEY]: state } = await chrome.storage.local.get(TOUR_KEY);
  return { ...DEFAULT_STATE, ...(state || {}) };
}

export async function writeTourState(patch) {
  const current = await readTourState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [TOUR_KEY]: next });
  return next;
}

export function markTourCompleted() {
  return writeTourState({
    completed: true,
    completedAt: new Date().toISOString(),
    inProgress: null,
  });
}

export function setTourProgress(surface, stepIndex) {
  return writeTourState({ inProgress: { surface, stepIndex } });
}

export function clearTourProgress() {
  return writeTourState({ inProgress: null });
}

const SPOTLIGHT_PADDING = 6;
const TOOLTIP_MARGIN = 12;
const VIEWPORT_MARGIN = 8;

export function runTour({ surface, steps, startIndex = 0, onClose }) {
  if (!steps || steps.length === 0) return { stop: () => {} };

  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';

  const spotlight = document.createElement('div');
  spotlight.id = 'tour-spotlight';

  const tooltip = document.createElement('div');
  tooltip.id = 'tour-tooltip';
  tooltip.innerHTML = `
    <div id="tour-tooltip-arrow"></div>
    <div id="tour-tooltip-title"></div>
    <div id="tour-tooltip-body"></div>
    <div id="tour-tooltip-footer">
      <span id="tour-step-counter"></span>
      <button id="tour-skip-btn" class="btn">Skip</button>
      <button id="tour-prev-btn" class="btn">Previous</button>
      <button id="tour-next-btn" class="btn">Next</button>
    </div>
  `;

  document.body.append(overlay, spotlight, tooltip);

  const titleEl = tooltip.querySelector('#tour-tooltip-title');
  const bodyEl = tooltip.querySelector('#tour-tooltip-body');
  const counterEl = tooltip.querySelector('#tour-step-counter');
  const prevBtn = tooltip.querySelector('#tour-prev-btn');
  const nextBtn = tooltip.querySelector('#tour-next-btn');
  const skipBtn = tooltip.querySelector('#tour-skip-btn');

  let currentIndex = 0;
  let currentStep = null;
  let stopped = false;
  let handoffEngaged = false;
  let lastWrittenSurface = null;

  function positionFor(target, { moveTooltip = true } = {}) {
    const rect = target.getBoundingClientRect();
    const top = rect.top - SPOTLIGHT_PADDING;
    const left = rect.left - SPOTLIGHT_PADDING;
    const width = rect.width + SPOTLIGHT_PADDING * 2;
    const height = rect.height + SPOTLIGHT_PADDING * 2;
    spotlight.style.display = '';
    spotlight.style.top = `${top}px`;
    spotlight.style.left = `${left}px`;
    spotlight.style.width = `${width}px`;
    spotlight.style.height = `${height}px`;

    if (!moveTooltip) return;

    const tipRect = tooltip.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - (top + height);
    let tipTop = top + height + TOOLTIP_MARGIN;
    if (spaceBelow < tipRect.height + TOOLTIP_MARGIN + VIEWPORT_MARGIN) {
      tipTop = top - tipRect.height - TOOLTIP_MARGIN;
    }
    tipTop = Math.max(VIEWPORT_MARGIN, Math.min(tipTop, vh - tipRect.height - VIEWPORT_MARGIN));

    let tipLeft = left + width / 2 - tipRect.width / 2;
    tipLeft = Math.max(VIEWPORT_MARGIN, Math.min(tipLeft, vw - tipRect.width - VIEWPORT_MARGIN));

    tooltip.style.top = `${tipTop}px`;
    tooltip.style.left = `${tipLeft}px`;
  }

  function positionFloating(position) {
    spotlight.style.display = 'none';
    const tipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    let tipTop = VIEWPORT_MARGIN;
    let tipLeft;
    if (position === 'top-right') {
      tipLeft = vw - tipRect.width - VIEWPORT_MARGIN;
    } else if (position === 'top-left') {
      tipLeft = VIEWPORT_MARGIN;
    } else {
      tipLeft = vw / 2 - tipRect.width / 2;
    }
    tooltip.style.top = `${tipTop}px`;
    tooltip.style.left = `${tipLeft}px`;
  }

  function reposition() {
    if (!currentStep) return;
    if (currentStep.selector) {
      const target = document.querySelector(currentStep.selector);
      if (target) positionFor(target, { moveTooltip: !currentStep.keepTooltipPosition });
    } else if (!currentStep.keepTooltipPosition) {
      positionFloating(currentStep.tooltipPosition);
    }
  }

  async function showStep(index) {
    if (stopped) return;
    if (index >= steps.length) return finish(false);
    if (index < 0) index = 0;

    const step = steps[index];

    if (step.selector) {
      const target = document.querySelector(step.selector);
      if (!target) {
        currentIndex = index;
        return showStep(index + 1);
      }
    }

    if (currentStep && currentStep.onExit) {
      try { await currentStep.onExit(); } catch (_e) {}
    }
    currentStep = step;
    currentIndex = index;

    if (step.onEnter) {
      try { await step.onEnter(); } catch (_e) {}
    }

    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    counterEl.textContent = `${index + 1} / ${steps.length}`;
    prevBtn.disabled = index === 0;

    const isHandoff = !!step.handoff;
    const handoffMode = step.handoff?.mode;
    nextBtn.style.display = isHandoff ? 'none' : '';
    nextBtn.textContent = index === steps.length - 1 ? 'Finish' : 'Next';

    overlay.classList.toggle('non-blocking', handoffMode === 'inPage');
    tooltip.classList.toggle('has-arrow-up', step.arrow === 'up');

    if (step.selector) {
      const liveTarget = document.querySelector(step.selector);
      if (!liveTarget) return showStep(index + 1);
      positionFor(liveTarget, { moveTooltip: !step.keepTooltipPosition });
    } else if (!step.keepTooltipPosition) {
      positionFloating(step.tooltipPosition);
    }

    if (isHandoff) {
      handoffEngaged = true;
      lastWrittenSurface = step.handoff.nextSurface;
      await setTourProgress(step.handoff.nextSurface, step.handoff.nextStepIndex ?? 0);
    } else {
      handoffEngaged = false;
      lastWrittenSurface = surface;
      await setTourProgress(surface, index);
    }
  }

  async function finish(skipped) {
    if (stopped) return;
    stopped = true;
    if (currentStep && currentStep.onExit) {
      try { await currentStep.onExit(); } catch (_e) {}
    }
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('keydown', onKeydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
    if (skipped || !handoffEngaged) {
      await markTourCompleted();
    }
    if (onClose) onClose({ skipped });
  }

  function onKeydown(e) {
    if (e.key === 'Escape') finish(true);
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes[TOUR_KEY]) return;
    const oldState = { ...DEFAULT_STATE, ...(changes[TOUR_KEY].oldValue || {}) };
    const newState = { ...DEFAULT_STATE, ...(changes[TOUR_KEY].newValue || {}) };
    if (newState.completed && !oldState.completed) return closeQuietly();
    const newSurface = newState.inProgress?.surface;
    if (!newSurface || newSurface === surface) return;
    if (newSurface === lastWrittenSurface) {
      lastWrittenSurface = null;
      return;
    }
    closeQuietly();
  }

  function closeQuietly() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('keydown', onKeydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
    if (onClose) onClose({ skipped: false, quiet: true });
  }

  prevBtn.addEventListener('click', () => showStep(currentIndex - 1));
  nextBtn.addEventListener('click', () => showStep(currentIndex + 1));
  skipBtn.addEventListener('click', () => finish(true));
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  document.addEventListener('keydown', onKeydown);
  chrome.storage.onChanged.addListener(onStorageChanged);

  showStep(startIndex);

  return { stop: () => finish(true) };
}

export async function autoStartIfMatches(surface, steps, options = {}) {
  const state = await readTourState();
  if (state.inProgress?.surface !== surface) return null;
  return runTour({
    surface,
    steps,
    startIndex: state.inProgress.stepIndex || 0,
    ...options,
  });
}
