// Replay CAN frames provided over the serial port.
//
// Each incoming line is expected in candump format, e.g.:
// "(0.123456) can 123#DEADBEEF"
// Parsed frames are sent via MCP_CAN, and the LED blinks to indicate activity.

#include <SPI.h>
#include <mcp_can.h>

const int CAN_CS = 17;        // MCP2515 chip select pin
MCP_CAN CAN(CAN_CS);          // CAN controller object

const int LED_PIN = LED_BUILTIN; // Built-in LED for transmission indicator
unsigned long ledOffTime = 0;    // Time (ms) when LED should turn off
bool ledOn = false;              // LED state tracker

float playbackSpeed = 1.0f; // Speed multiplier (1.0 = real time, <1 = faster)
float lastTs = 0;           // Timestamp of last sent frame
int currentIndex = 0;       // Index into buffer (used if not streaming live)

void setup()
{
	pinMode(LED_PIN, OUTPUT);

	// Startup pulse
	digitalWrite(LED_PIN, HIGH);
	delay(500);
	digitalWrite(LED_PIN, LOW);

	// Serial port for candump input
	Serial.begin(961200);
	while (!Serial)
		delay(10); // Wait for serial ready

	// Init CAN controller: any filter, 500kbps, 8MHz crystal
	if (CAN.begin(MCP_ANY, CAN_500KBPS, MCP_8MHZ) != CAN_OK)
	{
		Serial.println("CAN init failed");
		while (1); // Halt if init fails
	}
	CAN.setMode(MCP_NORMAL); // Enable CAN controller

	Serial.println("Starting CAN log playback");
}

void loop()
{
	// Turn off LED after brief blink
	if (ledOn && millis() >= ledOffTime)
	{
		digitalWrite(LED_PIN, LOW);
		ledOn = false;
	}

	// Handle serial playback if data available
	if (Serial.available())
	{
		String line = Serial.readStringUntil('\n');
		line.trim();
		if (line.length() > 0)
		{
			float ts = parseAndSend(line.c_str());
			float delta = ts - lastTs;
			lastTs = ts;
			delay((int)(delta * 1000.0f * playbackSpeed)); // Replay delay
		}
	}

	// Placeholder for static buffer playback if no serial data
	// Replace `line` with data from memory or storage
	if (!line) // NOTE: `line` undefined in this scope — placeholder logic
	{
		currentIndex = 0;
		lastTs = 0;
		return;
	}

	float ts = parseAndSend(line);
	float delta = ts - lastTs;
	lastTs = ts;

	delay((int)(delta * 1000.0f * playbackSpeed));
	currentIndex++;
}

float parseAndSend(const char* line)
{
	// Blink LED to indicate frame transmission
	digitalWrite(LED_PIN, HIGH);
	ledOffTime = millis() + 10;
	ledOn = true;

	String l(line);

	// Extract timestamp: between '(' and ')'
	int tsStart = l.indexOf('(') + 1;
	int tsEnd = l.indexOf(')');
	float ts = l.substring(tsStart, tsEnd).toFloat();

	// Extract CAN ID: after "can " and before '['
	int idStart = l.indexOf(' ', tsEnd + 2) + 1;
	int idEnd = l.indexOf('[', idStart) - 1;
	String idStr = l.substring(idStart, idEnd);
	unsigned long id = strtoul(idStr.c_str(), NULL, 16);

	// Extract data length: between '[' and ']'
	int lenStart = l.indexOf('[', idEnd) + 1;
	int lenEnd = l.indexOf(']', lenStart);
	int len = l.substring(lenStart, lenEnd).toInt();

	// Extract hex bytes after ']' — separated by spaces
	byte data[8] = {0};
	int dataStart = l.indexOf(']', lenEnd) + 2;
	for (int i = 0; i < len; i++)
	{
		String byteStr = l.substring(dataStart + i * 3, dataStart + i * 3 + 2);
		data[i] = strtoul(byteStr.c_str(), NULL, 16);
	}

	// Send frame over CAN bus
	if (CAN.sendMsgBuf(id, 0, len, data) == CAN_OK)
	{
		Serial.print("Sent 0x"); Serial.print(id, HEX); Serial.print(" [");
		for (int i = 0; i < len; i++)
		{
			if (data[i] < 0x10) Serial.print("0");
			Serial.print(data[i], HEX); Serial.print(" ");
		}
		Serial.println("]");
	}
	else
	{
		Serial.println("Send failed");
	}

	return ts; // Return parsed timestamp for delay calculation
}
