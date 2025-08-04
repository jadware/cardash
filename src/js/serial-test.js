import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../index.scss';
import { openSerialOutput, writeLine } from './serial-out.js';

let connected = false;
const connectBtn = document.getElementById('connect');
const sendForm = document.getElementById('send-form');
const idInput = document.getElementById('can-id');
const dataInputs = document.querySelectorAll('.data-byte');

connectBtn.addEventListener('click', async () => {
        try {
                await openSerialOutput();
                connected = true;
                connectBtn.disabled = true;
        } catch (err) {
                console.error('Failed to open serial port', err);
        }
});

sendForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!connected) return;

        const id = idInput.value.trim().replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        const bytes = Array.from(dataInputs, input =>
                input.value.trim().replace(/[^0-9a-fA-F]/g, '').padStart(2, '0').toUpperCase());
        const dataHex = id + bytes.join('');

        writeLine({ dataHex });
});
