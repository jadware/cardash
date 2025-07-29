/**
 * Opens a serial port connection for reading data
 * @param {Function} onLineReceived - Callback function to handle received lines
 * @param {number} baudRate - Baud rate for serial communication (default: 916200)
 * @returns {Promise<void>}
 */
export async function openSerialInput(onLineReceived, baudRate = 916200)
{
	// Request access to a serial port from the user
	const port = await navigator.serial.requestPort();
	await port.open({ baudRate });

	// Set up text decoder and transform stream to handle incoming data
	const decoder = new TextDecoderStream();
	const reader = port.readable.pipeThrough(decoder).pipeThrough(new TransformStream(
	{
		start(controller)
		{
			// Initialize empty buffer for accumulating partial lines
			this.buffer = '';
		},
		transform(chunk, controller)
		{
			// Add new chunk to buffer and split on newlines
			this.buffer += chunk;
			let lines = this.buffer.split('\n');
			this.buffer = lines.pop(); // save partial line for next chunk
			
			// Process complete lines
			for (let line of lines)
				controller.enqueue(line.trim());
		}
	})).getReader();

	/**
	 * Continuously reads data from the serial port
	 * @returns {Promise<void>}
	 */
	async function readLoop()
	{
		try
		{
			while (true)
			{
				// Read next value from the stream
				const { value, done } = await reader.read();
				
				if (done)
					break;
				
				// Pass complete lines to callback
				if (value)
					onLineReceived(value);
			}
		}
		catch (err)
		{
			console.error('Serial read error:', err);
		}
		finally
		{
			// Clean up resources
			reader.releaseLock();
			
			await port.close();
		}
	}

	readLoop();
}
