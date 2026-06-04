// Storage utilities (client-side for blocked page)
// Note: Most storage operations are handled by the service worker
// This file provides helper functions for direct IndexedDB access if needed

const DB_NAME = 'SelfieShameDB';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';

class ShameStorage {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(PHOTOS_STORE)) {
          const store = database.createObjectStore(PHOTOS_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async getPhotos() {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readonly');
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPhotoCount() {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readonly');
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearPhotos() {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
// biome-ignore lint/correctness/noUnusedVariables: web-accessible global used by pages and tests
const shameStorage = new ShameStorage();
