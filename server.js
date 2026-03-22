import axios from 'axios';
import querystring from 'querystring';
import express from 'express';
import cors from 'cors';
import https from 'https';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseHTMLToXML } from './scripts/parse-html-to-xml.js';
import { readLabelFile } from './scripts/read-label-file.js';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());
const port = 63425;

const DEFAULT_ROOM = 'roomA';
const DEFAULT_450_ENDPOINT = 'https://127.0.0.1:41951';
const DEFAULT_450_PROTOCOL = 'dymo-http';
const DEFAULT_550_PROTOCOL = 'dymo-http';
const DEFAULT_NETWORK_PORT = 41951;
const DEFAULT_NETWORK_RETRIES = 1;
const DEFAULT_NETWORK_TIMEOUT_MS = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, './public')));

const networkFilePath = path.join(__dirname, 'secrets/network.json');
let activeRoom = DEFAULT_ROOM;
let roomConfig = null;
let legacyNetworkHost = '127.0.0.1';
let probeStatus = {
    protocol: null,
    attempted: [],
    success: false,
    error: null,
};

function buildStructuredElements(fields = {}) {
    const lines = [];
    const knownOrder = ['name', 'artnum', 'num_meters', 'width'];

    for (const key of knownOrder) {
        const value = fields[key];
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ''
        ) {
            lines.push(`${key}: ${String(value).trim()}`);
        }
    }

    for (const [key, value] of Object.entries(fields)) {
        if (knownOrder.includes(key)) {
            continue;
        }
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ''
        ) {
            lines.push(`${key}: ${String(value).trim()}`);
        }
    }

    if (lines.length === 0) {
        lines.push('');
    }

    return lines
        .map((line) =>
            `
<Element>
    <String xml:space="preserve">${line}</String>
    <Attributes>
        <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False" />
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
    </Attributes>
</Element>`.trim(),
        )
        .join('');
}

function normalizeNetworkData(jsonData) {
    const legacyIp = jsonData['ip-adress'] || '127.0.0.1';
    const parsed = {
        roomA: {
            id: 'roomA',
            label: 'Room A (USB 450)',
            protocol: DEFAULT_450_PROTOCOL,
            endpoint: DEFAULT_450_ENDPOINT,
            timeoutMs: DEFAULT_NETWORK_TIMEOUT_MS,
            retries: DEFAULT_NETWORK_RETRIES,
            printers: {
                liten: {
                    name: 'DYMO Etikett 1',
                    templatePrefix: 'legacy',
                },
                stor: {
                    name: 'DYMO Etikett 2',
                    templatePrefix: 'legacy',
                },
            },
        },
        roomB: {
            id: 'roomB',
            label: 'Room B (Network 550)',
            protocol:
                jsonData.roomB?.protocol ||
                jsonData.protocol ||
                DEFAULT_550_PROTOCOL,
            endpoint:
                jsonData.roomB?.endpoint ||
                `https://${jsonData.roomB?.ip || legacyIp}:${jsonData.roomB?.port || DEFAULT_NETWORK_PORT}`,
            timeoutMs: jsonData.roomB?.timeoutMs || DEFAULT_NETWORK_TIMEOUT_MS,
            retries: jsonData.roomB?.retries || DEFAULT_NETWORK_RETRIES,
            printers: {
                liten: {
                    name:
                        jsonData.roomB?.printers?.liten?.name ||
                        jsonData.roomB?.printerName ||
                        'DYMO 550 5XL',
                    templatePrefix:
                        jsonData.roomB?.printers?.liten?.templatePrefix ||
                        'legacy',
                },
                stor: {
                    name:
                        jsonData.roomB?.printers?.stor?.name ||
                        jsonData.roomB?.printerName ||
                        'DYMO 550 5XL',
                    templatePrefix:
                        jsonData.roomB?.printers?.stor?.templatePrefix ||
                        'legacy',
                },
            },
        },
    };

    if (jsonData.roomA) {
        parsed.roomA = {
            ...parsed.roomA,
            ...jsonData.roomA,
            printers: {
                liten: {
                    ...parsed.roomA.printers.liten,
                    ...jsonData.roomA.printers?.liten,
                },
                stor: {
                    ...parsed.roomA.printers.stor,
                    ...jsonData.roomA.printers?.stor,
                },
            },
        };
    }

    if (jsonData.roomB) {
        parsed.roomB = {
            ...parsed.roomB,
            ...jsonData.roomB,
            printers: {
                liten: {
                    ...parsed.roomB.printers.liten,
                    ...jsonData.roomB.printers?.liten,
                },
                stor: {
                    ...parsed.roomB.printers.stor,
                    ...jsonData.roomB.printers?.stor,
                },
            },
        };
    }

    return {
        rooms: parsed,
        activeRoom: jsonData.activeRoom || DEFAULT_ROOM,
    };
}

