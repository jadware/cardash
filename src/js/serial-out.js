/**
 * Global writer object for serial output
 * @type {WritableStreamDefaultWriter}
 */
let serialWriter;

/**
 * Opens a serial port connection for writing data
 * @param {number} baudRate - Baud rate for serial communication (default: 916200)
 * @returns {Promise<void>}
 */
export async function openSerialOutput(baudRate = 916200)
{
	// Request access to a serial port from the user
	const port = await navigator.serial.requestPort();
	await port.open({ baudRate });
	
	// Get a writer to send data through the serial port
	serialWriter = port.writable.getWriter();
}

/**
 * Writes a line of data to the serial port
 * @param {Object} line - Object containing data to write
 * @param {string} line.dataHex - Hex string representation of data to write
 * @returns {void}
 */
export function writeLine(line)
{
	if (!serialWriter || !line)
		return;

	// Add newline and encode the string as bytes
	const str = line.dataHex + '\n';
	const enc = new TextEncoder();
	
	// Write the encoded bytes to the serial port
	serialWriter.write(enc.encode(str));
}
