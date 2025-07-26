#include <SPI.h>
#include <mcp_can.h>

const int SPI_CS_PIN = 17;
const int INT_PIN = 16;
MCP_CAN CAN(SPI_CS_PIN);

const int LED_PIN = LED_BUILTIN; // or e.g. 13
unsigned long ledOffTime = 0;
bool ledOn = false;


void setup()
{
	pinMode(LED_PIN, OUTPUT);
	digitalWrite(LED_PIN, HIGH);
	delay(500); // startup pulse
	digitalWrite(LED_PIN, LOW);

	Serial.begin(115200);
	while (!Serial);

	while (CAN_OK != CAN.begin(MCP_ANY, CAN_500KBPS, MCP_8MHZ))
	{
		delay(100);
	}

	CAN.setMode(MCP_NORMAL);
	pinMode(INT_PIN, INPUT);
}

void loop()
{
	if (!digitalRead(INT_PIN))
	{
		byte len = 0;
		byte buf[8];
		unsigned long id = 0;

		if (CAN.readMsgBuf(&id, &len, buf) == CAN_OK)
		{
			digitalWrite(LED_PIN, HIGH);
			ledOffTime = millis() + 10;
			ledOn = true;

			float ts = millis() / 1000.0;

			Serial.print("("); Serial.print(ts, 6); Serial.print(") ");
			Serial.print("can0  ");
			Serial.print((id < 0x100 ? "  " : (id < 0x1000 ? " " : ""))); // pad to 3-char field
			Serial.print(id, HEX); Serial.print("   [");

			for (byte i = 0; i < len; i++)
			{
				if (buf[i] < 0x10) Serial.print("0");
				Serial.print(buf[i], HEX); Serial.print(" ");
			}

			Serial.println();
		}
	}

	if (ledOn && millis() >= ledOffTime)
	{
		digitalWrite(LED_PIN, LOW);
		ledOn = false;
	}
}
