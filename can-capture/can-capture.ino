#include <Adafruit_MCP2515.h>

#define CS_PIN PIN_CAN_CS
#define CAN_BAUDRATE 500000

Adafruit_MCP2515 mcp(CS_PIN);

const int LED_BLINK_INTERVAL = 50; // min gap between blinks
const int LED_ON_DURATION = 5;     // how long to keep LED on
const int LED_PIN = LED_BUILTIN; // or e.g. 13
unsigned long ledOffTime = 0;
unsigned long lastBlink = 0;
bool ledOn = false;


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