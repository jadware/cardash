export function decodeCandumpLine(dbc, rawLine)
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

//TODO
export function encodeCandumpLine(dbc, decoded)
{
	const message = dbc?.getMessageById(decoded.id);
	const bytes = decoded.bytes;
	const dataHex = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');

	return `(${decoded.time}) ${decoded.interface} ${decoded.id}#${dataHex}`;
}