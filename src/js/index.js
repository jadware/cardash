import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../index.scss';
import { DBC } from './dbc.js';
import { saveByKey, loadByKey } from './persistent-storage.js';
import { createGrid } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);

const logTable = document.getElementById('logs-tbody');
const toggleUnknown = document.getElementById('toggle-unknown');
const textFilter = document.getElementById('text-filter');

const dbcLoad = document.getElementById('dbc-load');
const dbcFile = document.getElementById('dbc-file');
const dbcClear = document.getElementById('dbc-clear');

const logLoad = document.getElementById('log-load');
const logFile = document.getElementById('log-file');
const logClear = document.getElementById('log-clear');

const showUnknown = document.getElementById('toggle-unknown');

let disabled_ids = new Set();
let dbc = null;
let grid = null;
const allowed_transmitters = new Set();
let all_log_lines = [];


window.addEventListener('DOMContentLoaded', async () =>
{
	createTable();
	await restoreData();
	restoreFilters();

	// Add drag and drop handlers
	setupDragAndDrop();

	toggleUnknown.onchange = onToggleUnknown;
	textFilter.oninput = onTextFilterInput;
	
	dbcLoad.onclick = triggerDbcLoad;
	dbcFile.onchange = onDbcFileChange;
	dbcClear.onclick = clearDbc;

	logLoad.onclick = triggerCandumpLoad;
	logFile.onchange = onLogFileChange;
	logClear.onclick = clearCandump;
});

function createTable()
{
	//setup ag-grid 
	const gridOptions =
	{
		columnDefs:
		[
			{ field: 't', headerName: 'Time', width: 90 },
			{ field: 'id', headerName: 'ID', width: 60 },
			{ field: 'length', headerName: 'Len', width: 60 },
			{ field: 'message', headerName: 'Message', width: 500 },
		],
		rowModelType: 'infinite',
		datasource: infiniteDatasource,
		cacheBlockSize: 100,
		maxBlocksInCache: 10,
		rowSelection:
		{
			mode: 'singleRow',
			checkboxes: false,
			enableClickSelection: true,
		},
		defaultColDef: {
			resizable: false,
			filter: false,
			sortable: true,
		},
		onSelectionChanged,
	};

	// Create Grid: Create new grid within the #myGrid div, using the Grid Options object
	grid = createGrid(document.getElementById('logs-table'), gridOptions);
}

async function restoreData()
{
	let invalidated = false;

	const dbcText = await loadByKey('dbc');
	if (dbcText)
	{
		dbc = DBC.parse(dbcText);

		setDbcStatus(true);
		console.log('restored dbc');
		
		invalidated = true;
	}

	const logText = await loadByKey('log');
	if (logText)
	{
		all_log_lines = logText.split('\n');

		setLogStatus(true);
		console.log(`restored log with ${all_log_lines.length} rows`);

		invalidated = true;
	}

	if (invalidated)
		invalidateGrid();
}

function restoreFilters()
{
	disabled_ids = getDisabledIds();

	const showUnknown = localStorage.getItem('showUnknown') !== 'false';
	document.getElementById('toggle-unknown').checked = showUnknown;

	const textFilter = localStorage.getItem('textFilter') || '';
	document.getElementById('text-filter').value = textFilter;

	const dataEnabledTransmitters = JSON.parse(localStorage.getItem('enabledTransmitters') || '[]');
	allowed_transmitters.clear();
	dataEnabledTransmitters.forEach(tx => allowed_transmitters.add(tx));

	populateTransmitterList();
}

const infiniteDatasource =
{
	async getRows(params)
	{
		const { startRow, endRow } = params;
		const num_log_rows = all_log_lines.length;

		const rows = [];
		for (let i = startRow; i < endRow && i < num_log_rows; i++)
		{
			const decoded = decodeCandumpLine(all_log_lines[i]);

			if (!decoded || !decoded.id)
				continue;

			// Optional: filtering logic here
			if (!showUnknown.checked && !decoded.msg)
				continue;

			rows.push(
			{
				t: decoded.time.toFixed(3),
				id: decoded.id.toString(16).toUpperCase().padStart(3, '0'),
				length: decoded.length,
				message: decoded.msg || '',
			});
		}

		params.successCallback(rows, num_log_rows);
	}
};

