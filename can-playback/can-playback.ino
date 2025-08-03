// Replay CAN frames provided over the serial port.
//
// Each incoming line is expected to be in the `candump` textual
// format: e.g. "(0.123456) can 123#DEADBEEF".  The parsed frame is
// transmitted on the CAN bus using an MCP_CAN controller and the LED
// is blinked briefly to indicate activity.

#include <SPI.h>
#include <mcp_can.h>

const int CAN_CS = 17;        // Chip select for CAN controller
MCP_CAN CAN(CAN_CS);

const int LED_PIN = LED_BUILTIN; // On-board LED for status indication
unsigned long ledOffTime = 0;    // Time when LED should turn off
bool ledOn = false;              // Tracks LED state

float playbackSpeed = 1.0f; // 1.0 = normal speed. Smaller values replay faster.
float lastTs = 0;           // Timestamp of last transmitted frame
int currentIndex = 0;       // Position in log when using stored data

void setup()
{
	pinMode(LED_PIN, OUTPUT);
	digitalWrite(LED_PIN, HIGH);
	delay(500); // startup pulse
	digitalWrite(LED_PIN, LOW);

	Serial.begin(961200);
	while (!Serial)
		delay(10);

	if (CAN.begin(MCP_ANY, CAN_500KBPS, MCP_8MHZ) != CAN_OK)
	{
		Serial.println("CAN init failed");
		while (1);
	}
	CAN.setMode(MCP_NORMAL);

	Serial.println("Starting CAN log playback");
}

void loop()
{
	// Turn off the LED once its on-duration has expired
	if (ledOn && millis() >= ledOffTime)
	{
			digitalWrite(LED_PIN, LOW);
			ledOn = false;
	}

	// Read a candump line from the serial port and transmit it
	if (Serial.available())
	{
			String line = Serial.readStringUntil('\n');
			line.trim();
			if (line.length() > 0)
			{
					float ts = parseAndSend(line.c_str());
					float delta = ts - lastTs;
					lastTs = ts;
					// Wait for the original inter-frame delay adjusted
					// by the configured playback speed
					delay((int)(delta * 1000.0f * playbackSpeed));
			}
	}

	// Example logic for playing back from an in-memory buffer
	// when no serial data is present.  `line` would be replaced
	// with a String pulled from such a buffer.
	if (!line)
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
	// Turn on LED briefly to indicate that a frame is being sent
	digitalWrite(LED_PIN, HIGH);
	ledOffTime = millis() + 10;
	ledOn = true;

	String l(line);

	// Extract timestamp component "(0.123456)" from the string
	int tsStart = l.indexOf('(') + 1;
	int tsEnd = l.indexOf(')');
	float ts = l.substring(tsStart, tsEnd).toFloat();

	// Parse CAN identifier (hex) between the space and '['
	int idStart = l.indexOf(' ', tsEnd + 2) + 1;
	int idEnd = l.indexOf('[', idStart) - 1;
	String idStr = l.substring(idStart, idEnd);
	unsigned long id = strtoul(idStr.c_str(), NULL, 16);

	// Extract data length and payload bytes
	int lenStart = l.indexOf('[', idEnd) + 1;
	int lenEnd = l.indexOf(']', lenStart);
	int len = l.substring(lenStart, lenEnd).toInt();

	byte data[8] = {0};
	int dataStart = l.indexOf(']', lenEnd) + 2;

	for (int i = 0; i < len; i++)
	{
			String byteStr = l.substring(dataStart + i * 3, dataStart + i * 3 + 2);
			data[i] = strtoul(byteStr.c_str(), NULL, 16);
	}

	// Transmit the frame and print a summary to Serial
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

	return ts;
}