async function readNetworkFile() {
    try {
        const data = await fs.promises.readFile(networkFilePath, 'utf8');
        const jsonData = JSON.parse(data);
        legacyNetworkHost = jsonData['ip-adress'] || '127.0.0.1';
        const normalized = normalizeNetworkData(jsonData);
        roomConfig = normalized.rooms;
        activeRoom = normalized.activeRoom;
    } catch (err) {
        console.error('Error reading network file:', err);
        roomConfig = normalizeNetworkData({}).rooms;
        activeRoom = DEFAULT_ROOM;
    }
}

function ensureRoomConfig() {
    if (!roomConfig) {
        roomConfig = normalizeNetworkData({}).rooms;
    }
}

function resolveRoom(reqRoom) {
    ensureRoomConfig();
    const selectedRoom = reqRoom || activeRoom || DEFAULT_ROOM;
    if (!roomConfig[selectedRoom]) {
        throw new Error(`Unknown room: ${selectedRoom}`);
    }
    return selectedRoom;
}

function resolveRoute(reqData) {
    const room = resolveRoom(reqData.room);
    const roomSettings = roomConfig[room];
    const size = reqData.label_size === 'stor' ? 'stor' : 'liten';
    const printer = roomSettings.printers?.[size];

    if (!printer?.name) {
        throw new Error(`No printer mapping for ${room}/${size}`);
    }

    return {
        room,
        size,
        protocol: roomSettings.protocol || DEFAULT_450_PROTOCOL,
        endpoint: roomSettings.endpoint || DEFAULT_450_ENDPOINT,
        timeoutMs: roomSettings.timeoutMs || DEFAULT_NETWORK_TIMEOUT_MS,
        retries: roomSettings.retries || DEFAULT_NETWORK_RETRIES,
        printerName: printer.name,
        templatePrefix: printer.templatePrefix || 'legacy',
    };
}

function resolveLabelTemplatePath(route, labelSize, ifBarcode) {
    const routePath = path.join(
        __dirname,
        'labels',
        route.templatePrefix,
        `${labelSize}-${ifBarcode}.label`,
    );
    if (fs.existsSync(routePath)) {
        return routePath;
    }

    return path.join(__dirname, 'labels', `${labelSize}-${ifBarcode}.label`);
}

async function tryDymoHttp(endpoint) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    await axios.get(`${endpoint}/DYMO/DLS/Printing/StatusConnected`, {
        httpsAgent: agent,
        timeout: 1500,
    });
    return 'dymo-http';
}

async function tryRawSocket(endpoint) {
    const url = new URL(endpoint);
    const host = url.hostname;
    const portValue = Number(url.port || 9100);

    await new Promise((resolve, reject) => {
        const socket = net.createConnection(
            { host, port: portValue, timeout: 1500 },
            () => {
                socket.end();
                resolve();
            },
        );
        socket.on('error', reject);
        socket.on('timeout', () => {
            socket.destroy(new Error('Socket timeout'));
        });
    });

    return 'raw';
}

