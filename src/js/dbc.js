export class DBC
{
        constructor()
        {
                this.messages = new Map(); // id → { id, name, dlc, signals[] }
                this.transmitters = new Set(); // node names
                this.signalComments = new Map(); // key: "msgId.signalName" → comment
                this.valueTables = new Map(); // key: "msgId.signalName" → { value: label }
        }

        /**
         * Parse DBC file contents and return a populated {@link DBC} instance.
         *
         * @param {string} text - Raw text from a DBC file.
         * @returns {DBC} Parsed DBC object.
         */
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
				currentMsg =
				{
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
				const match = line.match(/^SG_\s+(\w+)(?:\s+(M|m\d+))?\s*:\s*(\d+)\|(\d+)@(\d)([+-])\s+\(([^)]+)\)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(.*)$/);
				if (!match)
					continue;

				const [
					, name, muxIndicator, startBit, length, byteOrder, sign,
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
					unit: unit || null,
					receiver: receivers.trim(),
					multiplexerIndicator: muxIndicator || null, // "M", "m1", or null
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

		const totalSignals = Array.from(dbc.messages.values()).reduce((sum, msg) => sum + msg.signals.length, 0);
		console.log(`DBC >>>  msg: ${dbc.messages.size}  |  sig: ${totalSignals}  |  sigcom: ${dbc.signalComments.size}  |  val: ${dbc.valueTables.size}  |  tx: ${dbc.transmitters.size}`);

		return dbc;
	}

        /**
         * Retrieve a message definition by its CAN identifier.
         *
         * @param {number} id - Numeric CAN message identifier.
         * @returns {?Object} Message definition or null if not found.
         */
        getMessageById(id)
        {
                return this.messages.get(id) || null;
        }

        /**
         * Get the list of transmitters defined in the DBC file.
         *
         * @returns {string[]} Array of transmitter node names.
         */
        getTransmitters()
        {
                return Array.from(this.transmitters);
        }

        /**
         * Decode a CAN frame into signal values using the DBC definitions.
         *
         * @param {number} id - CAN message identifier.
         * @param {number[]} bytes - Data bytes of the frame.
         * @returns {?Object} Decoded signal values or null if message unknown.
         */
        decodeFrame(id, bytes)
        {
                const msg = this.messages.get(id);
                if (!msg || !msg.signals || msg.signals.length === 0)
                        return null;
	
		const result = {};
	
		const muxSig = msg.signals.find(s => s.multiplexerIndicator === 'M');
		let muxVal = null;
	
		if (muxSig)
		{
			const rawMuxVal = extractSignalBits(bytes, muxSig.startBit, muxSig.length, muxSig.byteOrder === 1);
			const val = muxSig.isSigned ? toSigned(rawMuxVal, muxSig.length) : rawMuxVal;
			muxVal = val * muxSig.factor + muxSig.offset;
	
			// include mux signal itself
			result[muxSig.name] = muxVal;
		}
	
		for (const sig of msg.signals)
		{
			if (sig.multiplexerIndicator?.startsWith('m'))
			{
				const mVal = Number(sig.multiplexerIndicator.slice(1));

				if (muxVal !== mVal)
					continue;
			}
		
			const rawVal = extractSignalBits(bytes, sig.startBit, sig.length, sig.byteOrder === 1);
			const val = sig.isSigned ? toSigned(rawVal, sig.length) : rawVal;
			const value = val * sig.factor + sig.offset;
			const unit = sig.unit;
		
			const key = `${id}.${sig.name}`;
			const comment = this.signalComments.get(key);
			const value_label_map = this.valueTables.get(key);
		
			if (value_label_map?.hasOwnProperty(val))
			{
				result[sig.name] =
				{
					value,
					label: value_label_map[val],
				};

				if (comment)
					result[sig.name].comment = comment;
			}
			else if (comment)
			{
				result[sig.name] =
				{
					value,
					comment,
				};
			}
			else
			{
				if (unit)
				{
					result[sig.name] =
					{
						value,
						unit,
					};
				}
				else
				{
					result[sig.name] = value;
				}
			}
		}
	
		return result;
	}
}

/**
 * Extract an integer value from a byte array given bit offset and length.
 *
 * @param {number[]} bytes - Array of CAN data bytes.
 * @param {number} startBit - Starting bit index.
 * @param {number} length - Number of bits to extract.
 * @param {boolean} littleEndian - Whether the signal is little endian.
 * @returns {number} Unsigned integer value.
 */
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

                if (byteIndex >= bytes.length)
                        continue;

                const bit = (bytes[byteIndex] >> bitPos) & 1;
                value |= bit << i;
        }

        return value >>> 0;
}

/**
 * Convert an unsigned integer to a signed integer with the given bit width.
 *
 * @param {number} value - Unsigned integer value.
 * @param {number} bits - Bit width of the value.
 * @returns {number} Signed integer.
 */
function toSigned(value, bits)
{
        const shift = 32 - bits;
        return (value << shift) >> shift;
}