function onSelectionChanged(event)
{
	if (event.selectedNodes.length === 0)
		return;

	const row = event.selectedNodes[0].data;

	console.log(row);
}

function invalidateGrid()
{
	grid.setGridOption('datasource', infiniteDatasource);
}

async function clearDbc()
{
	await saveByKey('dbc', '');
	dbc = null;
	invalidateGrid();

	console.log('cleared dbc');
}

async function clearCandump()
{
	await saveByKey('log', '');
	invalidateGrid();

	console.log('cleared candump');
}

async function onToggleUnknown(e)
{
	localStorage.setItem('showUnknown', e.target.checked);

	invalidateGrid();
};

async function onTextFilterInput(e)
{
	localStorage.setItem('textFilter', e.target.value);

	invalidateGrid();
};

async function onLogFileChange(e)
{
	const file = e.target.files[0];
	
	if (!file)
		return;

	const text = await file.text();
	all_log_lines = text.split('\n');

	await saveByKey('log', text);	

	invalidateGrid();
	setLogStatus(true);

	console.log('loaded log from file');
};

async function onDbcFileChange(e)
{
	const file = e.target.files[0];
	
	if (!file)
		return;

	const text = await file.text();
	await saveByKey('dbc', text);
	dbc = DBC.parse(text);
	invalidateGrid();
	setDbcStatus(true);

	console.log('loaded dbc from file');
}

function setDbcStatus(enabled)
{
}

function setLogStatus(enabled)
{
}

function triggerDbcLoad()
{
	dbcFile.click();
}

function triggerCandumpLoad()
{
	logFile.click();
}

function loadLog(text)
{
	const showUnknown = document.getElementById('toggle-unknown').checked;
	
	const lines = text.split('\n');
	const rows = [];
	const filterText = document.getElementById('text-filter').value.trim().toLowerCase();
	const idCountMap = new Map(); // New lookup table

	for (let line of lines)
	{
		if (!line.includes('#'))
			continue;

		const row = decodeCandumpLine(line);
		if (!row.id)
			continue;

		// Count ID regardless of filters
		const idStr = row.id.toString(16).toUpperCase().padStart(3, '0');
		idCountMap.set(idStr, (idCountMap.get(idStr) || 0) + 1);

		// Apply display filters
		if (!row.msg && !showUnknown)
			continue;
		
		if (disabled_ids.has(idStr))
			continue;

		if (row.transmitter && !allowed_transmitters.has(row.transmitter))
			continue;

		const fullText = `${row.idHex} ${row.msg || ''}`.toLowerCase();
		if (filterText && !fullText.includes(filterText))
			continue;
		
		let decodedHtml = '';
		
		if (row.decoded)
		{
			const entries = Object.entries(row.decoded);

			if (entries.length)
			{
				decodedHtml = `
					<details>
						<summary>${row.msg || ''}</summary>
						<ul class="mb-0">
							${entries.map(([k, v]) =>
							{
								let val = v;
								let label = k;

								if (typeof v === 'object' && v !== null && 'value' in v) {
									if ('label' in v) {
										val = v.label;
										label = v.comment || dbc?.signalComments.get(`${row.id}.${k}`) || k;
									} else {
										val = v.value;
										label = v.comment || dbc?.signalComments.get(`${row.id}.${k}`) || k;
									}
								} else {
									label = dbc?.signalComments.get(`${row.id}.${k}`) || k;
								}
								return `<li>${label}: ${val}</li>`;
							}).join('')}
						</ul>
					</details>`;
			}
			else
			{
				decodedHtml = row.msg || '';
			}
		}

		rows.push(`
			<tr>
				<td class="text-end opacity-50">${row.time.toFixed(3)}</td>
				<td class="text-center">${idStr}</td>
				<td class="text-center">${row.length}</td>
				<td></td>
				<td>${decodedHtml}</td>
			</tr>`);
	}

	logTable.innerHTML = rows.join('');
	updateIdCountTable(idCountMap); // Update table UI
}

