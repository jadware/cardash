#include <SPI.h>
#include <mcp_can.h>

const int CAN_CS = 17;
MCP_CAN CAN(CAN_CS);

const int LED_PIN = LED_BUILTIN; // or e.g. 13
unsigned long ledOffTime = 0;
bool ledOn = false;

float playbackSpeed = 1.0f; // 1.0 = normal, 0.5 = 2x faster, 2.0 = half speed
float lastTs = 0;
int currentIndex = 0;

void setup()
{
	pinMode(LED_PIN, OUTPUT);
	digitalWrite(LED_PIN, HIGH);
	delay(500); // startup pulse
	digitalWrite(LED_PIN, LOW);

	Serial.begin(115200);
	while (!Serial);

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
	if (ledOn && millis() >= ledOffTime)
	{
		digitalWrite(LED_PIN, LOW);
		ledOn = false;
	}

	const char* line = candump_log[currentIndex];
	
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
	digitalWrite(LED_PIN, HIGH);
	ledOffTime = millis() + 10;
	ledOn = true;
	
	String l(line);

	int tsStart = l.indexOf('(') + 1;
	int tsEnd = l.indexOf(')');
	float ts = l.substring(tsStart, tsEnd).toFloat();

	int idStart = l.indexOf(' ', tsEnd + 2) + 1;
	int idEnd = l.indexOf('[', idStart) - 1;
	String idStr = l.substring(idStart, idEnd);
	unsigned long id = strtoul(idStr.c_str(), NULL, 16);

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

const char* candump_log[] = {
	"(0.000001) can0   123   [2] 11 22",
	"(0.010000) can0   321   [3] AA BB CC",
	"(0.030000) can0   456   [8] 01 02 03 04 05 06 07 08",
	nullptr
};