async function probeRoomBProtocol() {
    ensureRoomConfig();
    const roomB = roomConfig.roomB;
    probeStatus = {
        protocol: null,
        attempted: [],
        success: false,
        error: null,
    };

    if (!roomB?.endpoint) {
        probeStatus.error = 'No endpoint configured';
        return;
    }

    const candidates =
        roomB.protocol === 'auto'
            ? ['dymo-http', 'raw']
            : [roomB.protocol || DEFAULT_550_PROTOCOL];

    for (const candidate of candidates) {
        try {
            probeStatus.attempted.push(candidate);
            if (candidate === 'dymo-http') {
                await tryDymoHttp(roomB.endpoint);
            } else if (candidate === 'raw') {
                await tryRawSocket(roomB.endpoint);
            } else {
                continue;
            }
            roomConfig.roomB.protocol = candidate;
            probeStatus.protocol = candidate;
            probeStatus.success = true;
            return;
        } catch (error) {
            probeStatus.error = error.message;
        }
    }
}

app.get('/network', (req, res) => {
    res.send(legacyNetworkHost);
});

app.get('/config/rooms', (req, res) => {
    ensureRoomConfig();
    res.json({
        activeRoom,
        rooms: roomConfig,
        probeStatus,
    });
});

app.post('/config/room', (req, res) => {
    try {
        const requested = req.body?.room;
        if (!requested || !roomConfig[requested]) {
            return res.status(400).json({ error: 'Invalid room' });
        }
        activeRoom = requested;
        return res.json({ activeRoom });
    } catch (error) {
        return res.status(500).json({ error: 'Could not update room' });
    }
});

async function labelStringManipulation(
    route,
    label_size,
    if_barcode,
    text,
    alignment,
    barcode,
) {
    const filePath = resolveLabelTemplatePath(route, label_size, if_barcode);
    return await readLabelFile(filePath, text, alignment, barcode);
}

async function sendPrintOperation(route, operation, payload) {
    if (route.protocol === 'raw') {
        if (operation !== 'PrintLabel') {
            throw new Error('Preview not supported on raw transport');
        }
        const endpoint = new URL(route.endpoint);
        const portValue = Number(endpoint.port || 9100);

        await new Promise((resolve, reject) => {
            const socket = net.createConnection(
                {
                    host: endpoint.hostname,
                    port: portValue,
                    timeout: route.timeoutMs,
                },
                () => {
                    socket.write(payload);
                    socket.end();
                    resolve();
                },
            );
            socket.on('error', reject);
            socket.on('timeout', () => {
                socket.destroy(new Error('Socket timeout'));
            });
        });

        return '';
    }

    const agent = new https.Agent({
        rejectUnauthorized: false,
    });

    const response = await axios.post(
        `${route.endpoint}/DYMO/DLS/Printing/${operation}`,
        payload,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            httpsAgent: agent,
            timeout: route.timeoutMs,
        },
    );

    return response.data;
}

