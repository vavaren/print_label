const port = 63425;

let host;

fetch('/network')
    .then(response => response.text())
    .then(data => {
        host = data;
        console.log(`Host: ${host}`);
    })
    .catch(err => console.error('Error fetching network file:', err));


let hot;
let performSearch;
let previewTimeout;
// Initialize Quill editor
var quill = new Quill('#editor-container', {
    theme: 'snow',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline', "strike"], [{ 'align': '' }, { 'align': 'center' }, { 'align': 'right' }]

        ]
    },
    placeholder: 'Namn',
});
quill.root.style.textAlign="center"
quill.format('align', 'center');

function websitePrint() {
    const button = document.querySelector('button[onclick="websitePrint()"]');
    button.classList.remove('bg-slate-800');
    button.classList.add('bg-slate-500');

    const text = encodeURIComponent(quill.root.innerHTML);
    const barcode = encodeURIComponent(document.getElementById('input-barcode').value);
    const copies = encodeURIComponent(document.getElementById('input-copies').value);
    const label_size = encodeURIComponent(document.getElementById('input-size').value);
    const if_barcode = encodeURIComponent(document.getElementById('if-barcode').value);

    fetch(`http://${host}:${port}/print?text=${text}&barcode=${barcode}&label_size=${label_size}&if_barcode=${if_barcode}&copies=${copies}`)
        .then(response => {
            if (response.ok) {
                button.classList.remove('bg-slate-500');
                button.classList.add('bg-green-500');
            } else {
                button.classList.remove('bg-slate-500');
                button.classList.add('bg-red-500');
            }
            setTimeout(() => {
                button.classList.remove('bg-green-500', 'bg-red-500');
                button.classList.add('bg-slate-800');
            }, 2000);
            return response.text();
        })
        .then(data => console.log(data))
        .catch(err => {
            console.error(err);
            button.classList.remove('bg-slate-500');
            button.classList.add('bg-red-500');
            setTimeout(() => {
                button.classList.remove('bg-red-500');
                button.classList.add('bg-slate-800');
            }, 2000);
        });
}
function websitePreview() {
    clearTimeout(previewTimeout); // Clear any existing timeout

    previewTimeout = setTimeout(() => {
        const text = encodeURIComponent(quill.root.innerHTML);
        const barcode = encodeURIComponent(document.getElementById('input-barcode').value);
        const label_size = encodeURIComponent(document.getElementById('input-size').value);
        const if_barcode = encodeURIComponent(document.getElementById('if-barcode').value);

        fetch(`http://${host}:${port}/preview?text=${text}&barcode=${barcode}&label_size=${label_size}&if_barcode=${if_barcode}`)
            .then((response) => response.text()) // Correctly parse the response as text
            .then((base64Image) => {
                const imageSrc = `data:image/png;base64,${base64Image}`;
                document.getElementById('preview-label').src = imageSrc; // Set the base64 image as the source
            })
            .catch((error) => console.error('Error fetching the image:', error));
    }, 300); // Delay preview updates by 300ms
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

function displayDataInTable(data) {
    const container = document.getElementById('excel-data');
    const originalData = [...data];
    hot = new Handsontable(container, {
        licenseKey: "non-commercial-and-evaluation",
        data: data,
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

    // Function to perform a global or column-specific search
    performSearch = (query) => {
        let dataToLoad = [originalData[0]]; // Start with column headers
        const columnNames = originalData[0];

        if (query) {
            const selectedColumns = [];
            if (document.getElementById('search-benamning').checked) selectedColumns.push('Benämning');
            if (document.getElementById('search-artikelnummer').checked) selectedColumns.push('Artikelnummer');
            if (document.getElementById('search-artikelgrupp').checked) selectedColumns.push('Artikelgrupp');
            if (document.getElementById('search-kortnamn').checked) selectedColumns.push('Kortnamn');
            if (document.getElementById('search-barcode').checked) selectedColumns.push('Streckkod');

            const columnIndices = selectedColumns.map(col => columnNames.indexOf(col)).filter(index => index !== -1);

            const searchData = originalData.slice(1).filter((row) => {
                return columnIndices.length > 0
                    ? columnIndices.some(index => row[index] && row[index].toString().toLowerCase().includes(query.toLowerCase()))
                    : row.some(cell => cell && cell.toString().toLowerCase().includes(query.toLowerCase()));
            });

            dataToLoad = searchData.length > 0 ? dataToLoad.concat(searchData) : dataToLoad.concat([new Array(originalData[0].length).fill('No results')]);
        } else {
            dataToLoad = originalData;
        }

        hot.loadData(dataToLoad);
    };

    // Event listener for global search input
    document.getElementById('global-search').addEventListener('input', (event) => {
        performSearch(event.target.value);
    });

    // Event listeners for checkboxes
    const checkboxes = document.querySelectorAll('#search-container input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            performSearch(document.getElementById('global-search').value);
        });
    });

    document.addEventListener('dblclick', (event) => {
        if (event.target.closest('.handsontable')) {
            const selected = hot.getSelectedLast();
            if (!selected) return; // Exit if no selection is found

            const [startRow] = selected;
            const rowData = hot.getDataAtRow(startRow);
            const columnNames = originalData[0]; // Assuming this contains column names

            // Find indices of "benämning" and "streckkod" columns
            const benamningIndex = columnNames.indexOf('Benämning');
            const streckkodIndex = columnNames.indexOf('Streckkod');

            // Retrieve data for "benämning" and "streckkod" from the selected row
            const benamningData = rowData[benamningIndex];
            const streckkodData = rowData[streckkodIndex];

            quill.root.innerHTML = benamningData;
            document.getElementById('input-barcode').value = streckkodData ? streckkodData.slice(0, 12) : '';

            websitePreview();
        }
    });
}

