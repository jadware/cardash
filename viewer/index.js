const dbcStatus = document.getElementById('dbcStatus');
const candumpStatus = document.getElementById('candumpStatus');

function setStatus(badge, label)
{
	badge.textContent = label;
	badge.classList.remove('bg-secondary', 'bg-success');
	badge.classList.add(label === 'Not Loaded' ? 'bg-secondary' : 'bg-success');
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
	clusterize.clear();
	setStatus(candumpStatus, 'Not Loaded');
}

let dbc = null;

const clusterize = new Clusterize({
	rows: [],
	scrollId: 'scrollArea',
	contentId: 'contentArea'
});

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
});

document.getElementById('dbcFile').addEventListener('change', async (e) =>
{
	const file = e.target.files[0];
	if (!file) return;

	const text = await file.text();
	localStorage.setItem('dbcText', text);
	dbc = parseDBC(text);
	setStatus(dbcStatus, file.name);
});

document.getElementById('logFile').addEventListener('change', async (e) =>
{
	const file = e.target.files[0];
	if (!file) return;

	const text = await file.text();
	localStorage.setItem('logText', text);
	loadLog(text);
	setStatus(candumpStatus, file.name);
});

function loadLog(text)
{
	const lines = text.split('\n');
	const rows = [];

	for (let line of lines)
	{
		if (!line.includes('#'))
			continue;

		const decoded = decodeCandumpLine(dbc, line);
		rows.push(`<tr><td>${decoded}</td></tr>`);
	}

	clusterize.update(rows);
}

// Stub functions (replace with real ones)
function parseDBC(text)
{
	return {}; // TODO: implement DBC parsing
}

function decodeCandumpLine(dbc, line)
{
	return line; // TODO: implement decoding logic
}
