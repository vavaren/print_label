// htmlparser.js
import he from 'he';

// Function to parse the HTML and transform to the desired XML format
export function parseHTMLToXML(encodedText) {
    // Decode the URL-encoded string
    const decodedText = decodeURIComponent(encodedText);
    const xmlParts = [];
    const tagPattern = /<\/?([a-zA-Z]+)[^>]*>/g;
    let lastIndex = 0;
    let match;
    let openTags = [];
    let addNewLine = false;
    let lastAlignment =  getAlignment(decodedText); // Default alignment

    while ((match = tagPattern.exec(decodedText)) !== null) {
        const [fullMatch, tagName] = match;
        const text = decodedText.slice(lastIndex, match.index);
        const isParagraph = tagName === 'p';
        lastIndex = tagPattern.lastIndex;


        if (text.trim()) {
            xmlParts.push(createXMLElement(text, openTags, addNewLine));
            addNewLine = false;  // Reset addNewLine after processing the text
        }

        if (fullMatch.startsWith('</')) {
            openTags.pop();
            if (isParagraph) {
                addNewLine = true;  // Set flag to add newline before the next paragraph content
            }
        } else {
            openTags.push(tagName);
        }
    }

    const remainingText = decodedText.slice(lastIndex);
    if (remainingText.trim()) {
        xmlParts.push(createXMLElement(remainingText, openTags, addNewLine));
    }

    return {
        xml: xmlParts.join(''),
        alignment: lastAlignment
    };
}

function createXMLElement(content, tags, addNewLine) {
    const isBold = tags.includes('strong');
    const isItalic = tags.includes('em');
    const isUnderline = tags.includes('u');

    const textContent = (addNewLine ? '\n' : '') + he.decode(content);

    return `
<Element>
    <String xml:space="preserve">${textContent}</String>
    ${createAttributesElement(isBold, isItalic, isUnderline)}
</Element>`.trim();
}

function createAttributesElement(isBold, isItalic, isUnderline) {
    return `
<Attributes>
    <Font Family="Arial" Size="12" Bold="${isBold ? 'True' : 'False'}" Italic="${isItalic ? 'True' : 'False'}" Underline="${isUnderline ? 'True' : 'False'}" Strikeout="False" />
    <ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
</Attributes>`.trim();
}

function getAlignment(fullMatch) {
    if (fullMatch.includes('ql-align-center')) {
        return 'Center';
    } else if (fullMatch.includes('ql-align-right')) {
        return 'Right';
    }
    return 'Left';
}

// // Example usage
// const encodedText = "%3Cp%3E%3Cstrong%3EJulpaket%201%2C%20b%C3%A4ddset%20Steninge150x210%20cm%2C%20m%C3%B6rkgr%C3%B6n%3C%2Fstrong%3E%3C%2Fp%3E%3Cp%20class%3D%22ql-align-center%22%3E%3Cstrong%3EJulpaket%201%2C%20b%C3%A4ddset%20Steninge150x210%20cm%2C%20m%C3%B6rkgr%C3%B6n%3C%2Fstrong%3E%3C%2Fp%3E%3Cp%20class%3D%22ql-align-right%22%3E%3Cstrong%3EJulpaket%201%2C%20b%C3%A4ddset%20Steninge150x210%20cm%2C%20m%C3%B6rkgr%C3%B6n%3C%2Fstrong%3E%3C%2Fp%3E";
// const result = parseHTMLToXML(encodedText);
// console.log('Decoded URI Component:', decodeURIComponent(encodedText));
// console.log('XML String:', result.xml);
// console.log('Alignment:', result.alignment);
