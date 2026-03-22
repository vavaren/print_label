const port = 63425;

let host = window.location.hostname || '127.0.0.1';
let previewTimeout;
let hot;
let performSearch;

const FORCED_ROOM = 'roomB';

function setStatus(text, isError = false) {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = text;
    statusEl.classList.toggle('text-red-200', isError);
    statusEl.classList.toggle('text-slate-100', !isError);
}

fetch('/network')
    .then((response) => response.text())
    .then((data) => {
        if (data) {
            host = data;
        }
    })
    .catch((err) => console.error('Error fetching network file:', err));

function getPayload() {
    return {
        room: FORCED_ROOM,
        label_size: document.getElementById('input-size').value,
        if_barcode: document.getElementById('if-barcode').value,
        copies: Number(document.getElementById('input-copies').value || 1),
        barcode: document.getElementById('input-barcode').value || '',
        fields: {
            name: document.getElementById('field-name').value || '',
            artnum: document.getElementById('field-artnum').value || '',
            num_meters: document.getElementById('field-num-meters').value || '',
            width: document.getElementById('field-width').value || '',
        },
    };
}

function websitePrint() {
    const button = document.getElementById('print-button');
    button.classList.remove('bg-slate-800');
    button.classList.add('bg-slate-700');

    fetch(`http://${host}:${port}/print-structured`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(getPayload()),
    })
        .then(async (response) => {
            if (!response.ok) {
                const errorData = await response
                    .json()
                    .catch(() => ({ error: 'Print failed' }));
                throw new Error(errorData.error || 'Print failed');
            }

            setStatus('Utskrift skickad.');
            button.classList.remove('bg-slate-700');
            button.classList.add('bg-green-500');
            setTimeout(() => {
                button.classList.remove('bg-green-500');
                button.classList.add('bg-slate-800');
            }, 2000);
        })
        .catch((error) => {
            setStatus(error.message, true);
            button.classList.remove('bg-slate-700');
            button.classList.add('bg-red-500');
            setTimeout(() => {
                button.classList.remove('bg-red-500');
                button.classList.add('bg-slate-800');
            }, 2000);
        })
        .finally(() => {
            const copiesInput = document.getElementById('input-copies');
            copiesInput.value = '1';
            websitePreview();
        });
}

function websitePreview() {
    clearTimeout(previewTimeout);

    previewTimeout = setTimeout(() => {
        fetch(`http://${host}:${port}/preview-structured`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(getPayload()),
        })
            .then(async (response) => {
                if (!response.ok) {
                    const errorData = await response
                        .json()
                        .catch(() => ({ error: 'Preview failed' }));
                    throw new Error(errorData.error || 'Preview failed');
                }
                return response.text();
            })
            .then((base64Image) => {
                const imageSrc = `data:image/png;base64,${base64Image}`;
                document.getElementById('preview-label').src = imageSrc;
                setStatus('Förhandsvisning uppdaterad.');
            })
            .catch((error) => setStatus(error.message, true));
    }, 300);
}

