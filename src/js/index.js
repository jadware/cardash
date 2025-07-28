import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../index.scss';
import Clusterize from './clusterize.js';
import { DBC } from './dbc.js';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'; 

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule]);

const dbcStatus = document.getElementById('dbcStatus');
const candumpStatus = document.getElementById('candumpStatus');
const logTable = document.getElementById('logs-tbody');

let dbc = null;

window.addEventListener('DOMContentLoaded', () =>
{
	const showUnknown = localStorage.getItem('showUnknown') !== 'false';
	document.getElementById('toggle-unknown').checked = showUnknown;

	document.getElementById('toggle-unknown').addEventListener('change', (e) =>
	{
		localStorage.setItem('showUnknown', e.target.checked);
		loadLog(localStorage.getItem('logText') || '');
	});

	const dbcText = localStorage.getItem('dbcText');
	if (dbcText)
	{
		dbc = DBC.parse(dbcText);
		setStatus(dbcStatus, 'Restored');
		populateTransmitterList();
	}

	const logText = localStorage.getItem('logText');
	if (logText)
	{
		loadLog(logText);
		setStatus(candumpStatus, 'Restored');
	}
	
	document.getElementById('text-filter').addEventListener('input', () =>
	{
		loadLog(localStorage.getItem('logText') || '');
	});

	document.getElementById('dbc-load').onclick = triggerDBCLoad;
	document.getElementById('log-load').onclick = triggerCandumpLoad;

	document.getElementById('dbcFile').onchange = async (e) =>
	{
		const file = e.target.files[0];
		if (!file) return;

		const text = await file.text();
		localStorage.setItem('dbcText', text);
		dbc = DBC.parse(text);
		setStatus(dbcStatus, file.name);
		populateTransmitterList();
		loadLog(localStorage.getItem('logText') || '');
	};

	document.getElementById('logFile').onchange = async (e) =>
	{
		const file = e.target.files[0];
		if (!file) return;

		const text = await file.text();
		localStorage.setItem('logText', text);
		loadLog(text);
		setStatus(candumpStatus, file.name);
	};
});

function setStatus(badge, label)
{
	// Optional: update badge UI
}

function triggerDBCLoad()
{
	document.getElementById('dbcFile').click();
}

function triggerCandumpLoad()
{
	document.getElementById('logFile').click();
}

function clearDBC()
{
	localStorage.removeItem('dbcText');
	dbc = null;
	setStatus(dbcStatus, 'Not Loaded');
}

function clearCandump()
{
	localStorage.removeItem('logText');
	setStatus(candumpStatus, 'Not Loaded');
}

function loadLog(text)
{
	const showUnknown = document.getElementById('toggle-unknown').checked;
	const allowedTransmitters = new Set(getEnabledTransmitters());
	const lines = text.split('\n');
	const rows = [];
	const filterText = document.getElementById('text-filter').value.trim().toLowerCase();

	for (let line of lines)
	{
		if (!line.includes('#'))
			continue;

		const row = decodeCandumpLine(line);
		if (!row.id)
			continue;

		if (!row.msg && !showUnknown)
			continue;

		if (row.transmitter && !allowedTransmitters.has(row.transmitter))
			continue;
		
		const fullText = `${row.idHex} ${row.msg || ''}`.toLowerCase();
			if (filterText && !fullText.includes(filterText))
				continue;

		rows.push(`
			<tr>
				<td class="text-end opacity-50">${row.time.toFixed(3)}</td>
				<td class="text-center">${row.id.toString(16).toUpperCase().padStart(3, '0')}</td>
				<td class="text-center">${row.length}</td>
				<td>${row.msg || ''}</td>
			</tr>`);
	}

	logTable.innerHTML = rows.join('');
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

	return {
		time: parseFloat(time),
		interface: iface,
		id: numericId,
		msg: message?.name,
		transmitter: message?.transmitter,
		idHex: id.toUpperCase(),
		data: bytes,
		dataHex: bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()),
		length: bytes.length
	};
}


function getEnabledTransmitters()
{
	return JSON.parse(localStorage.getItem('enabledTransmitters') || '[]');
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
	let enabled = new Set(getEnabledTransmitters());

	if (enabled.size === 0)
	{
		enabled = new Set(all);
	}

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

		checkbox.addEventListener('change', () =>
		{
			if (checkbox.checked)
			{
				enabled.add(tx);
			}
			else
			{
				enabled.delete(tx);
			}

			setEnabledTransmitters([...enabled]);
			loadLog(localStorage.getItem('logText') || '');
		});

		container.appendChild(li);
	}

	setEnabledTransmitters([...enabled]);
}
