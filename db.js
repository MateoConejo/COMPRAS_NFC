/**
 * db.js — capa de almacenamiento local (IndexedDB) para "Mis compras".
 *
 * Todo el estado de la aplicación vive aquí: alimentos y categorías.
 * No hay llamadas de red. Todo se guarda de forma síncrona a cada cambio.
 */

const DB_NAME = 'mis-compras-db';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_CATEGORIES = 'categories';
export const SYSTEM_CATEGORY_ID = 'sin-categoria';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        const catStore = db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        catStore.createIndex('order', 'order');
      }

      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const itemStore = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        itemStore.createIndex('categoryId', 'categoryId');
        itemStore.createIndex('order', 'order');
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
    req.onblocked = () => console.warn('IndexedDB upgrade blocked (otra pestaña abierta)');
  });

  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ---------------------------------------------------------------- */
/* Categorías                                                        */
/* ---------------------------------------------------------------- */

async function getAllCategories() {
  const store = await tx(STORE_CATEGORIES, 'readonly');
  const all = await reqToPromise(store.getAll());
  return all.sort((a, b) => {
    // La categoría de sistema "Sin categoría" siempre va al final.
    if (a.id === SYSTEM_CATEGORY_ID) return 1;
    if (b.id === SYSTEM_CATEGORY_ID) return -1;
    return a.order - b.order;
  });
}

async function addCategory(name) {
  const store = await tx(STORE_CATEGORIES, 'readwrite');
  const existing = await reqToPromise(store.getAll());
  const category = {
    id: uid(),
    name: name.trim(),
    order: existing.length,
    collapsed: false,
    isSystem: false,
    createdAt: Date.now(),
  };
  await reqToPromise(store.add(category));
  return category;
}

async function renameCategory(id, name) {
  const store = await tx(STORE_CATEGORIES, 'readwrite');
  const cat = await reqToPromise(store.get(id));
  if (!cat) return null;
  cat.name = name.trim();
  await reqToPromise(store.put(cat));
  return cat;
}

async function setCategoryCollapsed(id, collapsed) {
  const store = await tx(STORE_CATEGORIES, 'readwrite');
  const cat = await reqToPromise(store.get(id));
  if (!cat) return null;
  cat.collapsed = collapsed;
  await reqToPromise(store.put(cat));
  return cat;
}

async function deleteCategory(id) {
  const store = await tx(STORE_CATEGORIES, 'readwrite');
  await reqToPromise(store.delete(id));
}

async function ensureSystemCategory() {
  const store = await tx(STORE_CATEGORIES, 'readwrite');
  const existing = await reqToPromise(store.get(SYSTEM_CATEGORY_ID));
  if (existing) return existing;
  const cat = {
    id: SYSTEM_CATEGORY_ID,
    name: 'Sin categoría',
    order: 999999,
    collapsed: false,
    isSystem: true,
    createdAt: Date.now(),
  };
  await reqToPromise(store.add(cat));
  return cat;
}

/* ---------------------------------------------------------------- */
/* Alimentos                                                         */
/* ---------------------------------------------------------------- */

async function getAllItems() {
  const store = await tx(STORE_ITEMS, 'readonly');
  const all = await reqToPromise(store.getAll());
  return all.sort((a, b) => a.order - b.order);
}

async function addItem(name, categoryId) {
  const store = await tx(STORE_ITEMS, 'readwrite');
  const existing = await reqToPromise(store.getAll());
  const item = {
    id: uid(),
    name: name.trim(),
    categoryId,
    completed: false,
    order: existing.length,
    createdAt: Date.now(),
    completedAt: null,
  };
  await reqToPromise(store.add(item));
  return item;
}

async function setItemCompleted(id, completed) {
  const store = await tx(STORE_ITEMS, 'readwrite');
  const item = await reqToPromise(store.get(id));
  if (!item) return null;
  item.completed = completed;
  item.completedAt = completed ? Date.now() : null;
  await reqToPromise(store.put(item));
  return item;
}

async function deleteItem(id) {
  const store = await tx(STORE_ITEMS, 'readwrite');
  await reqToPromise(store.delete(id));
}

async function reassignItemsCategory(fromCategoryId, toCategoryId) {
  const store = await tx(STORE_ITEMS, 'readwrite');
  const all = await reqToPromise(store.getAll());
  const affected = all.filter((it) => it.categoryId === fromCategoryId);
  for (const item of affected) {
    item.categoryId = toCategoryId;
    await reqToPromise(store.put(item));
  }
  return affected.length;
}

async function deleteItemsByCategory(categoryId) {
  const store = await tx(STORE_ITEMS, 'readwrite');
  const all = await reqToPromise(store.getAll());
  const affected = all.filter((it) => it.categoryId === categoryId);
  for (const item of affected) {
    await reqToPromise(store.delete(item.id));
  }
  return affected.length;
}

/* ---------------------------------------------------------------- */
/* Primer arranque: categorías por defecto                           */
/* ---------------------------------------------------------------- */

async function seedDefaultsIfEmpty() {
  await ensureSystemCategory();
  const categories = await getAllCategories();
  const hasRealCategories = categories.some((c) => !c.isSystem);
  if (hasRealCategories) return;

  const defaults = ['🥬 Frutas y verduras', '🥛 Lácteos', '🥩 Carnes'];
  for (const name of defaults) {
    await addCategory(name);
  }
}

export const DB = {
  getAllCategories,
  addCategory,
  renameCategory,
  setCategoryCollapsed,
  deleteCategory,
  ensureSystemCategory,
  getAllItems,
  addItem,
  setItemCompleted,
  deleteItem,
  reassignItemsCategory,
  deleteItemsByCategory,
  seedDefaultsIfEmpty,
};
