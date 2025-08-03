// Capture CAN bus messages and emit them over the serial port
// in the `candump` text format.
//
// The sketch uses the Adafruit MCP2515 CAN controller library and
// blinks the built‑in LED whenever a frame is received.

#include <Adafruit_MCP2515.h>

#define CS_PIN PIN_CAN_CS            // Chip select for the MCP2515
#define CAN_BAUDRATE 500000           // CAN bus speed

Adafruit_MCP2515 mcp(CS_PIN);

const int LED_BLINK_INTERVAL = 50; // Minimum gap between LED blinks
const int LED_ON_DURATION = 5;     // Duration to keep LED on for each blink
const int LED_PIN = LED_BUILTIN;   // On‑board status LED pin
unsigned long ledOffTime = 0;      // Time when LED should turn off
unsigned long lastBlink = 0;       // Timestamp of last blink
bool ledOn = false;                // Tracks LED state


void setup()
{
	pinMode(LED_PIN, OUTPUT);
	digitalWrite(LED_PIN, HIGH);
	delay(500); // startup pulse
	digitalWrite(LED_PIN, LOW);
	
	Serial.begin(921600); //high speed baud rate to handle the thousands of messages per second

	while (!Serial)
		delay (10);

	if (!mcp.begin(CAN_BAUDRATE))
	{
		Serial.println("Error initializing MCP2515.");
		
		while (1)
			delay(1000); // TODO: indicate failure
	}
}

void loop()
{
	// turn off LED if needed
	if (ledOn && millis() >= ledOffTime)
	{
		digitalWrite(LED_PIN, LOW);
		ledOn = false;
	}

	int packetSize = mcp.parsePacket();
	if (packetSize == 0)
		return;
	
	unsigned long id = mcp.packetId();
	bool extended = mcp.packetExtended();
	bool rtr = mcp.packetRtr();
	uint8_t len = mcp.packetDlc();
	
	unsigned long now = millis();
	float ts = now / 1000.0;

	logCandump(ts, id, extended, rtr, len);
	
	// blink only if enough time passed since last blink
	if (now - lastBlink >= LED_BLINK_INTERVAL)
	{
		digitalWrite(LED_PIN, HIGH);
		ledOffTime = lastBlink + LED_ON_DURATION;
		ledOn = true;
		lastBlink = now;
	}
}

// Format a received CAN frame using the `candump` syntax
// (e.g. "(0.123456) can 123#DEADBEEF") and send it over Serial.
void logCandump(float ts, unsigned long id, bool extended, bool rtr, uint8_t len)
{
	Serial.printf("(%.6f) c ", ts);

	if (extended)
	{
		Serial.print(id, HEX); // will be up to 8 digits
	}
	else
	{
		if (id < 0x100)
			Serial.print("0"); // pad to 3 digits

		if (id < 0x10)
			Serial.print("0");

		Serial.print(id, HEX); // will be 3 digits
	}

	Serial.print("#");

	if (!rtr)
	{
		for (int i = 0; i < len; i++)
		{
			uint8_t b = mcp.read();

			if (b < 0x10)
				Serial.print("0");

			Serial.print(b, HEX);
		}
	}

	Serial.println();
}