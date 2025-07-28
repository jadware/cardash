/**
 * Open (or create) the IndexedDB database and return the DB instance
 */
function openDB()
{
	return new Promise((resolve, reject) =>
	{
		const req = indexedDB.open('LogViewerDB', 1);

		req.onupgradeneeded = () =>
		{
			const db = req.result;
			
			if (!db.objectStoreNames.contains('files'))
				db.createObjectStore('files');
		};

		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/**
 * Open the IndexedDB database and return the DB instance
 * @param {string} key
 * @param {Blob | any} blobOrValue
 */
export async function saveByKey(key, blobOrValue)
{
	const db = await openDB();
	const tx = db.transaction('files', 'readwrite');
	
	tx.objectStore('files').put(blobOrValue, key);
	
	await tx.done ?? new Promise((res, rej) =>
	{
		tx.oncomplete = res;
		tx.onerror = () => rej(tx.error);
	});
	
	db.close();
}

/** 
 * Save a blob or value under a given string key
 * @param {string} key
 * @returns {Promise<Blob | any>}
 */
export async function loadByKey(key)
{
	const db = await openDB();
	const tx = db.transaction('files', 'readonly');
	const store = tx.objectStore('files');

	const result = await new Promise((resolve, reject) =>
	{
		const req = store.get(key);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

	db.close();
	return result;
}
