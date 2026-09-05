import { DB, SYSTEM_CATEGORY_ID } from './db.js';

/* ---------------------------------------------------------------- */
/* Estado en memoria (reflejo de IndexedDB)                          */
/* ---------------------------------------------------------------- */

const state = {
  categories: [],
  items: [],
};

let lastUsedCategoryId = null;      // recuerda la última categoría elegida al añadir
let categoryActionsTargetId = null; // categoría activa en la hoja de "..."
let categoryRenameMode = false;     // si la hoja de categoría está en modo "renombrar"
let pendingDeleteItemId = null;     // alimento pendiente de confirmar borrado

/* ---------------------------------------------------------------- */
/* Elementos del DOM                                                 */
/* ---------------------------------------------------------------- */

const $list = document.getElementById('list');
const $emptyState = document.getElementById('empty-state');
const $overlay = document.getElementById('overlay');
const $toast = document.getElementById('toast');
const $offlinePill = document.getElementById('offline-pill');

const ICONS = {
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------------- */
/* Carga inicial                                                     */
/* ---------------------------------------------------------------- */

async function init() {
  registerServiceWorker();
  setupOfflinePill();

  await DB.seedDefaultsIfEmpty();
  await reloadState();
  render();
  bindGlobalEvents();
}

async function reloadState() {
  const [categories, items] = await Promise.all([DB.getAllCategories(), DB.getAllItems()]);
  state.categories = categories;
  state.items = items;
}

/* ---------------------------------------------------------------- */
/* Render                                                            */
/* ---------------------------------------------------------------- */

function render() {
  renderCategorySelect();

  const totalItems = state.items.length;

  if (totalItems === 0) {
    $emptyState.hidden = false;
    $list.hidden = true;
  } else {
    $emptyState.hidden = true;
    $list.hidden = false;
  }

  $list.innerHTML = state.categories.map((cat) => renderCategory(cat)).join('');
}

function renderCategory(cat) {
  const items = state.items
    .filter((i) => i.categoryId === cat.id)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.order - b.order;
    });

  const bodyHtml = items.length
    ? items.map((it) => renderItem(it)).join('')
    : `<p class="category-empty">Sin alimentos todavía</p>`;

  const moreBtn = cat.isSystem
    ? ''
    : `<button class="category-more" data-action="category-menu" data-category-id="${cat.id}" aria-label="Opciones de categoría">${ICONS.dots}</button>`;

  return `
    <section class="category ${cat.collapsed ? 'collapsed' : ''}" data-category-id="${cat.id}">
      <div class="category-header" data-action="toggle-category" data-category-id="${cat.id}">
        <span class="category-title">${escapeHtml(cat.name)}</span>
        <span class="category-count">${items.length}</span>
        ${moreBtn}
        <span class="category-chevron">${ICONS.chevron}</span>
      </div>
      <div class="category-body">
        <div class="category-body-inner">${bodyHtml}</div>
      </div>
    </section>
  `;
}

function renderItem(item) {
  return `
    <div class="item-row ${item.completed ? 'completed' : ''}" data-item-id="${item.id}">
      <button class="item-check" data-action="toggle-item" data-item-id="${item.id}" aria-label="${item.completed ? 'Marcar como pendiente' : 'Marcar como comprado'}">
        ${ICONS.check}
      </button>
      <span class="item-name">${escapeHtml(item.name)}</span>
      <button class="item-delete" data-action="delete-item" data-item-id="${item.id}" aria-label="Eliminar ${escapeHtml(item.name)}">
        ${ICONS.trash}
      </button>
    </div>
  `;
}

