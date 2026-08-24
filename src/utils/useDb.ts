import { ref } from "vue";


export const useDb = () => {
  const request = window.indexedDB.open('nt', 0.1);
  const db = ref<IDBDatabase | null>(null)
  request.onupgradeneeded = function (event) {
    const database = (event.target as IDBOpenDBRequest | null)?.result
    if (!database) return

    db.value = database
    if (!database.objectStoreNames.contains('dataMap')) {
      const objectStore = database.createObjectStore('dataMap', { keyPath: 'id' });
      objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
    }
  }
  return { request, db }
}