function handleBarcodeReading(barcodeData){
    console.log(barcodeData);

    if (barcodeData.length === 13 && typeof barcodeData === 'string') {
        barcodeData = barcodeData.slice(0, -1); // Remove the last character
        console.log('Updated Barcode Data:', barcodeData);

        const artnum = barcodeData.slice(-4); // Extract the last 4 characters
        console.log('ArtNum:', artnum);

        // Perform a search in the spreadsheet
        const data = hot.getData(); // Use the global `hot` instance
        const headers = data[0];
        const benamningIndex = headers.indexOf('Benämning');
        const artikelnummerIndex = headers.indexOf('Artikelnummer');
        const streckkodIndex = headers.indexOf('Streckkod'); // Add index for Streckkod

        if (artikelnummerIndex !== -1 && benamningIndex !== -1 && streckkodIndex !== -1) {
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (row[artikelnummerIndex]?.endsWith(artnum)) {
                    const benamning = row[benamningIndex];

                    // Write the results into Quill and input-barcode
                    quill.root.innerHTML = benamning || '';
                    document.getElementById('input-barcode').value = barcodeData;

                    // Update search bar and check Streckkod checkbox
                    document.getElementById('global-search').value = barcodeData;
                    document.getElementById('search-barcode').checked = true;

                    console.log('Found Benämning:', benamning);
                    performSearch(barcodeData)
                    return; // Exit once a match is found
                }
            }
            console.warn('No matching row found for ArtNum:', artnum);
        } else {
            console.error('Headers not found in the spreadsheet');
        }
    } else {
        console.error('Invalid barcode data');
        return;
    }
}





// Barcode reading mode toggle
const barcodeReadingCheckbox = document.getElementById('barcode-reading');
barcodeReadingCheckbox.addEventListener('change', (event) => {
    // handleBarcodeReading("7333197048894")
    if (event.target.checked) {
        document.addEventListener('keydown', handleGlobalBarcodeInput);
    } else {
        document.removeEventListener('keydown', handleGlobalBarcodeInput);
    } 
});

let barcodeBuffer = "";
let barcodeTimeout;
function handleGlobalBarcodeInput(event) {
    if (event.key.length === 1) { // Only consider printable characters
        barcodeBuffer += event.key;
        clearTimeout(barcodeTimeout);
        barcodeTimeout = setTimeout(() => {
            handleBarcodeReading(barcodeBuffer); // Call the user-defined function
            barcodeBuffer = "";
        }, 50);
    }
}

// Attach event listeners to the input fields
quill.on('text-change', websitePreview);
document.getElementById('input-barcode').addEventListener('input', websitePreview);
document.getElementById('input-size').addEventListener('input', websitePreview);
document.getElementById('if-barcode').addEventListener('input', websitePreview);