function displayDataInTable(data) {
    const container = document.getElementById('excel-data');
    const originalData = [...data];

    hot = new Handsontable(container, {
        licenseKey: 'non-commercial-and-evaluation',
        data,
        rowHeaders: true,
        colHeaders: true,
        filters: true,
        dropdownMenu: true,
        search: true,
        autoColumnSize: true,
        readOnly: true,
        selectionMode: 'single',
        tabNavigation: false,
    });

    performSearch = (query) => {
        let dataToLoad = [originalData[0]];
        const columnNames = originalData[0];

        if (query) {
            const selectedColumns = [];
            if (document.getElementById('search-benamning').checked)
                selectedColumns.push('Benämning');
            if (document.getElementById('search-artikelnummer').checked)
                selectedColumns.push('Artikelnummer');
            if (document.getElementById('search-artikelgrupp').checked)
                selectedColumns.push('Artikelgrupp');
            if (document.getElementById('search-kortnamn').checked)
                selectedColumns.push('Kortnamn');
            if (document.getElementById('search-barcode').checked)
                selectedColumns.push('Streckkod');

            const columnIndices = selectedColumns
                .map((col) => columnNames.indexOf(col))
                .filter((index) => index !== -1);

            const searchData = originalData.slice(1).filter((row) => {
                return columnIndices.length > 0
                    ? columnIndices.some(
                          (index) =>
                              row[index] &&
                              row[index]
                                  .toString()
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                      )
                    : row.some(
                          (cell) =>
                              cell &&
                              cell
                                  .toString()
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                      );
            });

            dataToLoad =
                searchData.length > 0
                    ? dataToLoad.concat(searchData)
                    : dataToLoad.concat([
                          new Array(originalData[0].length).fill('No results'),
                      ]);
        } else {
            dataToLoad = originalData;
        }

        hot.loadData(dataToLoad);
    };

    document
        .getElementById('global-search')
        .addEventListener('input', (event) => {
            performSearch(event.target.value);
        });

    const checkboxes = document.querySelectorAll(
        '#search-container input[type="checkbox"]',
    );
    checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            performSearch(document.getElementById('global-search').value);
        });
    });

    document.addEventListener('dblclick', (event) => {
        if (!event.target.closest('.handsontable')) {
            return;
        }

        const selected = hot.getSelectedLast();
        if (!selected) {
            return;
        }

        const [startRow] = selected;
        const rowData = hot.getDataAtRow(startRow);
        const columnNames = originalData[0];

        const benamningIndex = columnNames.indexOf('Benämning');
        const artikelnummerIndex = columnNames.indexOf('Artikelnummer');
        const streckkodIndex = columnNames.indexOf('Streckkod');
        const breddIndex = columnNames.findIndex((col) =>
            String(col).toLowerCase().includes('bredd'),
        );

        document.getElementById('field-name').value =
            benamningIndex !== -1 ? rowData[benamningIndex] || '' : '';
        document.getElementById('field-artnum').value =
            artikelnummerIndex !== -1 ? rowData[artikelnummerIndex] || '' : '';
        document.getElementById('input-barcode').value =
            streckkodIndex !== -1 && rowData[streckkodIndex]
                ? String(rowData[streckkodIndex]).slice(0, 12)
                : '';
        document.getElementById('field-width').value =
            breddIndex !== -1 ? rowData[breddIndex] || '' : '';

        websitePreview();
    });
}

function handleBarcodeReading(barcodeData) {
    if (barcodeData.length !== 13 || typeof barcodeData !== 'string') {
        return;
    }

    barcodeData = barcodeData.slice(0, -1);
    const artnum = barcodeData.slice(-4);

    const data = hot.getData();
    const headers = data[0];
    const benamningIndex = headers.indexOf('Benämning');
    const artikelnummerIndex = headers.indexOf('Artikelnummer');
    const streckkodIndex = headers.indexOf('Streckkod');

    if (
        artikelnummerIndex === -1 ||
        benamningIndex === -1 ||
        streckkodIndex === -1
    ) {
        return;
    }

    for (let i = 1; i < data.length; i += 1) {
        const row = data[i];
        if (row[artikelnummerIndex]?.endsWith(artnum)) {
            document.getElementById('field-name').value =
                row[benamningIndex] || '';
            document.getElementById('field-artnum').value =
                row[artikelnummerIndex] || '';
            document.getElementById('input-barcode').value = barcodeData;
            document.getElementById('global-search').value = barcodeData;
            document.getElementById('search-barcode').checked = true;
            performSearch(barcodeData);
            websitePreview();
            return;
        }
    }
}

const barcodeReadingCheckbox = document.getElementById('barcode-reading');
if (barcodeReadingCheckbox) {
    barcodeReadingCheckbox.addEventListener('change', (event) => {
        if (event.target.checked) {
            document.addEventListener('keydown', handleGlobalBarcodeInput);
        } else {
            document.removeEventListener('keydown', handleGlobalBarcodeInput);
        }
    });
}

let barcodeBuffer = '';
let barcodeTimeout;
function handleGlobalBarcodeInput(event) {
    if (event.key.length === 1) {
        barcodeBuffer += event.key;
        clearTimeout(barcodeTimeout);
        barcodeTimeout = setTimeout(() => {
            handleBarcodeReading(barcodeBuffer);
            barcodeBuffer = '';
        }, 50);
    }
}

fetch('./Visma-artiklar-03012025.xlsx')
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        displayDataInTable(data);
    });

const previewFieldIds = [
    'field-name',
    'field-artnum',
    'field-num-meters',
    'field-width',
    'input-barcode',
    'input-size',
    'if-barcode',
    'input-copies',
];

previewFieldIds.forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener('input', websitePreview);
});

document.getElementById('print-button').addEventListener('click', websitePrint);
document.getElementById('print-button').addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        event.preventDefault();
    }
});

websitePreview();
