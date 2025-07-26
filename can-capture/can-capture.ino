#include <Adafruit_MCP2515.h>

#define CS_PIN PIN_CAN_CS
#define CAN_BAUDRATE 500000

Adafruit_MCP2515 mcp(CS_PIN);

void setup()
{
	Serial.begin(115200);
	while (!Serial) delay (10);

	if (!mcp.begin(CAN_BAUDRATE))
	{
		Serial.println("Error initializing MCP2515.");
		
		while (1)
			delay(1000); // indicate failure
	}
	
	Serial.println("Opening CAN in listen only mode...");
}

void loop()
{
	int packetSize = mcp.parsePacket();

	if (packetSize)
	{
		unsigned long id = mcp.packetId();
		bool extended = mcp.packetExtended();
		bool rtr = mcp.packetRtr();
		uint8_t len = mcp.packetDlc();
		float ts = millis() / 1000.0;

		// choose one:
		logCandump(ts, id, extended, rtr, len);
		//logASC(ts, id, extended, rtr, len);
	}
}

void logCandump(float ts, unsigned long id, bool extended, bool rtr, uint8_t len)
{
	Serial.printf("(%.6f) vcan0 ", ts);

	if (extended)
	{
		Serial.print(id, HEX); // will be up to 8 digits
	}
	else
	{
		if (id < 0x100) Serial.print("0"); // pad to 3 digits
		if (id < 0x10) Serial.print("0");
		Serial.print(id, HEX); // will be 3 digits
	}

	Serial.print("#");

	if (!rtr)
	{
		for (int i = 0; i < len; i++)
		{
			uint8_t b = mcp.read();
			if (b < 0x10) Serial.print("0");
			Serial.print(b, HEX);
		}
	}

	Serial.println();
}

void logASC(float ts, unsigned long id, bool extended, bool rtr, uint8_t len)
{
	// ASC format: timestamp channel dir type dlc data...
	Serial.printf(" %.6f 1  Rx        %c %d ", ts, rtr ? 'r' : 'd', len);

	if (!rtr)
	{
		for (int i = 0; i < len; i++)
		{
			uint8_t b = mcp.read();
			if (b < 0x10) Serial.print("0");
			Serial.print(b, HEX);
			Serial.print(" ");
		}
	}

	Serial.println();
}
