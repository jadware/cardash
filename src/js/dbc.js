export class DBC
{
	constructor()
	{
		this.messages = new Map(); // id → { id, name, dlc, signals[] }
		this.transmitters = new Set(); // node names
		this.signalComments = new Map(); // key: "msgId.signalName" → comment
		this.valueTables = new Map(); // key: "msgId.signalName" → { value: label }
	}

	static parse(text)
	{
		const dbc = new DBC();
		const lines = text.split('\n');

		let currentMsg = null;

		for (const raw of lines)
		{
			const line = raw.trim();

			if (line.startsWith('BO_'))
			{
				const match = line.match(/^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/);
				if (!match)
					continue;

				const [, id, name, dlc, transmitter] = match;
				currentMsg = {
					id: Number(id),
					name,
					dlc: Number(dlc),
					signals: []
				};
				
				dbc.transmitters.add(transmitter);
				dbc.messages.set(currentMsg.id, currentMsg);
			}
			else if (line.startsWith('SG_') && currentMsg)
			{
				const match = line.match(/^SG_\s+(\w+)(?:\s+M\s+(\d+))?\s*:\s*(\d+)\|(\d+)@(\d)([+-])\s+\(([^)]+)\)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(.+)/);
				if (!match)
					continue;

				const [
					, name, muxSwitch, startBit, length, byteOrder, sign,
					scaleOffset, minMax, unit, receivers
				] = match;

				const [factor, offset] = scaleOffset.split(',').map(Number);
				const [min, max] = minMax.split('|').map(Number);

				currentMsg.signals.push({
					name,
					startBit: Number(startBit),
					length: Number(length),
					byteOrder: Number(byteOrder), // 0=Motorola, 1=Intel
					isSigned: sign === '-',
					factor,
					offset,
					min,
					max,
					unit,
					receivers: receivers.trim().split(/\s+/),
					muxSwitch: muxSwitch ? Number(muxSwitch) : null,
					raw: line
				});
			}
			else if (line.startsWith('CM_ SG_'))
			{
				const match = line.match(/^CM_ SG_ (\d+)\s+(\w+)\s+"([^"]+)"/);
				if (match)
				{
					const [, msgId, sigName, comment] = match;
					dbc.signalComments.set(`${msgId}.${sigName}`, comment);
				}
			}
			else if (line.startsWith('VAL_'))
			{
				const match = line.match(/^VAL_\s+(\d+)\s+(\w+)\s+(.*)\s*;/);
				if (match)
				{
					const [, msgId, sigName, rest] = match;
					const key = `${msgId}.${sigName}`;
					const map = {};
					const regex = /(\d+)\s+"([^"]+)"/g;
					let m;
					while ((m = regex.exec(rest)))
						map[parseInt(m[1], 10)] = m[2];
					dbc.valueTables.set(key, map);
				}
			}
		}

		return dbc;
	}

	getMessageById(id)
	{
		return this.messages.get(id);
	}

	getTransmitters()
	{
		return Array.from(this.transmitters);
	}
	
	decodeFrame(id, bytes)
	{
		const msg = this.messages.get(id);
		if (!msg) return null;

		const result = {};

		for (const sig of msg.signals)
		{
			const rawVal = extractSignalBits(bytes, sig.startBit, sig.length, sig.byteOrder === 1);
			const val = sig.isSigned ? toSigned(rawVal, sig.length) : rawVal;
			const value = val * sig.factor + sig.offset;

			const key = `${id}.${sig.name}`;
			const comment = this.signalComments.get(key);
			const valMap = this.valueTables.get(key);

			if (valMap?.hasOwnProperty(val))
			{
				result[sig.name] = {
					value,
					label: valMap[val],
					comment
				};
			}
			else if (comment)
			{
				result[sig.name] = {
					value,
					comment
				};
			}
			else
			{
				result[sig.name] = value;
			}
		}

		return result;
	}
}

function extractSignalBits(bytes, startBit, length, littleEndian)
{
	let value = 0;

	for (let i = 0; i < length; i++)
	{
		const bitIndex = littleEndian
			? startBit + i
			: startBit + (length - 1 - i);

		const byteIndex = Math.floor(bitIndex / 8);
		const bitPos = bitIndex % 8;

		if (byteIndex >= bytes.length) continue;

		const bit = (bytes[byteIndex] >> bitPos) & 1;
		value |= bit << i;
	}

	return value >>> 0;
}

function toSigned(value, bits)
{
	const shift = 32 - bits;
	return (value << shift) >> shift;
}
