import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '../index.scss'
import Clusterize from './clusterize.js'

const dbcStatus = document.getElementById('dbcStatus');
const candumpStatus = document.getElementById('candumpStatus');
const logTable = document.getElementById('logs-tbody');

let dbc = null;


window.addEventListener('DOMContentLoaded', () =>
{
	const dbcText = localStorage.getItem('dbcText');
	if (dbcText)
	{
		dbc = parseDBC(dbcText);
		setStatus(dbcStatus, 'Restored');
		console.log("Loaded DBC from localStorage");
	}

	const logText = localStorage.getItem('logText');
	if (logText)
	{
		loadLog(logText);
		setStatus(candumpStatus, 'Restored');
		console.log("Loaded candump log from localStorage");
	}
	
	const showUnknown = localStorage.getItem('showUnknown') !== 'false'; // default true
	document.getElementById('toggle-unknown').checked = showUnknown;
	
	document.getElementById('toggle-unknown').addEventListener('change', (e) =>
	{
		localStorage.setItem('showUnknown', e.target.checked);
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
		dbc = parseDBC(text);
		setStatus(dbcStatus, file.name);
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
//	badge.textContent = label;
//	badge.classList.remove('bg-secondary', 'bg-success');
//	badge.classList.add(label === 'Not Loaded' ? 'bg-secondary' : 'bg-success');
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
	const lines = text.split('\n');
	const rows = [];

	for (let line of lines)
	{
		if (!line.includes('#'))
			continue;
		
		const row = decodeCandumpLine(line);
		
		rows.push(`
			<tr>
				<td class="text-end opacity-50">${row.time}</td>
				<td class="text-center">${row.length}</td>
				<td>${row.data}</td>
			</tr>`);
	}
	
	logTable.innerHTML = rows.join('');
}

function parseDBC(text)
{
	return {}; // TODO: implement DBC parsing
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

	return {
		time: parseFloat(time),
		interface: iface,
		id: parseInt(id, 16),
		idHex: id.toUpperCase(),
		data: bytes,
		dataHex: bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()),
		length: bytes.length,
	};
}
