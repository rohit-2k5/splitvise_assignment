/**
 * Custom robust CSV Parser for parsing expense data
 * Handles headers, quotes, and standard separators (comma and semicolon)
 */
const parseCSV = (csvString) => {
  if (!csvString || csvString.trim() === '') {
    return [];
  }

  // Normalize newlines and split into rows
  const rows = csvString.replace(/\r/g, '').split('\n').map(row => row.trim()).filter(row => row !== '');
  if (rows.length < 2) {
    return []; // No data rows
  }

  // Parse header row
  const headerRow = rows[0];
  const delimiter = headerRow.includes(';') ? ';' : ',';
  const headers = splitCSVRow(headerRow, delimiter).map(h => cleanValue(h));

  const parsedData = [];

  for (let i = 1; i < rows.length; i++) {
    const rawCols = splitCSVRow(rows[i], delimiter);
    const rowObj = {
      _rowNumber: i + 1, // 1-indexed Excel row number (accounting for header)
    };

    headers.forEach((header, index) => {
      rowObj[header] = cleanValue(rawCols[index] || '');
    });

    parsedData.push(rowObj);
  }

  return parsedData;
};

/**
 * Splits a CSV row respecting double quotes
 */
const splitCSVRow = (rowText, delimiter) => {
  const result = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(currentVal);
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  result.push(currentVal);
  return result;
};

/**
 * Strips quotes and extra whitespace from value
 */
const cleanValue = (val) => {
  let cleaned = val.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  return cleaned;
};

module.exports = {
  parseCSV
};