function renderCategorySelect() {
  const select = document.getElementById('select-item-category');
  const prevValue = lastUsedCategoryId || select.value;
  select.innerHTML = state.categories
    .map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`)
    .join('');
  if (prevValue && state.categories.some((c) => c.id === prevValue)) {
    select.value = prevValue;
  }
}

/* ---------------------------------------------------------------- */
/* Toast                                                             */
/* ---------------------------------------------------------------- */

let toastTimer = null;
function showToast(message) {
  $toast.textContent = message;
  $toast.hidden = false;
  requestAnimationFrame(() => $toast.classList.add('visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $toast.classList.remove('visible');
    setTimeout(() => { $toast.hidden = true; }, 220);
  }, 2200);
}

/* ---------------------------------------------------------------- */
/* Hojas (bottom sheets)                                             */
/* ---------------------------------------------------------------- */

function openSheet(id) {
  const sheet = document.getElementById(id);
  $overlay.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    $overlay.classList.add('visible');
    sheet.classList.add('visible');
  });
}

function closeAllSheets() {
  const sheets = document.querySelectorAll('.sheet.visible');
  sheets.forEach((sheet) => {
    sheet.classList.remove('visible');
    setTimeout(() => { sheet.hidden = true; }, 260);
  });
  $overlay.classList.remove('visible');
  setTimeout(() => { $overlay.hidden = true; }, 260);
}

/* ---------------------------------------------------------------- */
/* Eventos globales                                                  */
/* ---------------------------------------------------------------- */

function bindGlobalEvents() {
  $overlay.addEventListener('click', closeAllSheets);
  document.querySelectorAll('[data-close-sheet]').forEach((btn) => {
    btn.addEventListener('click', closeAllSheets);
  });

  // Delegación de clicks sobre la lista de categorías/alimentos
  $list.addEventListener('click', onListClick);

  document.getElementById('btn-add-item').addEventListener('click', () => {
    const form = document.getElementById('form-add-item');
    form.reset();
    if (lastUsedCategoryId) {
      document.getElementById('select-item-category').value = lastUsedCategoryId;
    }
    openSheet('sheet-add-item');
    setTimeout(() => document.getElementById('input-item-name').focus(), 300);
  });

  document.getElementById('form-add-item').addEventListener('submit', onSubmitAddItem);

  document.getElementById('btn-add-category').addEventListener('click', () => {
    categoryRenameMode = false;
    categoryActionsTargetId = null;
    document.getElementById('sheet-category-title').textContent = 'Nueva categoría';
    document.getElementById('btn-category-submit').textContent = 'Crear';
    document.getElementById('form-category').reset();
    openSheet('sheet-category');
    setTimeout(() => document.getElementById('input-category-name').focus(), 300);
  });

  document.getElementById('form-category').addEventListener('submit', onSubmitCategoryForm);

  document.getElementById('btn-rename-category').addEventListener('click', () => {
    const cat = state.categories.find((c) => c.id === categoryActionsTargetId);
    if (!cat) return;
    categoryRenameMode = true;
    document.getElementById('sheet-category-title').textContent = 'Renombrar categoría';
    document.getElementById('btn-category-submit').textContent = 'Guardar';
    document.getElementById('input-category-name').value = cat.name;
    closeAllSheets();
    setTimeout(() => {
      openSheet('sheet-category');
      setTimeout(() => document.getElementById('input-category-name').focus(), 300);
    }, 260);
  });

  document.getElementById('btn-delete-category').addEventListener('click', onRequestDeleteCategory);
  document.getElementById('btn-move-items').addEventListener('click', () => onResolveDeleteCategory('move'));
  document.getElementById('btn-delete-items').addEventListener('click', () => onResolveDeleteCategory('delete'));
  document.getElementById('btn-confirm-delete-item').addEventListener('click', onConfirmDeleteItem);
}

function onListClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'toggle-category') {
    const id = actionEl.dataset.categoryId;
    toggleCategoryCollapsed(id);
  } else if (action === 'category-menu') {
    event.stopPropagation();
    const id = actionEl.dataset.categoryId;
    categoryActionsTargetId = id;
    const cat = state.categories.find((c) => c.id === id);
    document.getElementById('sheet-category-actions-title').textContent = cat ? cat.name : 'Categoría';
    openSheet('sheet-category-actions');
  } else if (action === 'toggle-item') {
    const id = actionEl.dataset.itemId;
    toggleItemCompleted(id);
  } else if (action === 'delete-item') {
    const id = actionEl.dataset.itemId;
    const item = state.items.find((i) => i.id === id);
    pendingDeleteItemId = id;
    document.getElementById('sheet-delete-item-body').textContent = item
      ? `Se eliminará «${item.name}» de tu lista de forma definitiva.`
      : '';
    openSheet('sheet-delete-item');
  }
}

/* ---------------------------------------------------------------- */
/* Alimentos                                                         */
/* ---------------------------------------------------------------- */

async function onSubmitAddItem(event) {
  event.preventDefault();
  const nameInput = document.getElementById('input-item-name');
  const select = document.getElementById('select-item-category');
  const name = nameInput.value.trim();
  if (!name) return;

  const categoryId = select.value;
  lastUsedCategoryId = categoryId;

  await DB.addItem(name, categoryId);
  await reloadState();
  render();
  closeAllSheets();
  showToast(`«${name}» añadido`);
}

async function toggleItemCompleted(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  await DB.setItemCompleted(id, !item.completed);
  await reloadState();
  render();
}

async function onConfirmDeleteItem() {
  if (!pendingDeleteItemId) return;
  const row = document.querySelector(`.item-row[data-item-id="${pendingDeleteItemId}"]`);
  if (row) row.classList.add('leaving');
  const idToDelete = pendingDeleteItemId;
  pendingDeleteItemId = null;
  closeAllSheets();
  setTimeout(async () => {
    await DB.deleteItem(idToDelete);
    await reloadState();
    render();
  }, row ? 160 : 0);
}

/* ---------------------------------------------------------------- */
/* Categorías                                                        */
/* ---------------------------------------------------------------- */

async function toggleCategoryCollapsed(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  cat.collapsed = !cat.collapsed;
  // Actualiza el DOM al instante para que la transición se vea suave.
  const el = document.querySelector(`.category[data-category-id="${id}"]`);
  if (el) el.classList.toggle('collapsed', cat.collapsed);
  await DB.setCategoryCollapsed(id, cat.collapsed);
}

async function onSubmitCategoryForm(event) {
  event.preventDefault();
  const input = document.getElementById('input-category-name');
  const name = input.value.trim();
  if (!name) return;

  if (categoryRenameMode && categoryActionsTargetId) {
    await DB.renameCategory(categoryActionsTargetId, name);
    showToast('Categoría actualizada');
  } else {
    await DB.addCategory(name);
    showToast(`Categoría «${name}» creada`);
  }

  categoryRenameMode = false;
  categoryActionsTargetId = null;
  await reloadState();
  render();
  closeAllSheets();
}

function onRequestDeleteCategory() {
  const cat = state.categories.find((c) => c.id === categoryActionsTargetId);
  if (!cat) return;
  const count = state.items.filter((i) => i.categoryId === cat.id).length;

  closeAllSheets();

  if (count === 0) {
    // Nada que reubicar: se elimina directamente tras una breve confirmación.
    setTimeout(async () => {
      await DB.deleteCategory(cat.id);
      await reloadState();
      render();
      showToast(`Categoría «${cat.name}» eliminada`);
    }, 260);
    return;
  }

  document.getElementById('sheet-delete-category-body').textContent =
    `«${cat.name}» tiene ${count} alimento${count === 1 ? '' : 's'}. ¿Qué quieres hacer con ${count === 1 ? 'él' : 'ellos'}?`;

  setTimeout(() => openSheet('sheet-delete-category'), 260);
}

async function onResolveDeleteCategory(mode) {
  const cat = state.categories.find((c) => c.id === categoryActionsTargetId);
  if (!cat) return;

  closeAllSheets();

  if (mode === 'move') {
    await DB.ensureSystemCategory();
    await DB.reassignItemsCategory(cat.id, SYSTEM_CATEGORY_ID);
  } else if (mode === 'delete') {
    await DB.deleteItemsByCategory(cat.id);
  }

  await DB.deleteCategory(cat.id);
  categoryActionsTargetId = null;
  await reloadState();
  render();
  showToast(`Categoría «${cat.name}» eliminada`);
}

/* ---------------------------------------------------------------- */
/* Estado de conexión                                                */
/* ---------------------------------------------------------------- */

function setupOfflinePill() {
  const update = () => { $offlinePill.hidden = navigator.onLine; };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/* ---------------------------------------------------------------- */
/* Service Worker                                                    */
/* ---------------------------------------------------------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('No se pudo registrar el Service Worker:', err);
    });
  });
}

/* ---------------------------------------------------------------- */

init();