async function sendWithRetries(route, operation, payload) {
    const attempts = Math.max(1, Number(route.retries || 1));
    let lastError = null;

    for (let i = 0; i < attempts; i += 1) {
        try {
            return await sendPrintOperation(route, operation, payload);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Print operation failed');
}

async function previewLabel(reqData, payloadBuilder) {
    const route = resolveRoute(reqData);
    const payload = payloadBuilder();
    const labelXml = await labelStringManipulation(
        route,
        reqData.label_size,
        reqData.if_barcode,
        payload.xml,
        payload.alignment,
        reqData.barcode,
    );

    const label = `printerName=&renderParamsXml=&labelXml=${encodeURIComponent(labelXml)}&labelSetXml=`;

    return sendWithRetries(route, 'RenderLabel', label);
}

async function printLabel(reqData, payloadBuilder) {
    const route = resolveRoute(reqData);
    const payload = payloadBuilder();
    const copies = reqData.copies || 1;
    const labelXml = await labelStringManipulation(
        route,
        reqData.label_size,
        reqData.if_barcode,
        payload.xml,
        payload.alignment,
        reqData.barcode,
    );

    const printParamsXml = `<LabelWriterPrintParams><Copies>${copies}</Copies><PrintQuality>Text</PrintQuality></LabelWriterPrintParams>`;
    if (route.protocol === 'raw') {
        return sendWithRetries(route, 'PrintLabel', labelXml);
    }

    const info = {
        printerName: route.printerName,
        printParamsXml,
        labelXml,
        labelSetXml: '',
    };

    const formattedData = querystring.stringify(info);
    return sendWithRetries(route, 'PrintLabel', formattedData);
}

function buildClassicPayload(reqData) {
    const result = parseHTMLToXML(reqData.text || '');
    return {
        xml: result.xml,
        alignment: result.alignment,
    };
}

function buildStructuredPayload(reqData) {
    const fields = reqData.fields || {
        name: reqData.name,
        artnum: reqData.artnum,
        num_meters: reqData.num_meters,
        width: reqData.width,
    };
    return {
        xml: buildStructuredElements(fields),
        alignment: 'Left',
    };
}

function forceStructuredRoom(reqBody) {
    ensureRoomConfig();
    if (!roomConfig.roomB) {
        throw new Error('roomB configuration missing for structured printing');
    }

    return {
        ...reqBody,
        room: 'roomB',
    };
}

app.get('/print', async (req, res) => {
    try {
        await printLabel(req.query, () => buildClassicPayload(req.query));
        res.sendStatus(200);
    } catch (error) {
        const status = String(error.message).includes('Unknown room')
            ? 400
            : 500;
        res.status(status).json({ error: error.message });
    }
});

app.get('/preview', async (req, res) => {
    try {
        const label = await previewLabel(req.query, () =>
            buildClassicPayload(req.query),
        );
        res.send(label);
    } catch (error) {
        const status = String(error.message).includes('Unknown room')
            ? 400
            : 500;
        res.status(status).json({ error: error.message });
    }
});

app.post('/print-structured', async (req, res) => {
    try {
        const payload = forceStructuredRoom({
            ...req.body,
            label_size: req.body.label_size || 'stor',
            if_barcode: req.body.if_barcode || 'false',
            copies: req.body.copies || 1,
            barcode: req.body.barcode || '',
        });
        await printLabel(payload, () => buildStructuredPayload(payload));
        res.sendStatus(200);
    } catch (error) {
        const status =
            String(error.message).includes('Unknown room') ||
            String(error.message).includes('configuration missing')
                ? 400
                : 500;
        res.status(status).json({ error: error.message });
    }
});

app.post('/preview-structured', async (req, res) => {
    try {
        const payload = forceStructuredRoom({
            ...req.body,
            label_size: req.body.label_size || 'stor',
            if_barcode: req.body.if_barcode || 'false',
            barcode: req.body.barcode || '',
        });
        const label = await previewLabel(payload, () =>
            buildStructuredPayload(payload),
        );
        res.send(label);
    } catch (error) {
        const status =
            String(error.message).includes('Unknown room') ||
            String(error.message).includes('configuration missing')
                ? 400
                : 500;
        res.status(status).json({ error: error.message });
    }
});

app.get('/diagnostics', (req, res) => {
    ensureRoomConfig();
    res.json({
        activeRoom,
        probeStatus,
        rooms: roomConfig,
    });
});

readNetworkFile().then(async () => {
    await probeRoomBProtocol();
    app.listen(port, '0.0.0.0', () => {
        const roomAEndpoint =
            roomConfig?.roomA?.endpoint || DEFAULT_450_ENDPOINT;
        const host = new URL(roomAEndpoint).hostname;
        console.log(`Server listening at http://0.0.0.0:${port}`);
        console.log(`Access the server at http://${host}:${port}`);
    });
});
