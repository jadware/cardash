import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../index.scss';
import { DBC } from './dbc.js';
import { decodeCandumpLine } from './candump.js';
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
const timeline = document.getElementById('timeline');
const rowCount = document.getElementById('row-count');
const timeMinSlider = document.getElementById('time-min');
const timeMaxSlider = document.getElementById('time-max');
const timeRangeDisplay = document.getElementById('time-range-display');

// Debounce mechanism for text filtering
let filterDebounceTimer = null;
let lastFilterTime = 0;
const FILTER_DEBOUNCE_DELAY = 500; // 500ms = 2 times per second max

// Debounce mechanism for window resize
let resizeDebounceTimer = null;
let lastResizeTime = 0;
const RESIZE_DEBOUNCE_DELAY = 333; // 333ms = 3 times per second max

let all_log_lines = [];
const decoded_lines = [];

let disabled_ids = new Set();
let dbc = null;
let grid = null;
const allowed_transmitters = new Set();
let history_by_id = {};

let time_min = 0;
let time_max = 0;

let id_selected = null;

// Time range filter
let timeFilterMin = 0;
let timeFilterMax = 0;


window.addEventListener('DOMContentLoaded', async () =>
{
	createTable();
	await restoreData();
	restoreFilters();

	// Add drag and drop handlers
	setupDragAndDrop();
	
	// Setup canvas sizing
	setupCanvasSizing();

	toggleUnknown.onchange = onToggleUnknown;
	textFilter.oninput = onTextFilterInput;
	
	timeMinSlider.oninput = onTimeRangeChange;
	timeMaxSlider.oninput = onTimeRangeChange;
	
	dbcLoad.onclick = triggerDbcLoad;
	dbcFile.onchange = onDbcFileChange;
	dbcClear.onclick = clearDbc;

	logLoad.onclick = triggerCandumpLoad;
	logFile.onchange = onLogFileChange;
	logClear.onclick = clearCandump;
});


/**
 * Initialize the ag-Grid table used to display CAN messages.
 *
 * @returns {void}
 */
