const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 50000;
const MAX_COLUMNS = 256;
const MAX_CELLS = 1000000;

// Return tabular input for the existing broker parser; never evaluate formulas or macros.
export async function readImportFile(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error('Choose a CSV or Excel file smaller than 10 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'csv') return [{name: 'CSV', input: await file.text()}];
  if (!['xls', 'xlsx'].includes(extension)) throw new Error('Choose a .csv, .xls, or .xlsx file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Reject renamed text files rather than letting the spreadsheet reader guess a format.
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const prefix = new TextDecoder().decode(bytes.subarray(0, 4096));
  const htmlOrXml = /<(?:html|table)\b/i.test(prefix) || /urn:schemas-microsoft-com:office:spreadsheet/.test(prefix);
  const biff = [0x09, 0x0209, 0x0409, 0x0809].includes(bytes[0] | (bytes[1] << 8));
  if (!ole && !zip && !biff && !htmlOrXml) throw new Error('This is not an Excel workbook. If your broker exported text, save it as CSV and import that file.');
  const XLSX = await import('xlsx');
  let workbook;
  try {
    workbook = XLSX.read(bytes, {type: 'array', cellDates: false, cellNF: true, cellHTML: false, bookVBA: false});
  } catch {
    throw new Error('Unable to read this Excel workbook. It may be damaged or password-protected. Open it in Excel and save an unprotected .xls or .xlsx copy.');
  }
  const sheets = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows = range.e.r + 1;
    const columns = range.e.c + 1;
    // Keep a large or decorative sheet from preventing selection of another valid sheet.
    if (rows > MAX_ROWS || columns > MAX_COLUMNS || rows * columns > MAX_CELLS) {
      sheets.push({name, error: 'This sheet is too large. Keep at most 50,000 rows, 256 columns and 1,000,000 cells, or export the transaction table as CSV.'});
      continue;
    }
    const input = XLSX.utils.sheet_to_json(sheet, {header: 1, raw: true, defval: '', blankrows: true, range: 0});
    let cellError;
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue;
      const cell = sheet[address];
      if (cell.t === 'e' || (cell.f && cell.v == null)) {
        cellError = `Cell ${address} contains an Excel error or a formula without a saved value. Recalculate the workbook in Excel and save it before importing.`;
      }
      if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(cell.v, {date1904: !!workbook.Workbook?.WBProps?.date1904});
        if (date) {
          const {r, c} = XLSX.utils.decode_cell(address);
          input[r][c] = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        }
      }
    }
    sheets.push(cellError ? {name, error: cellError} : {name, input});
  }
  if (!sheets.length) throw new Error('This workbook has no worksheets containing data.');
  return sheets;
}
