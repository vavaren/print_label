import axios from 'axios';
import querystring from 'querystring';
import express from 'express';
import cors from 'cors';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseHTMLToXML } from './parse-html-to-xml.js';
import { readLabelFile } from './read-label-file.js';
import fs from 'fs'; // Add this line

const app = express();
app.use(cors());
const port = 63425;

const NAME_SMALL_PRINTER = "DYMO Etikett 1";
const NAME_LARGE_PRINTER = "DYMO Etikett 2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, './public')));

// Read network.json file at runtime and store its content in a variable
const networkFilePath = path.join(__dirname, 'secrets/network.json');
let networkData = '';

async function readNetworkFile() {
    try {
        const data = await fs.promises.readFile(networkFilePath, 'utf8');
        const jsonData = JSON.parse(data);
        networkData = jsonData["ip-adress"];
    } catch (err) {
        console.error('Error reading network file:', err);
    }
}

app.get('/network', (req, res) => {
    if (networkData) {
        res.send(networkData);
    } else {
        res.status(500).send('Error reading network data');
    }
});

async function labelStringManipulation(label_size, if_barcode, text, alignment, barcode) {
    const filePath = path.join(__dirname, `./labels/${label_size}-${if_barcode}.label`);
    return await readLabelFile(filePath, text, alignment, barcode);
}

// Function to preview the label
async function previewLabel(req) {
    const result = parseHTMLToXML(req.text);
    const labelXml = await labelStringManipulation(req.label_size, req.if_barcode, result.xml, result.alignment, req.barcode);

    let printerName;
    if (req.label_size === "stor") {
        printerName = NAME_LARGE_PRINTER;
    } else {
        printerName = NAME_SMALL_PRINTER;
    }

    const label = `printerName=&renderParamsXml=&labelXml=${encodeURIComponent(labelXml)}&labelSetXml=`;

    const agent = new https.Agent({
        rejectUnauthorized: false
    });

    try {
        const response = await axios.post(
            'https://127.0.0.1:41951/DYMO/DLS/Printing/RenderLabel',
            label,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                httpsAgent: agent
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error sending preview request:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
    }
}
// Function to print the label
async function printLabel(req) {
    let copies = req.copies || 1;
    const result = parseHTMLToXML(req.text);
    const labelXml = await labelStringManipulation(req.label_size, req.if_barcode, result.xml, result.alignment, req.barcode);

    let printerName;
    if (req.label_size === "stor") {
        printerName = NAME_LARGE_PRINTER;
    } else {
        printerName = NAME_SMALL_PRINTER;
    }

    const info = {
        printerName: printerName,
        printParamsXml: `<LabelWriterPrintParams><Copies>${copies}</Copies><PrintQuality>Text</PrintQuality></LabelWriterPrintParams>`,
        labelXml: labelXml,
        labelSetXml: '',
    };
    const formattedData = querystring.stringify(info);

    const agent = new https.Agent({
        rejectUnauthorized: false
    });

    try {
        const response = await axios.post(
            'https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel',
            formattedData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                httpsAgent: agent
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error sending print request:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
        throw new Error('Error sending print request');
    }
}

app.get('/print', async (req, res) => {
    try {
        await printLabel(req.query);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error printing label:', error.message);
        res.status(500).send('Error printing label');
    }
});

app.get('/preview', async (req, res) => {
    try {
        const label = await previewLabel(req.query);
        res.send(label);
    } catch (error) {
        res.status(500).send('Error generating preview');
    }
});

readNetworkFile().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server listening at http://0.0.0.0:${port}`);
        console.log(`Access the server at http://${networkData}:${port}`);
    });
});