function updateIdCountTable(map)
{
	const container = document.getElementById('id-count-buttons');
	container.innerHTML = '';

	const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);

	for (const [id, count] of entries)
	{
		const label = document.createElement('label');
		label.className = 'btn btn-outline-secondary btn-sm';
		
		const numericId = parseInt(id, 16);
		const name = dbc?.getMessageById(numericId)?.name || id;
		label.innerText = `${name} (${count})`;
		label.title = `ID: ${id}`;

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.className = 'btn-check';
		input.id = `id-toggle-${id}`;
		input.checked = !disabled_ids.has(id);

		label.setAttribute('for', input.id);

		input.addEventListener('change', async () =>
		{
			if (input.checked)
				disabled_ids.delete(id);
			else
				disabled_ids.add(id);

			setDisabledIds(disabled_ids);
			loadLog(await loadByKey('log'));
		});

		container.appendChild(input);
		container.appendChild(label);
	}
}

function decodeCandumpLine(rawLine)
{
	const regex = /^\((\d+\.\d+)\)\s+(\S+)\s+([A-Fa-f0-9]+)#([A-Fa-f0-9]*)$/;
	const line = rawLine.trim().replace(/\s+/g, ' ');
	const match = line.match(regex);

	if (!match)
		return {};

	const [, time, iface, id, dataHex] = match;
	const bytes = dataHex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || [];
	const numericId = parseInt(id, 16);
	const message = dbc?.getMessageById(numericId);

	const decoded = dbc?.decodeFrame(numericId, bytes);

	return {
		time: parseFloat(time),
		interface: iface,
		id: numericId,
		msg: message?.name,
		transmitter: message?.transmitter,
		idHex: id.toUpperCase(),
		data: bytes,
		dataHex: bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()),
		length: bytes.length,
		decoded
	};
}

function setEnabledTransmitters(list)
{
	localStorage.setItem('enabledTransmitters', JSON.stringify(list));
}

function populateTransmitterList()
{
	const container = document.getElementById('transmitter-list');
	container.innerHTML = '';

	const all = dbc.getTransmitters();
	let enabled = new Set(allowed_transmitters);

	if (enabled.size === 0)
		enabled = new Set(all);

	for (const tx of all)
	{
		const id = `tx-${tx}`;
		const li = document.createElement('li');

		li.innerHTML = `
			<div class="form-check form-switch">
				<input class="form-check-input" type="checkbox" id="${id}" ${enabled.has(tx) ? 'checked' : ''}>
				<label class="form-check-label" for="${id}">${tx}</label>
			</div>`;

		const checkbox = li.querySelector('input');

		checkbox.addEventListener('change', async () =>
		{
			if (checkbox.checked)
				enabled.add(tx);
			else
				enabled.delete(tx);

			setEnabledTransmitters([...enabled]);

			grid.redrawRows();
		});

		container.appendChild(li);
	}

	setEnabledTransmitters([...enabled]);
}

function getDisabledIds()
{
	return new Set(JSON.parse(localStorage.getItem('disabledIds') || '[]'));
}

function setDisabledIds(set)
{
	localStorage.setItem('disabledIds', JSON.stringify([...set]));
}

function setupDragAndDrop()
{
	// Prevent default drag behaviors
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName =>
	{
		window.addEventListener(eventName, preventDefaults, false);
		document.body.addEventListener(eventName, preventDefaults, false);
	});

	// Handle dropped files
	window.addEventListener('drop', handleDrop, false);
	document.body.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e)
{
	e.preventDefault();
	e.stopPropagation();
}

async function handleDrop(e)
{
	e.preventDefault();
	e.stopPropagation();
	
	const files = e.dataTransfer.files;
	
	// Log each file's details
	for (let i = 0; i < files.length; i++)
	{
		const file = files[i];

		//check if the file is a dbc file
		if (file.name.endsWith('.dbc'))
		{
			const text = await file.text();
			dbc = DBC.parse(text);

			//save file to database
			await saveByKey('dbc', text);

			setDbcStatus(true);

			console.log('loaded dbc from drag/drop');

			//invalidate the grid
			invalidateGrid();
		}
		else if (file.name.endsWith('.log'))
		{
			const text = await file.text();

			//save file to database
			await saveByKey('log', text);

			setLogStatus(true);

			console.log('loaded log from drag/drop');

			//invalidate the grid
			invalidateGrid();
		}
		else
		{
			console.log('Unsupported file type:', file.name);
		}
	}
}
