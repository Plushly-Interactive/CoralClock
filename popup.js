const addBtn = document.querySelector('#add-btn');
const addForm = document.querySelector('#add-form');
const rulesList = document.querySelector('#rules-list');

addBtn.addEventListener('click', () => {
  addForm.classList.toggle('visible');
});

document.querySelector('#save-btn').addEventListener('click', async () => {
  const target = document.querySelector('#form-target').value.trim();
  const limit = parseInt(document.querySelector('#form-limit').value);
  const limitUnit = document.querySelector('#form-unit').value;
  const period = document.querySelector('#form-period').value;

  if (!target || !limit) return;

  const rule = {
    id: crypto.randomUUID(),
    target,
    limit,
    limitUnit,
    period,
    enabled: true,
  };

  const { rules = [] } = await chrome.storage.local.get('rules');
  await chrome.storage.local.set({ rules: [...rules, rule] });

  document.querySelector('#form-target').value = '';
  addForm.classList.remove('visible');
  renderRules();
});

rulesList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  const { rules = [] } = await chrome.storage.local.get('rules');

  if (e.target.classList.contains('toggle-btn')) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    await chrome.storage.local.set({ rules: updated });
  }

  if (e.target.classList.contains('delete-btn')) {
    const updated = rules.filter(r => r.id !== id);
    await chrome.storage.local.set({ rules: updated });
  }

  renderRules();
});

async function renderRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');

  rulesList.innerHTML = rules.map(rule => `
    <li class="${rule.enabled ? '' : 'disabled'}">
      <div class="rule-info">
        <strong>${rule.target}</strong>
        <span>${rule.limit} ${rule.limitUnit} / ${rule.period}</span>
      </div>
      <button class="toggle-btn" data-id="${rule.id}">${rule.enabled ? '●' : '○'}</button>
      <button class="delete-btn" data-id="${rule.id}">✕</button>
    </li>
  `).join('');
}

renderRules();
