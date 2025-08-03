import { get } from './rest.js'

/**
 * automatically download a file with the given text contents
 * @param {any} text
 * @param {any} filename
 */
export function saveTextAndDownload(text, filename)
{
	var a = document.createElement('a');
	a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	a.setAttribute('download', filename);
	a.click();
}


/**
 * Trigger a browser download for a given Blob.
 *
 * @param {string} filename - Name for the downloaded file.
 * @param {Blob} blob - Binary data to save.
 */
export function downloadBlob(filename, blob)
{
	const link = URL.createObjectURL(blob);

	var a = document.createElement("a");
	a.setAttribute("download", filename);
	a.setAttribute("href", link);
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}


/**
 * Download a file from the server and save it locally.
 *
 * @param {string} dir - Directory path on the server.
 * @param {string} filename - Name of the file to download.
 * @returns {Promise<boolean>} Resolves with true if download succeeded.
 */
export async function downloadFile(dir, filename)
{
	//load records
	const response = await get(`/${dir}/${filename}`);

	//don't download if invalid
	if (response.status != 200)
		return false;

	//pull the blob
	const blob = await response.blob();

	//save to downloads
	downloadBlob(filename, blob);

	return true;
}