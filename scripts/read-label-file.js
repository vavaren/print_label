import fs from 'fs';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { fileURLToPath } from 'url';

// Get the current directory of the module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read the .label file
function readLabelTemplate(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

// Function to parse multiple XML elements string to object
async function parseMultipleElements(xmlString) {
    // Wrap the elements in a temporary root element to parse
    const wrappedXmlString = `<root>${xmlString}</root>`;
    const result = await parseStringPromise(wrappedXmlString);
    return result.root.Element;
}

// Function to update the label XML with new text, alignment, and barcode
export async function readLabelFile(filePath, newText, newAlignment, newBarcode) {
    const xmlContent = readLabelTemplate(filePath);

    // Parse the XML content
    const xmlDoc = await parseStringPromise(xmlContent);

    // Parse the newText into multiple XML elements
    const newTextElements = await parseMultipleElements(newText);

    // Find and update the TextObject and BarcodeObject nodes
    const textObject = xmlDoc.DieCutLabel.ObjectInfo.find(obj => obj.TextObject);
    const barcodeObject = xmlDoc.DieCutLabel.ObjectInfo.find(obj => obj.BarcodeObject);

    if (textObject) {
        textObject.TextObject[0].HorizontalAlignment = [newAlignment];
        textObject.TextObject[0].StyledText = [{ Element: newTextElements }];
    }

    if (barcodeObject && newBarcode) {
        barcodeObject.BarcodeObject[0].Text = [newBarcode];
    }

    // Build the updated XML
    const builder = new Builder();
    const updatedXML = builder.buildObject(xmlDoc);

    return updatedXML;
}