function createTable()
{
	//setup ag-grid 
	const gridOptions =
	{
		columnDefs:
		[
			{ field: 't', headerName: 'Time', width: 90 },
			{ field: 'id', headerName: 'ID', width: 60 },
			{ field: 'msg', headerName: 'Msg', width: 220, editable: true },
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
		onCellValueChanged,
		onCellKeyDown,
		rowClassRules:
		{
			'row-selected-id': (params) => params.data?.id === id_selected,
		},
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
		//measure how long this will take
		console.log('processing log...');
		const start = performance.now();
		processLog(logText);
		const end = performance.now();
		const duration = (end - start) / 1000;
		console.log(`restored log with ${all_log_lines.length} rows in ${duration.toFixed(1)}s`);

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

	// Load saved selected ID from localStorage
	const savedSelectedId = localStorage.getItem('can_id_selected');
	if (savedSelectedId)
		id_selected = savedSelectedId;

	populateTransmitterList();
}

const infiniteDatasource =
{
	async getRows(params)
	{
		const { startRow, endRow } = params;
		
		// Get the current filter values
		const filterText = textFilter.value.toLowerCase().trim();
		const showUnknownChecked = showUnknown.checked;

		// Pre-calculate filtered row indices (only do this once per filter change)
		if (!this.filteredIndices || this.lastFilterText !== filterText || this.lastShowUnknown !== showUnknownChecked || this.lastTimeMin !== timeFilterMin || this.lastTimeMax !== timeFilterMax)
		{
			this.filteredIndices = [];
			this.lastFilterText = filterText;
			this.lastShowUnknown = showUnknownChecked;
			this.lastTimeMin = timeFilterMin;
			this.lastTimeMax = timeFilterMax;

			for (let i = 0; i < all_log_lines.length; i++)
			{
				const payload = decoded_lines[i];

				if (!payload || !payload.id)
					continue;

				// Apply "Show Unknown" filter
				if (!showUnknownChecked && !payload.msg)
					continue;

				// Apply time range filter
				if (payload.time < timeFilterMin || payload.time > timeFilterMax)
					continue;

				// Apply text filter
				if (filterText)
				{
					const idStr = payload.id.toString(16).toUpperCase().padStart(3, '0');
					const msgStr = payload.msg || '';
					const htmlStr = payload.html || '';

					const matchesFilter = idStr.toLowerCase().includes(filterText) ||
										msgStr.toLowerCase().includes(filterText) ||
										htmlStr.toLowerCase().includes(filterText);

					if (!matchesFilter)
						continue;
				}

				// This row passes all filters
				this.filteredIndices.push(i);
			}
		}

		// Get the requested range from filtered indices
		const filteredRows = [];
		const totalFilteredRows = this.filteredIndices.length;

		for (let i = startRow; i < endRow && i < totalFilteredRows; i++)
		{
			const originalIndex = this.filteredIndices[i];
			const payload = decoded_lines[originalIndex];

			filteredRows.push({
				t: payload.time.toFixed(3),
				id: payload.id.toString(16).toUpperCase().padStart(3, '0'),
				length: payload.length,
				msg: payload.msg,
				decoded: payload.decoded,
				dataHex: payload.dataHex,
				html: payload.html,
			});
		}

		// Return the correct total count of filtered rows
		params.successCallback(filteredRows, totalFilteredRows);
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

function onCellKeyDown(event)
{
	const api = event.api;
	const key = event.event.key;
	const current = event.node;

	if (!current)
		return;

	let targetIndex = current.rowIndex;

	// Get page size based on actual viewport height
	switch (key)
	{
		case 'ArrowDown':
			targetIndex += 1;
			break;

		case 'ArrowUp':
			targetIndex -= 1;
			break;

		case 'PageDown':
			//TODO
			break;

		case 'PageUp':
			//TODO
			break;

		default:
			return;
	}

	const targetNode = api.getDisplayedRowAtIndex(targetIndex);
	if (targetNode)
	{
		api.forEachNode(node => node.setSelected(false));
		targetNode.setSelected(true);
		api.ensureIndexVisible(targetIndex, 'middle');
	}
}
	

function onCellValueChanged(event)
{
	switch (event.column.colId)
	{
		case 'msg':
			const id = event.data.id;
			const val = event.value;
			console.log(`TODO: change column for id ${id} to: ${val}`);
			break;
	}
}

function invalidateGrid()
{
	// Clear cached filtered indices so they get recalculated
	if (infiniteDatasource.filteredIndices)
	{
		delete infiniteDatasource.filteredIndices;
		delete infiniteDatasource.lastFilterText;
		delete infiniteDatasource.lastShowUnknown;
		delete infiniteDatasource.lastTimeMin;
		delete infiniteDatasource.lastTimeMax;
	}
	
	grid.setGridOption('datasource', infiniteDatasource); //TODO: replace this with something that doesn't break the table state
	updateRowCount();
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
	all_log_lines = [];
	decoded_lines.length = 0;
	history_by_id = {};
	
	// Reset time range
	time_min = 0;
	time_max = 0;
	timeFilterMin = 0;
	timeFilterMax = 0;
	
	// Reset timeline viewBox
	timeline.setAttribute('viewBox', '0 0 10 10');
	
	// Reset time range sliders
	timeMinSlider.value = 0;
	timeMaxSlider.value = 100;
	timeRangeDisplay.textContent = '0.000 - 0.000';
	
	invalidateGrid();
}

async function onToggleUnknown(e)
{
	localStorage.setItem('showUnknown', e.target.checked);

	invalidateGrid();
};

async function onTextFilterInput(e)
{
	localStorage.setItem('textFilter', e.target.value);

	// Clear existing timer
	if (filterDebounceTimer)
	{
		clearTimeout(filterDebounceTimer);
	}

	// Set new timer for debounced filtering
	filterDebounceTimer = setTimeout(() =>
	{
		invalidateGrid();
	}, FILTER_DEBOUNCE_DELAY);
};

async function onTimeRangeChange(e)
{
	const minPercent = parseInt(timeMinSlider.value);
	const maxPercent = parseInt(timeMaxSlider.value);
	
	// Ensure min doesn't exceed max
	if (minPercent > maxPercent)
	{
		if (e.target === timeMinSlider)
		{
			timeMaxSlider.value = minPercent;
		}
		else
		{
			timeMinSlider.value = maxPercent;
		}
	}
	
	// Convert percentages to actual timestamps
	const timeRange = time_max - time_min;
	timeFilterMin = time_min + (minPercent / 100) * timeRange;
	timeFilterMax = time_min + (maxPercent / 100) * timeRange;
	
	// Update display
	timeRangeDisplay.textContent = `${timeFilterMin.toFixed(3)} - ${timeFilterMax.toFixed(3)}`;
	
	// Save to localStorage
	localStorage.setItem('timeFilterMin', timeFilterMin.toString());
	localStorage.setItem('timeFilterMax', timeFilterMax.toString());
	
	// Apply filter
	invalidateGrid();
	
	// Redraw timeline if there's a selected ID
	if (id_selected)
		fillTimeline(timeline, id_selected, true);
}

async function onLogFileChange(e)
{
	const file = e.target.files[0];
	
	if (!file)
		return;

	console.log('loading log from file', file.name);
	const text = await file.text();
	processLog(text);
	console.log('loaded log from file', file.name);

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

/**
 * Parse raw candump text and populate decoded message history.
 *
 * @param {string} text - Raw candump log contents.
 * @returns {void}
 */
function processLog(text)
{
	history_by_id = {};

	all_log_lines = text.split('\n');

	const num_lines = all_log_lines.length;

	decoded_lines.length = num_lines;

	if (num_lines === 0)
		return;

	//pre-preocess all the lines
	//TODO: do this in the background after initial loaading?
	for (let i = 0; i < num_lines; i++)
	{
		const line = decodeCandumpLine(dbc, all_log_lines[i]);

		decoded_lines[i] = line;

		const id = line.idHex;

		if (history_by_id[id])
			history_by_id[id].push(line);
		else
			history_by_id[id] = [line];
	}

	// Track time range
	time_min = decoded_lines[0].time;
	time_max = decoded_lines[num_lines - 1].time;

	// Initialize time range sliders
	initializeTimeRangeSliders();

	// Restore timeline for saved selected ID
	if (id_selected)
		fillTimeline(timeline, id_selected, true);

	setLogStatus(true);
	updateRowCount();
}

function getHistoryById(id)
{
	return history_by_id[id] || [];
}

function selectRecord(row)
{
	if (!row)
	{
		return;
	}

	id_selected = row.id;
	localStorage.setItem('can_id_selected', row.id);
	fillTimeline(timeline, row.id, true);
	
	// Trigger grid refresh to recalculate row class rules
	grid.redrawRows();
}

function fillTimeline(timeline, id, force)
{
	if (id_selected === id && !force)
		return;

	id_selected = id;

	const ctx = timeline.getContext('2d');
	ctx.clearRect(0, 0, timeline.width, timeline.height);

	const events = getHistoryById(id) || [];

	if (events.length === 0)
		return;

	// Get timeline time bounds - use filtered range instead of full range
	const min = timeFilterMin;
	const max = timeFilterMax;
	const timeRange = max - min || 1;

	// Set canvas drawing properties
	ctx.strokeStyle = 'rgba(64, 128, 128, 0.5)';
	ctx.lineWidth = 1;

	for (const ev of events)
	{
		// Only draw events within the filtered time range
		if (ev.time >= min && ev.time <= max)
		{
			const normX = ((ev.time - min) / timeRange) * timeline.width;

			ctx.beginPath();
			ctx.moveTo(normX, 0);
			ctx.lineTo(normX, timeline.height);
			ctx.stroke();
		}
	}
}

function setDbcStatus(enabled)
{
	//TODO
}

function setLogStatus(enabled)
{
	//TODO
}

function updateRowCount()
{
	const totalCount = all_log_lines.length;
	
	// Get filtered count if available
	let filteredCount = totalCount;
	let isFiltered = false;
	
	if (infiniteDatasource.filteredIndices)
	{
		filteredCount = infiniteDatasource.filteredIndices.length;
		isFiltered = filteredCount !== totalCount;
	}
	
	// Check if any filters are active
	const hasTextFilter = textFilter.value.trim() !== '';
	const hasUnknownFilter = !showUnknown.checked;
	
	if (hasTextFilter || hasUnknownFilter)
	{
		isFiltered = true;
	}
	
	const formattedCount = filteredCount.toLocaleString();
	const totalFormatted = totalCount.toLocaleString();
	
	// Update row count display
	if (filteredCount === totalCount && !isFiltered)
	{
		rowCount.textContent = `${formattedCount} rows`;
		rowCount.className = 'badge bg-secondary';
	}
	else
	{
		rowCount.textContent = `${formattedCount} of ${totalFormatted} rows`;
		rowCount.className = 'badge bg-primary';
	}
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

	const all = dbc?.getTransmitters() || [];
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

/**
 * Configure drag-and-drop handlers for DBC and log files.
 *
 * @returns {void}
 */
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

function setupCanvasSizing()
{
	// Set initial canvas size
	resizeCanvas();
	
	// Add window resize listener with debouncing
	window.addEventListener('resize', debouncedResize);
}

function debouncedResize()
{
	const now = Date.now();
	const timeSinceLastResize = now - lastResizeTime;

	// If enough time has passed since last resize, trigger immediately
	if (timeSinceLastResize >= RESIZE_DEBOUNCE_DELAY)
	{
		lastResizeTime = now;
		resizeCanvas();
	}
	else
	{
		// Clear existing timer
		if (resizeDebounceTimer)
		{
			clearTimeout(resizeDebounceTimer);
		}

		// Set timer to trigger after the minimum delay
		const remainingDelay = RESIZE_DEBOUNCE_DELAY - timeSinceLastResize;
		resizeDebounceTimer = setTimeout(() =>
		{
			lastResizeTime = Date.now();
			resizeCanvas();
		}, remainingDelay);
	}
}

function resizeCanvas()
{
	const container = timeline.parentElement;
	const containerWidth = container.clientWidth;
	
	// Set canvas size to match container
	timeline.width = containerWidth;
	
	// Set CSS size to match
	timeline.style.width = containerWidth + 'px';
	
	// Redraw timeline if there's a selected ID
	if (id_selected)
		fillTimeline(timeline, id_selected, true);
}

function initializeTimeRangeSliders()
{
	// Load saved time range from localStorage
	const savedMin = localStorage.getItem('timeFilterMin');
	const savedMax = localStorage.getItem('timeFilterMax');
	
	if (savedMin && savedMax)
	{
		timeFilterMin = parseFloat(savedMin);
		timeFilterMax = parseFloat(savedMax);
	}
	else
	{
		// Default to full range
		timeFilterMin = time_min;
		timeFilterMax = time_max;
	}
	
	const timeRange = time_max - time_min;
	const minPercent = ((timeFilterMin - time_min) / timeRange) * 100;
	const maxPercent = ((timeFilterMax - time_min) / timeRange) * 100;
	
	timeMinSlider.value = minPercent;
	timeMaxSlider.value = maxPercent;
	
	// Update display
	timeRangeDisplay.textContent = `${timeFilterMin.toFixed(3)} - ${timeFilterMax.toFixed(3)}`;
}