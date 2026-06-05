const TOUR_KEY = 'tour';
export const TOUR_VERSION = 3;

const DEFAULT_STATE = { completed: false, completedAt: null, completedVersion: 0, inProgress: null, useMockData: false };

export async function readTourState() {
  const { [TOUR_KEY]: state } = await chrome.storage.local.get(TOUR_KEY);
  return { ...DEFAULT_STATE, ...(state || {}) };
}

let writeChain = Promise.resolve();
export function writeTourState(patch) {
  const next = writeChain.then(async () => {
    const current = await readTourState();
    const merged = { ...current, ...patch };
    await chrome.storage.local.set({ [TOUR_KEY]: merged });
    return merged;
  });
  writeChain = next.catch(() => {});
  return next;
}

export function markTourCompleted() {
  return writeTourState({
    completed: true,
    completedAt: new Date().toISOString(),
    completedVersion: TOUR_VERSION,
    inProgress: null,
    useMockData: false,
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

export function runTour({ surface, steps, startIndex = 0, onClose, showCloseButton = true }) {
  if (!steps || steps.length === 0) return { stop: () => {} };

  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';

  const spotlight = document.createElement('div');
  spotlight.id = 'tour-spotlight';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'tour-close-btn';
  closeBtn.className = 'square-btn';
  closeBtn.title = 'Close the tour';
  closeBtn.textContent = '✕';
  if (!showCloseButton) closeBtn.style.display = 'none';

  const tooltip = document.createElement('div');
  tooltip.id = 'tour-tooltip';
  tooltip.innerHTML = `
    <div id="tour-tooltip-arrow"></div>
    <div id="tour-tooltip-title"></div>
    <div id="tour-tooltip-body"></div>
    <div id="tour-tooltip-footer">
      <span id="tour-step-counter"></span>
      <button id="tour-prev-btn" class="btn">Previous</button>
      <button id="tour-next-btn" class="btn">Next</button>
    </div>
  `;

  const confirm = document.createElement('div');
  confirm.id = 'tour-confirm';
  confirm.className = 'modal-dialog';
  confirm.hidden = true;
  confirm.innerHTML = `
    <div id="tour-confirm-body">Are you sure you want to interrupt the guided tour?</div>
    <div id="tour-confirm-actions">
      <button id="tour-confirm-no" class="btn">No, keep going</button>
      <button id="tour-confirm-yes" class="btn">Yes, interrupt</button>
    </div>
  `;

  document.body.append(overlay, spotlight, tooltip, closeBtn, confirm);

  const titleEl = tooltip.querySelector('#tour-tooltip-title');
  const bodyEl = tooltip.querySelector('#tour-tooltip-body');
  const counterEl = tooltip.querySelector('#tour-step-counter');
  const prevBtn = tooltip.querySelector('#tour-prev-btn');
  const nextBtn = tooltip.querySelector('#tour-next-btn');
  const confirmNo = confirm.querySelector('#tour-confirm-no');
  const confirmYes = confirm.querySelector('#tour-confirm-yes');

  let currentIndex = 0;
  let currentStep = null;
  let stopped = false;
  let handoffEngaged = false;
  let handoffTarget = null;
  let advanceClickCleanup = null;
  let resizeObserver = null;

  function applyClickThroughHole(top, left, width, height) {
    const t = Math.max(0, top);
    const l = Math.max(0, left);
    const r = left + width;
    const b = top + height;
    overlay.style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${t}px, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, 0 ${t}px)`;
  }

  function clearClickThroughHole() {
    overlay.style.clipPath = '';
  }

  function positionTooltipFor(target) {
    const rect = target.getBoundingClientRect();
    const top = rect.top - SPOTLIGHT_PADDING;
    const left = rect.left - SPOTLIGHT_PADDING;
    const width = rect.width + SPOTLIGHT_PADDING * 2;
    const height = rect.height + SPOTLIGHT_PADDING * 2;

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

  function positionFor(target, { moveTooltip = true, clickThrough = false } = {}) {
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
    spotlight.style.pointerEvents = clickThrough ? 'none' : 'auto';

    applyClickThroughHole(top, left, width, height);

    if (moveTooltip) positionTooltipFor(target);
  }

  function positionFloating(position) {
    spotlight.style.display = 'none';
    clearClickThroughHole();
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
      if (target) positionFor(target, {
        moveTooltip: !currentStep.keepTooltipPosition,
        clickThrough: isStepClickThrough(currentStep),
      });
    } else if (!currentStep.keepTooltipPosition) {
      positionFloating(currentStep.tooltipPosition);
    }
  }

  function isStepClickThrough(step) {
    return step.advanceOn === 'click'
      || step.handoff?.mode === 'inPage'
      || step.handoff?.mode === 'crossDocument'
      || step.nonBlocking === true;
  }

  async function showStep(index) {
    if (stopped) return;
    if (index >= steps.length) return finish(false);
    if (index < 0) index = 0;

    const step = steps[index];

    const direction = index < currentIndex ? 'backward' : 'forward';

    if (step.selector) {
      const target = document.querySelector(step.selector);
      if (!target) {
        currentIndex = index;
        return showStep(direction === 'backward' ? index - 1 : index + 1);
      }
    }

    if (currentStep && currentStep.onExit) {
      try { await currentStep.onExit({ direction }); } catch (_e) {}
    }
    if (advanceClickCleanup) {
      advanceClickCleanup();
      advanceClickCleanup = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    currentStep = step;
    currentIndex = index;

    if (step.onEnter) {
      try { await step.onEnter({ direction }); } catch (_e) {}
    }

    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    counterEl.textContent = `${index + 1} / ${steps.length}`;
    prevBtn.disabled = index === 0;

    const isHandoff = !!step.handoff;
    const isUpdateHandoff = step.handoff?.updateHandoff === true;
    const advanceOnClick = step.advanceOn === 'click';
    nextBtn.style.display = (isHandoff && !isUpdateHandoff) || advanceOnClick ? 'none' : '';
    nextBtn.textContent = isUpdateHandoff ? 'Continue →' : index === steps.length - 1 ? 'Finish' : 'Next';

    tooltip.classList.toggle('has-arrow-up', step.arrow === 'up');
    const wasModalStep = document.body.classList.contains('tour-modal-step');
    const isModalStep = step.modalStep === true;
    document.body.classList.toggle('tour-modal-step', isModalStep);
    if (wasModalStep && !isModalStep) {
      document.dispatchEvent(new CustomEvent('tour:modal-step-leave'));
    }
    document.body.classList.toggle('tour-drill-step', step.drillStep === true);

    document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));

    let anchorPositioned = false;
    if (step.keepTooltipPosition) {
      for (let i = index - 1; i >= 0; i--) {
        const prev = steps[i];
        if (!prev.selector || prev.keepTooltipPosition) continue;
        const prevTarget = document.querySelector(prev.selector);
        if (!prevTarget) continue;
        positionTooltipFor(prevTarget);
        anchorPositioned = true;
        break;
      }
    }

    const keepPos = anchorPositioned;

    if (step.selector) {
      const liveTarget = document.querySelector(step.selector);
      if (!liveTarget) return showStep(index + 1);
      liveTarget.classList.add('tour-target');
      positionFor(liveTarget, {
        moveTooltip: !keepPos,
        clickThrough: isStepClickThrough(step),
      });
      if (advanceOnClick) {
        const handler = () => showStep(currentIndex + 1);
        liveTarget.addEventListener('click', handler, { once: true });
        advanceClickCleanup = () => liveTarget.removeEventListener('click', handler);
      }
      resizeObserver = new ResizeObserver(reposition);
      resizeObserver.observe(liveTarget);
    } else if (!keepPos) {
      positionFloating(step.tooltipPosition);
    }

    if (isHandoff) {
      handoffEngaged = true;
      handoffTarget = step.handoff.nextSurface;
      await setTourProgress(step.handoff.nextSurface, step.handoff.nextStepIndex ?? 0);
    } else {
      handoffEngaged = false;
      handoffTarget = null;
      await setTourProgress(surface, index);
    }
  }

  async function finish(skipped) {
    if (stopped) return;
    stopped = true;
    if (currentStep && currentStep.onExit) {
      try { await currentStep.onExit(); } catch (_e) {}
    }
    if (advanceClickCleanup) { advanceClickCleanup(); advanceClickCleanup = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));
    document.body.classList.remove('tour-drill-step');
    if (document.body.classList.contains('tour-modal-step')) {
      document.body.classList.remove('tour-modal-step');
      document.dispatchEvent(new CustomEvent('tour:modal-step-leave'));
    }
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('keydown', onKeydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
    closeBtn.remove();
    confirm.remove();
    if (skipped || !handoffEngaged) {
      await markTourCompleted();
    } else if (currentStep?.handoff?.updateHandoff) {
      const surfaceUrls = {
        dashboard: 'src/pages/dashboard/dashboard.html',
        rules: 'src/pages/rules/rules.html',
        'storage-management': 'src/pages/storage-management/storage-management.html',
        settings: 'src/pages/settings/settings.html',
      };
      const url = surfaceUrls[currentStep.handoff.nextSurface];
      if (url) chrome.tabs.create({ url: chrome.runtime.getURL(url) });
    }
    if (onClose) onClose({ skipped });
  }

  function onKeydown(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!currentStep) return;
    const advanceOnClick = currentStep.advanceOn === 'click';
    const isHandoff = !!currentStep.handoff;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (advanceOnClick || isHandoff) return;
      e.preventDefault();
      showStep(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      if (currentIndex === 0) return;
      e.preventDefault();
      showStep(currentIndex - 1);
    }
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes[TOUR_KEY]) return;
    const oldState = { ...DEFAULT_STATE, ...(changes[TOUR_KEY].oldValue || {}) };
    const newState = { ...DEFAULT_STATE, ...(changes[TOUR_KEY].newValue || {}) };
    if (newState.completed && !oldState.completed) return closeQuietly();
    const newSurface = newState.inProgress?.surface;
    if (!newSurface || newSurface === surface) return;
    if (newSurface === handoffTarget) return;
    // If we handed off via crossDocument, keep the overlay alive while the user
    // navigates through other surfaces — only close when the surface returns to
    // this one (handled above) or the tour completes.
    const currentStep = steps[currentIndex];
    if (currentStep?.handoff?.mode === 'crossDocument') return;
    closeQuietly();
  }

  function closeQuietly() {
    if (stopped) return;
    stopped = true;
    if (advanceClickCleanup) { advanceClickCleanup(); advanceClickCleanup = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));
    document.body.classList.remove('tour-drill-step');
    if (document.body.classList.contains('tour-modal-step')) {
      document.body.classList.remove('tour-modal-step');
      document.dispatchEvent(new CustomEvent('tour:modal-step-leave'));
    }
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('keydown', onKeydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
    closeBtn.remove();
    confirm.remove();
    if (onClose) onClose({ skipped: false, quiet: true });
  }

  prevBtn.addEventListener('click', () => showStep(currentIndex - 1));
  nextBtn.addEventListener('click', () => showStep(currentIndex + 1));
  closeBtn.addEventListener('click', () => { confirm.hidden = false; });
  confirmNo.addEventListener('click', () => { confirm.hidden = true; });
  confirmYes.addEventListener('click', () => finish(true));
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  document.addEventListener('keydown', onKeydown);
  chrome.storage.onChanged.addListener(onStorageChanged);

  showStep(startIndex);

  return {
    stop: () => finish(true),
    goto: (index) => { if (!stopped) showStep(index); },
    getIndex: () => currentIndex,
  };
}

// Steps marked with `newInVersion: N` are shown in the update tour when a user
// who completed version < N reloads the extension. To add steps to the update
// tour: mark each new step with `newInVersion: TOUR_VERSION`, bump TOUR_VERSION,
// and set TOUR_UPDATE_ENTRY in background.js to the first surface with new steps.
// nextUpdateSurface: passed by callers that know the next surface in the update
// chain; autoStartIfMatches injects an updateHandoff on the last new step.
export async function autoStartIfMatches(surface, steps, options = {}) {
  const { nextUpdateSurface, nextUpdateStepIndex, ...runOptions } = options;
  const state = await readTourState();

  if (state.completed) {
    const completedVersion = state.completedVersion ?? 0;
    if (completedVersion < TOUR_VERSION) {
      const firstNew = steps.findIndex(s => (s.newInVersion ?? 0) > completedVersion);
      if (firstNew >= 0) {
        const lastNew = steps.reduce((acc, s, i) => ((s.newInVersion ?? 0) > completedVersion ? i : acc), firstNew);
        let updateSteps = steps.slice(firstNew, lastNew + 1);
        if (nextUpdateSurface) {
          const last = { ...updateSteps[updateSteps.length - 1] };
          last.handoff = { nextSurface: nextUpdateSurface, nextStepIndex: nextUpdateStepIndex ?? 0, mode: 'crossDocument', updateHandoff: true };
          updateSteps = [...updateSteps.slice(0, -1), last];
        }
        return runTour({ surface, steps: updateSteps, startIndex: 0, ...runOptions });
      }
    }
    return null;
  }

  const pendingSurface = state.inProgress?.surface;
  if (!pendingSurface) return null;
  if (pendingSurface === surface) {
    return runTour({
      surface,
      steps,
      startIndex: state.inProgress.stepIndex || 0,
      ...runOptions,
    });
  }
  const handoffIdx = steps.findIndex(s => s.handoff?.nextSurface === pendingSurface);
  if (handoffIdx >= 0) {
    return runTour({
      surface,
      steps,
      startIndex: handoffIdx,
      ...runOptions,
    });
  }
  return null;
}
