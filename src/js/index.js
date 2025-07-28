import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../index.scss';
import { DBC } from './dbc.js';
import { saveByKey, loadByKey } from './persistent-storage.js';
import { createGrid } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);

const toggleUnknown = document.getElementById('toggle-unknown');
const textFilter = document.getElementById('text-filter');

const dbcLoad = document.getElementById('dbc-load');
const dbcFile = document.getElementById('dbc-file');
const dbcClear = document.getElementById('dbc-clear');

const logLoad = document.getElementById('log-load');
const logFile = document.getElementById('log-file');
const logClear = document.getElementById('log-clear');

const showUnknown = document.getElementById('toggle-unknown');

let all_log_lines = [];
const decoded_lines = [];
const logs_by_id = new Map(); // key: id (number), value: array of decoded entries

let disabled_ids = new Set();
let dbc = null;
let grid = null;
const allowed_transmitters = new Set();


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
			{ field: 'msg', headerName: 'Msg', width: 220 },
			//{ field: 'length', headerName: 'Len', width: 60 },
			{ field: 'decoded', headerName: 'Data', flex: 1, cellRenderer: decodedCellRenderer },
		],
		rowModelType: 'infinite',
		datasource: infiniteDatasource,
		cacheBlockSize: 1000,
		maxBlocksInCache: 1000,
		rowSelection:
		{
			mode: 'singleRow',
			checkboxes: false,
			enableClickSelection: true,
		},
		defaultColDef:
		{
			resizable: false,
			filter: false,
			sortable: true,
		},
		rowHeight: 20,
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
		processLog(logText);
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
			const payload = decoded_lines[i];

			if (!payload || !payload.id)
				continue;

			// Optional: filtering logic here
			if (!showUnknown.checked && !payload.msg)
				continue;

			rows.push(
			{
				t: payload.time.toFixed(3),
				id: payload.id.toString(16).toUpperCase().padStart(3, '0'),
				length: payload.length,
				msg: payload.msg,
				decoded: payload.decoded,
				dataHex: payload.dataHex,
				html: payload.html,
			});
		}

		params.successCallback(rows, num_log_rows);
	}
};

function decodedCellRenderer(params)
{
	if (!params.data)
		return ''; //still loading

	if (!params.data.msg)
		return `<span class="opacity-25">${params.data.dataHex}</span>`;

	if (params.value && params.data.html)
		return params.data.html;

	return `<span>${params.data.msg}</span>`;
	
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

	let html = '';
	const decoded = dbc?.decodeFrame(numericId, bytes);

	if (decoded)
	{
		//check if any of the decoded keys have a value with a comment
		const fields = [];

		for (const [key, val] of Object.entries(decoded))
		{
			if (typeof val === 'object')
			{
				const parts = [];

				if ('comment' in val)
					parts.push(val.comment);

				if ('label' in val)
					parts.push(val.label);
				else
					parts.push(val.value);

				if ('unit' in val)
					parts.push(val.unit);

				fields.push(`${key}: ${parts.join(' ')}`);
			}
			else
			{
				fields.push(`${key}: ${val}`);
			}
		}

		if (fields.length > 0)
			html = fields.join(' | ');
	}

	return {
		time: parseFloat(time),
		interface: iface,
		id: numericId,
		msg: message?.name,
		transmitter: message?.transmitter,
		idHex: id.toUpperCase(),
		bytes,
		dataHex: bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
		length: bytes.length,
		decoded,
		html,
	};
}

function onSelectionChanged(event)
{
	if (event.selectedNodes.length === 0)
	{
		selectRecord(null);
		return;
	}

	const row = event.selectedNodes[0].data;
	selectRecord(row);
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
	processLog(text);
	console.log('loaded log from file');

	invalidateGrid();

	await saveByKey('log', text);
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

function processLog(text)
{
	all_log_lines = text.split('\n');
	decoded_lines.length = all_log_lines.length;

	//pre-preocess all the lines
	//TODO: do this in the background after initial loaading?
	for (let i = 0; i < all_log_lines.length; i++)
		decoded_lines[i] = decodeCandumpLine(all_log_lines[i]);

	setLogStatus(true);
	
}

function selectRecord(row)
{
	if (!row)
	{
		console.log('selection cleared');
		return;
	}

	console.log('select record', row.decoded);
}

function setDbcStatus(enabled)
{
	//TODO
}

function setLogStatus(enabled)
{
	//TODO
}

function triggerDbcLoad()
{
	dbcFile.click();
}

function triggerCandumpLoad()
{
	logFile.click();
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
