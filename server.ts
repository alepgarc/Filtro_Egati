import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createServer as createViteServer } from 'vite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Official EPR Paraná Logo SVG Definition
const EPR_PARANA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" rx="36" fill="#072b4a"/>
  <g transform="translate(45, 95)">
    <!-- Letter 'e' -->
    <path d="M 52,140 C 22,140 0,118 0,80 C 0,42 24,18 56,18 C 88,18 108,40 108,78 C 108,86 106,90 98,90 L 25,90 C 27,112 40,123 60,123 C 74,123 85,116 91,105 L 108,114 C 98,131 80,140 52,140 Z M 25,74 L 84,74 C 83,53 72,34 56,34 C 39,34 27,51 25,74 Z" fill="#ffffff" />
    <!-- Letter 'r' -->
    <path d="M 230,30 L 254,30 L 254,58 C 263,38 279,28 300,28 L 305,48 C 285,48 266,60 256,76 L 256,140 L 230,140 Z" fill="#ffffff" />
    <!-- White base parts of 'p' -->
    <path d="M 125,28 L 150,28 L 150,60 C 160,40 176,28 200,28 C 228,28 248,50 248,88 C 248,126 226,148 198,148 C 176,148 160,136 150,116 L 150,180 L 125,180 Z" fill="#ffffff" opacity="0.95" />
    <!-- Green Dynamic Swoop ribbon of EPR linking 'e', 'p' and 'r' -->
    <path d="M 88,88 C 120,40 160,15 210,18 C 255,20 285,55 260,95 C 235,135 185,160 148,155 C 130,152 125,135 135,120 C 148,100 190,82 225,68 C 245,60 250,45 235,38 C 215,30 175,45 140,82 C 122,102 100,125 78,140 L 60,120 C 82,104 100,80 115,55 Z" fill="#67ba7b" opacity="0.9" />
    <!-- Stylized 'p' bowl accent in green -->
    <path d="M 128,88 C 128,140 128,185 152,185 C 158,185 158,155 158,135 C 168,148 184,152 200,150 C 235,145 254,115 254,84 C 254,48 232,24 195,24 C 165,24 145,45 136,75 Z" fill="#67ba7b" />
    <ellipse cx="188" cy="85" rx="30" ry="36" fill="#072b4a" />
    <!-- Text "PARANÁ" -->
    <text x="285" y="185" text-anchor="end" font-family="Montserrat, Arial, sans-serif" font-weight="900" font-size="28" fill="#ffffff" letter-spacing="0.5">PARANÁ</text>
  </g>
</svg>`;

let cachedEprLogoPng: Buffer | null = null;
async function getEprLogoPng(): Promise<Buffer> {
  if (!cachedEprLogoPng) {
    cachedEprLogoPng = await sharp(Buffer.from(EPR_PARANA_LOGO_SVG))
      .resize(300, 300)
      .png()
      .toBuffer();
  }
  return cachedEprLogoPng;
}


// Helper to convert column letter to 0-based index: "A" -> 0, "Z" -> 25, "AA" -> 26
function colToIdx(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// Helper to convert 0-based index to column letter: 0 -> "A", 25 -> "Z", 26 -> "AA"
function idxToCol(idx: number): string {
  let temp = idx + 1;
  let letter = '';
  while (temp > 0) {
    let m = (temp - 1) % 26;
    letter = String.fromCharCode(65 + m) + letter;
    temp = Math.floor((temp - m) / 26);
  }
  return letter;
}

const app = express();
const PORT = 3000;

// Set up temp directories
const TMP_BASE = path.join('/tmp', 'xlsx_cleaner');
const UPLOAD_DIR = path.join(TMP_BASE, 'uploads');
const PROCESSED_DIR = path.join(TMP_BASE, 'processed');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PROCESSED_DIR, { recursive: true });

// Body parser for JSON
app.use(express.json({ limit: '10mb' }));

// Multer storage for files up to 100MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      return cb(new Error('Formato inválido. Apenas arquivos .xlsx são permitidos.'));
    }
    cb(null, true);
  },
});

interface UploadedFileInfo {
  fileId: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  uploadedAt: number;
  sheetNames: string[];
}

interface ProcessedFileInfo {
  downloadId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  createdAt: number;
  originalColumnsCount: number;
  removedColumnsCount: number;
  keptColumnsCount: number;
  originalRowsCount?: number;
  keptRowsCount?: number;
  removedRowsCount?: number;
  rowsCount: number;
  originalFileName: string;
  appliedEstadoFilter?: string | null;
  appliedRodoviaFilter?: string | null;
  featureType?: string;
}

const uploadedFiles = new Map<string, UploadedFileInfo>();
const processedFiles = new Map<string, ProcessedFileInfo>();

// Helpers for EstadoConservacao and Rodovia column and filter detection
function normalizeString(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isEstadoConservacaoCol(name: string): boolean {
  if (!name) return false;
  const n = normalizeString(name);
  return n === 'estadoconservacao' || n === 'estadodeconservacao';
}

function matchesEstadoFilter(cellValue: string, filter: string): boolean {
  if (!filter || filter.toUpperCase() === 'TODOS') return true;
  return normalizeString(cellValue) === normalizeString(filter);
}

function isRodoviaCol(name: string): boolean {
  if (!name) return false;
  const n = normalizeString(name);
  return n === 'rodovia' || n === 'rodovias';
}

function matchesRodoviaFilter(cellValue: string, filter: string): boolean {
  if (!filter || filter.toUpperCase() === 'TODAS' || filter.toUpperCase() === 'TODOS') return true;
  return normalizeString(cellValue) === normalizeString(filter);
}

// Helper to inspect a sheet in an existing ExcelJS workbook
async function getSheetDetailsAsync(filePath: string, sheetName: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(sheetName);

  if (!ws) {
    return {
      headers: [],
      columns: [],
      totalRows: 0,
      totalCols: 0,
      previewRows: [],
      rodoviaOptions: [],
    };
  }

  const totalRows = Math.max(0, ws.rowCount - 1);
  const totalCols = ws.columnCount;

  const columns: { index: number; name: string; letter: string }[] = [];
  const headers: string[] = [];

  const headerRow = ws.getRow(1);
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    const letter = ws.getColumn(c).letter || String(c);
    let name = (cell.text || (cell.value != null ? String(cell.value) : '')).trim();
    if (!name) {
      name = `Coluna ${letter}`;
    }
    headers.push(name);
    columns.push({
      index: c - 1, // 0-based index for UI array indexing
      name,
      letter,
    });
  }

  // Detect Rodovia and EstadoConservacao column indices (1-based)
  let rodoviaColIdx = -1;
  let estadoColIdx = -1;
  for (let c = 1; c <= totalCols; c++) {
    const colName = headers[c - 1];
    if (isRodoviaCol(colName)) {
      rodoviaColIdx = c;
    }
    if (isEstadoConservacaoCol(colName)) {
      estadoColIdx = c;
    }
  }

  const rowFiltersData: { r: string; e: string }[] = [];
  const rodoviaCounts: Record<string, number> = {};
  const estadoCounts: Record<string, number> = {};
  const uniqueRodovias = new Set<string>();

  ws.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      let rVal = '';
      if (rodoviaColIdx > 0) {
        const cell = row.getCell(rodoviaColIdx);
        if (cell.value !== null && cell.value !== undefined) {
          rVal = String(cell.text || cell.value).trim();
        }
      }

      let eVal = '';
      if (estadoColIdx > 0) {
        const cell = row.getCell(estadoColIdx);
        if (cell.value !== null && cell.value !== undefined) {
          eVal = String(cell.text || cell.value).trim();
        }
      }

      rowFiltersData.push({ r: rVal, e: eVal });

      if (rVal) {
        uniqueRodovias.add(rVal);
        rodoviaCounts[rVal] = (rodoviaCounts[rVal] || 0) + 1;
      }

      if (eVal) {
        const normE = normalizeString(eVal);
        if (normE === 'bom') estadoCounts['BOM'] = (estadoCounts['BOM'] || 0) + 1;
        else if (normE === 'regular') estadoCounts['REGULAR'] = (estadoCounts['REGULAR'] || 0) + 1;
        else if (normE === 'precario') estadoCounts['PRECÁRIO'] = (estadoCounts['PRECÁRIO'] || 0) + 1;
        else estadoCounts[eVal] = (estadoCounts[eVal] || 0) + 1;
      }
    }
  });

  const rodoviaOptions = Array.from(uniqueRodovias).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  // Read up to 20 preview rows (rows 2 to min(ws.rowCount, 21))
  const previewRows: (string | number | boolean | null)[][] = [];
  const maxPreviewR = Math.min(ws.rowCount, 21);

  for (let r = 2; r <= maxPreviewR; r++) {
    const rowObj = ws.getRow(r);
    const rowValues: (string | number | boolean | null)[] = [];
    for (let c = 1; c <= totalCols; c++) {
      const cell = rowObj.getCell(c);
      let cellStr = '';
      if (cell.value !== null && cell.value !== undefined) {
        if (cell.value instanceof Date) {
          cellStr = cell.value.toLocaleDateString('pt-BR');
        } else if (typeof cell.value === 'object') {
          if ('result' in cell.value) {
            cellStr = String((cell.value as any).result ?? '');
          } else if ('richText' in cell.value && Array.isArray((cell.value as any).richText)) {
            cellStr = (cell.value as any).richText.map((t: any) => t.text).join('');
          } else {
            cellStr = cell.text || '';
          }
        } else {
          cellStr = String(cell.value);
        }
      }
      rowValues.push(cellStr);
    }
    previewRows.push(rowValues);
  }

  return {
    headers,
    columns,
    totalRows: rowFiltersData.length,
    totalCols,
    previewRows,
    rodoviaOptions,
    rowFiltersData,
    rodoviaCounts,
    estadoCounts,
  };
}

// 1. Upload endpoint
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'O arquivo excede o limite máximo permitido de 100 MB.',
          });
        }
      }
      return res.status(400).json({
        error: err.message || 'Falha ao enviar arquivo.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
      const filePath = req.file.path;
      const fileId = path.basename(filePath);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);

      const sheetNames = wb.worksheets.map((w) => w.name);
      if (!sheetNames || sheetNames.length === 0) {
        return res.status(400).json({
          error: 'A planilha enviada não possui nenhuma aba válida.',
        });
      }

      const activeSheet = sheetNames[0];
      const sheetDetails = await getSheetDetailsAsync(filePath, activeSheet);

      uploadedFiles.set(fileId, {
        fileId,
        originalName: req.file.originalname,
        filePath,
        fileSize: req.file.size,
        uploadedAt: Date.now(),
        sheetNames,
      });

      res.json({
        fileId,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        sheetNames,
        activeSheet,
        sheetDetails,
      });
    } catch (parseError: any) {
      console.error('Error parsing uploaded XLSX:', parseError);
      return res.status(500).json({
        error: 'Erro ao processar planilha Excel: ' + (parseError.message || 'Arquivo corrompido ou formato não suportado.'),
      });
    }
  });
});

// 2. Switch Sheet preview endpoint
app.get('/api/sheet-preview', async (req, res) => {
  const fileId = req.query.fileId as string;
  const sheetName = req.query.sheetName as string;

  if (!fileId || !sheetName) {
    return res.status(400).json({ error: 'Parâmetros fileId e sheetName são obrigatórios.' });
  }

  const fileInfo = uploadedFiles.get(fileId);
  if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado ou sessão expirada.' });
  }

  try {
    const sheetDetails = await getSheetDetailsAsync(fileInfo.filePath, sheetName);
    res.json({
      sheetName,
      sheetDetails,
    });
  } catch (error: any) {
    console.error('Error fetching sheet preview:', error);
    res.status(500).json({ error: 'Falha ao carregar prévia da aba: ' + error.message });
  }
});

function getCellTextValue(cEl: any, sharedStrings: string[]): string {
  if (!cEl) return '';
  const t = cEl.getAttribute('t');
  if (t === 'inlineStr') {
    const isEl = cEl.getElementsByTagName('is').item(0);
    if (isEl) {
      const tEl = isEl.getElementsByTagName('t').item(0);
      return tEl?.textContent || '';
    }
    return '';
  }
  const vEl = cEl.getElementsByTagName('v').item(0);
  const v = vEl ? vEl.textContent || '' : '';
  if (t === 's') {
    const idx = parseInt(v, 10);
    return !isNaN(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
  }
  return v;
}

// Low-level JSZip OpenXML transformation to remove columns without breaking drawings, photos or styles
async function processWorkbookWithZip(
  inputPath: string,
  sheetNameTarget: string,
  columnIndicesToRemove: number[],
  estadoConservacaoFilter?: string | null,
  rodoviaFilter?: string | null
) {
  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const removeSet = new Set(columnIndicesToRemove);

  // 1. Locate target sheet relationship ID in xl/workbook.xml
  let targetRelId: string | null = null;
  if (zip.files['xl/workbook.xml']) {
    const wbXmlStr = await zip.files['xl/workbook.xml'].async('string');
    const wbDom = parser.parseFromString(wbXmlStr, 'text/xml');
    const sheets = wbDom.getElementsByTagName('sheet');

    for (let i = 0; i < sheets.length; i++) {
      const s = sheets.item(i);
      const name = s?.getAttribute('name');
      if (
        name === sheetNameTarget ||
        name?.trim().toLowerCase() === sheetNameTarget?.trim().toLowerCase()
      ) {
        targetRelId = s?.getAttribute('r:id') || s?.getAttribute('id');
        break;
      }
    }
  }

  if (!targetRelId) {
    throw new Error(`Aba "${sheetNameTarget}" não foi encontrada no arquivo Excel.`);
  }

  // 2. Resolve targetRelId to sheet XML path in xl/_rels/workbook.xml.rels
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (zip.files['xl/_rels/workbook.xml.rels']) {
    const relsXmlStr = await zip.files['xl/_rels/workbook.xml.rels'].async('string');
    const relsDom = parser.parseFromString(relsXmlStr, 'text/xml');
    const rels = relsDom.getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i++) {
      const r = rels.item(i);
      if (r?.getAttribute('Id') === targetRelId) {
        let t = r?.getAttribute('Target') || '';
        if (t.startsWith('/')) t = t.substring(1);
        if (!t.startsWith('xl/')) t = 'xl/' + t;
        sheetPath = t;
        break;
      }
    }
  }

  if (!zip.files[sheetPath]) {
    throw new Error(`Arquivo XML da aba "${sheetNameTarget}" (${sheetPath}) não foi encontrado.`);
  }

  // Load sharedStrings if present
  const sharedStrings: string[] = [];
  if (zip.files['xl/sharedStrings.xml']) {
    const ssXmlStr = await zip.files['xl/sharedStrings.xml'].async('string');
    const ssDom = parser.parseFromString(ssXmlStr, 'text/xml');
    const siNodes = ssDom.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      const si = siNodes.item(i);
      const tNodes = si?.getElementsByTagName('t');
      let s = '';
      if (tNodes) {
        for (let j = 0; j < tNodes.length; j++) {
          s += tNodes.item(j)?.textContent || '';
        }
      }
      sharedStrings.push(s);
    }
  }

  // 3. Parse target sheet XML
  const sheetXmlStr = await zip.files[sheetPath].async('string');
  const sheetDom = parser.parseFromString(sheetXmlStr, 'text/xml');

  // Find max column index and max row number
  const cNodes = sheetDom.getElementsByTagName('c');
  let maxColIdx = 0;
  let maxRow = 1;

  for (let i = 0; i < cNodes.length; i++) {
    const cEl = cNodes.item(i);
    const rAttr = cEl?.getAttribute('r');
    if (rAttr) {
      const match = rAttr.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const colI = colToIdx(match[1]);
        const rowI = parseInt(match[2], 10);
        if (colI > maxColIdx) maxColIdx = colI;
        if (rowI > maxRow) maxRow = rowI;
      }
    }
  }

  const totalCols = maxColIdx + 1;
  const keepIndices = new Set<number>();
  for (let c = 0; c < totalCols; c++) {
    if (!removeSet.has(c)) {
      keepIndices.add(c);
    }
  }

  if (keepIndices.size === 0) {
    throw new Error('Você não pode remover todas as colunas da planilha.');
  }

  const newColIdxMap = new Map<number, number>();
  let nextNewIdx = 0;
  for (let c = 0; c < totalCols; c++) {
    if (keepIndices.has(c)) {
      newColIdxMap.set(c, nextNewIdx);
      nextNewIdx++;
    }
  }

  function mapCol(c: number): number {
    if (newColIdxMap.has(c)) return newColIdxMap.get(c)!;
    for (let k = c - 1; k >= 0; k--) {
      if (newColIdxMap.has(k)) return newColIdxMap.get(k)!;
    }
    for (let k = c + 1; k < totalCols; k++) {
      if (newColIdxMap.has(k)) return newColIdxMap.get(k)!;
    }
    return 0;
  }

  // 4. Identify EstadoConservacao and Rodovia columns in header (Row 1)
  let estadoConservacaoColLetter: string | null = null;
  let rodoviaColLetter: string | null = null;
  for (let i = 0; i < cNodes.length; i++) {
    const cEl = cNodes.item(i);
    const rAttr = cEl?.getAttribute('r');
    if (rAttr && /^[A-Z]+1$/.test(rAttr)) {
      const colLetter = rAttr.replace(/1$/, '');
      const headerVal = getCellTextValue(cEl, sharedStrings);
      if (isEstadoConservacaoCol(headerVal)) {
        estadoConservacaoColLetter = colLetter;
      }
      if (isRodoviaCol(headerVal)) {
        rodoviaColLetter = colLetter;
      }
    }
  }

  // Check if filtering by EstadoConservacao is active
  const isEstadoFilterActive = Boolean(
    estadoConservacaoFilter &&
      estadoConservacaoFilter.trim() !== '' &&
      estadoConservacaoFilter.toUpperCase() !== 'TODOS' &&
      estadoConservacaoColLetter !== null
  );

  // Check if filtering by Rodovia is active
  const isRodoviaFilterActive = Boolean(
    rodoviaFilter &&
      rodoviaFilter.trim() !== '' &&
      rodoviaFilter.toUpperCase() !== 'TODAS' &&
      rodoviaFilter.toUpperCase() !== 'TODOS' &&
      rodoviaColLetter !== null
  );

  const hasAnyRowFilter = isEstadoFilterActive || isRodoviaFilterActive;

  // 5. Build newRowMap and identify rows to remove
  const newRowMap = new Map<number, number>();
  newRowMap.set(1, 1); // Row 1 (header) is always kept as row 1

  const rowsToRemove: any[] = [];
  const rowNodes = sheetDom.getElementsByTagName('row');
  let nextNewRow = 2;
  let originalDataRowsCount = 0;
  let keptDataRowsCount = 0;

  for (let i = 0; i < rowNodes.length; i++) {
    const rowEl = rowNodes.item(i);
    if (!rowEl) continue;
    const rNum = parseInt(rowEl.getAttribute('r') || '0', 10);
    if (rNum <= 0) continue;
    if (rNum === 1) continue; // Header row

    originalDataRowsCount++;

    if (!hasAnyRowFilter) {
      // No filter: keep every row as-is
      newRowMap.set(rNum, rNum);
      keptDataRowsCount++;
    } else {
      let matchesEstado = true;
      let matchesRodovia = true;
      const cChildren = rowEl.getElementsByTagName('c');

      if (isEstadoFilterActive) {
        let cellVal = '';
        const targetCellRef = `${estadoConservacaoColLetter}${rNum}`;
        for (let j = 0; j < cChildren.length; j++) {
          const c = cChildren.item(j);
          if (c?.getAttribute('r') === targetCellRef) {
            cellVal = getCellTextValue(c, sharedStrings);
            break;
          }
        }
        matchesEstado = matchesEstadoFilter(cellVal, estadoConservacaoFilter!);
      }

      if (isRodoviaFilterActive) {
        let cellVal = '';
        const targetCellRef = `${rodoviaColLetter}${rNum}`;
        for (let j = 0; j < cChildren.length; j++) {
          const c = cChildren.item(j);
          if (c?.getAttribute('r') === targetCellRef) {
            cellVal = getCellTextValue(c, sharedStrings);
            break;
          }
        }
        matchesRodovia = matchesRodoviaFilter(cellVal, rodoviaFilter!);
      }

      if (matchesEstado && matchesRodovia) {
        newRowMap.set(rNum, nextNewRow);
        nextNewRow++;
        keptDataRowsCount++;
      } else {
        rowsToRemove.push(rowEl);
      }
    }
  }

  // Remove rows from sheet DOM that did not match the filter
  rowsToRemove.forEach((r) => {
    if (r && r.parentNode) {
      r.parentNode.removeChild(r);
    }
  });

  // Renumber remaining row elements and update spans
  for (let i = 0; i < rowNodes.length; i++) {
    const rowEl = rowNodes.item(i);
    if (!rowEl) continue;
    const origR = parseInt(rowEl.getAttribute('r') || '0', 10);
    if (newRowMap.has(origR)) {
      const newR = newRowMap.get(origR)!;
      rowEl.setAttribute('r', String(newR));
      if (rowEl.hasAttribute('spans')) {
        rowEl.setAttribute('spans', `1:${keepIndices.size}`);
      }
    }
  }

  // 6. Update or remove cell elements <c>
  const cellsToRemove: any[] = [];
  for (let i = 0; i < cNodes.length; i++) {
    const cEl = cNodes.item(i);
    const rAttr = cEl?.getAttribute('r');
    if (rAttr) {
      const match = rAttr.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const oldCol = colToIdx(match[1]);
        const origRow = parseInt(match[2], 10);

        if (!newRowMap.has(origRow) || !keepIndices.has(oldCol)) {
          cellsToRemove.push(cEl);
        } else {
          const newCol = newColIdxMap.get(oldCol)!;
          const newRow = newRowMap.get(origRow)!;
          const newColStr = idxToCol(newCol);
          cEl?.setAttribute('r', `${newColStr}${newRow}`);
        }
      }
    }
  }

  cellsToRemove.forEach((el) => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  const finalMaxRow = hasAnyRowFilter ? nextNewRow - 1 : maxRow;

  // 7. Update <dimension ref="..." />
  const dimNodes = sheetDom.getElementsByTagName('dimension');
  if (dimNodes.length > 0) {
    const lastColStr = idxToCol(keepIndices.size - 1);
    dimNodes.item(0)?.setAttribute('ref', `A1:${lastColStr}${finalMaxRow}`);
  }

  // 8. Update <cols> tag
  const colsNodes = sheetDom.getElementsByTagName('cols');
  if (colsNodes.length > 0) {
    const colsEl = colsNodes.item(0);
    if (colsEl) {
      const colChildren = colsEl.getElementsByTagName('col');
      const colDefs: { min: number; max: number; node: any }[] = [];
      for (let i = 0; i < colChildren.length; i++) {
        const cItem = colChildren.item(i);
        if (cItem) {
          const min = parseInt(cItem.getAttribute('min') || '1', 10);
          const max = parseInt(cItem.getAttribute('max') || '1', 10);
          colDefs.push({ min, max, node: cItem.cloneNode(true) });
        }
      }

      while (colsEl.firstChild) {
        colsEl.removeChild(colsEl.firstChild);
      }

      for (const cIdx of Array.from(keepIndices).sort((a, b) => a - b)) {
        const origCol1 = cIdx + 1;
        const newCol1 = newColIdxMap.get(cIdx)! + 1;
        const foundDef = colDefs.find((d) => origCol1 >= d.min && origCol1 <= d.max);
        if (foundDef) {
          const newColNode = foundDef.node.cloneNode(true) as any;
          newColNode.setAttribute('min', String(newCol1));
          newColNode.setAttribute('max', String(newCol1));
          colsEl.appendChild(newColNode);
        }
      }
    }
  }

  // 9. Update <mergeCells>
  const mergeCellsNodes = sheetDom.getElementsByTagName('mergeCells');
  if (mergeCellsNodes.length > 0) {
    const mergeCellsEl = mergeCellsNodes.item(0);
    if (mergeCellsEl) {
      const mergeCellChildren = mergeCellsEl.getElementsByTagName('mergeCell');
      const mergesToRemove: any[] = [];

      for (let i = 0; i < mergeCellChildren.length; i++) {
        const mEl = mergeCellChildren.item(i);
        const ref = mEl?.getAttribute('ref');
        if (ref) {
          const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          if (match) {
            const c1 = colToIdx(match[1]);
            const r1 = parseInt(match[2], 10);
            const c2 = colToIdx(match[3]);
            const r2 = parseInt(match[4], 10);

            if (
              !keepIndices.has(c1) ||
              !keepIndices.has(c2) ||
              !newRowMap.has(r1) ||
              !newRowMap.has(r2)
            ) {
              mergesToRemove.push(mEl);
            } else {
              const nc1 = newColIdxMap.get(c1)!;
              const nc2 = newColIdxMap.get(c2)!;
              const nr1 = newRowMap.get(r1)!;
              const nr2 = newRowMap.get(r2)!;
              if (nc1 === nc2 && nr1 === nr2) {
                mergesToRemove.push(mEl);
              } else {
                mEl?.setAttribute('ref', `${idxToCol(nc1)}${nr1}:${idxToCol(nc2)}${nr2}`);
              }
            }
          }
        }
      }

      mergesToRemove.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });

      if (mergeCellsEl) {
        const remainingMerges = mergeCellsEl.getElementsByTagName('mergeCell');
        if (remainingMerges.length === 0) {
          if (mergeCellsEl.parentNode) mergeCellsEl.parentNode.removeChild(mergeCellsEl);
        } else {
          mergeCellsEl.setAttribute('count', String(remainingMerges.length));
        }
      }
    }
  }

  // 10. Update <autoFilter>
  const autoFilterNodes = sheetDom.getElementsByTagName('autoFilter');
  if (autoFilterNodes.length > 0) {
    const afEl = autoFilterNodes.item(0);
    if (afEl) {
      const lastColStr = idxToCol(keepIndices.size - 1);
      afEl.setAttribute('ref', `A1:${lastColStr}${finalMaxRow}`);

      const filterColChildren = afEl.getElementsByTagName('filterColumn');
      const filterColsToRemove: any[] = [];
      for (let i = 0; i < filterColChildren.length; i++) {
        const fc = filterColChildren.item(i);
        const colIdAttr = fc?.getAttribute('colId');
        if (colIdAttr) {
          const colId = parseInt(colIdAttr, 10);
          if (!keepIndices.has(colId)) {
            filterColsToRemove.push(fc);
          } else {
            fc?.setAttribute('colId', String(newColIdxMap.get(colId)!));
          }
        }
      }
      filterColsToRemove.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }
  }

  // 11. Update <hyperlink>
  const hyperlinkNodes = sheetDom.getElementsByTagName('hyperlink');
  const hyperlinksToRemove: any[] = [];
  for (let i = 0; i < hyperlinkNodes.length; i++) {
    const hl = hyperlinkNodes.item(i);
    const ref = hl?.getAttribute('ref');
    if (ref) {
      const match = ref.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const c = colToIdx(match[1]);
        const r = parseInt(match[2], 10);
        if (!keepIndices.has(c) || !newRowMap.has(r)) {
          hyperlinksToRemove.push(hl);
        } else {
          hl?.setAttribute('ref', `${idxToCol(newColIdxMap.get(c)!)}${newRowMap.get(r)!}`);
        }
      }
    }
  }
  hyperlinksToRemove.forEach((el) => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });

  // 11. Reset cursor and sheet view position to cell A1 (so Excel opens with cursor on A1 instead of remote cell)
  resetSheetViewCursorToA1(sheetDom);

  // Save modified sheet XML back to zip
  zip.file(sheetPath, serializer.serializeToString(sheetDom));

  // 12. Update Drawing XML files (xl/drawings/drawing*.xml)
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('xl/drawings/drawing') && filename.endsWith('.xml')) {
      const dXmlStr = await zip.files[filename].async('string');
      const dDom = parser.parseFromString(dXmlStr, 'text/xml');

      const allAnchors = Array.from(dDom.documentElement.childNodes).filter(
        (n: any) => n.nodeType === 1
      );
      const anchorsToRemove: any[] = [];

      for (const anchor of allAnchors) {
        const fromEl =
          (anchor as any).getElementsByTagName('xdr:from').item(0) ||
          (anchor as any).getElementsByTagName('from').item(0);

        if (fromEl) {
          const rowEl =
            fromEl.getElementsByTagName('xdr:row').item(0) ||
            fromEl.getElementsByTagName('row').item(0);
          const colEl =
            fromEl.getElementsByTagName('xdr:col').item(0) ||
            fromEl.getElementsByTagName('col').item(0);

          if (rowEl) {
            const origRow0 = parseInt(rowEl.textContent || '0', 10);
            const origRow1 = origRow0 + 1;

            if (!newRowMap.has(origRow1)) {
              // Anchor row was filtered out! Remove this drawing anchor
              anchorsToRemove.push(anchor);
              continue;
            }

            const newRow1 = newRowMap.get(origRow1)!;
            rowEl.textContent = String(newRow1 - 1);

            const toEl =
              (anchor as any).getElementsByTagName('xdr:to').item(0) ||
              (anchor as any).getElementsByTagName('to').item(0);
            if (toEl) {
              const toRowEl =
                toRowElTag(toEl);
              if (toRowEl) {
                const toOrigRow0 = parseInt(toRowEl.textContent || '0', 10);
                const rowDiff = toOrigRow0 - origRow0;
                toRowEl.textContent = String(newRow1 - 1 + rowDiff);
              }
            }
          }

          if (colEl) {
            const oldC = parseInt(colEl.textContent || '0', 10);
            colEl.textContent = String(mapCol(oldC));

            const toEl =
              (anchor as any).getElementsByTagName('xdr:to').item(0) ||
              (anchor as any).getElementsByTagName('to').item(0);
            if (toEl) {
              const toColEl =
                toEl.getElementsByTagName('xdr:col').item(0) ||
                toEl.getElementsByTagName('col').item(0);
              if (toColEl) {
                const toOldC = parseInt(toColEl.textContent || '0', 10);
                toColEl.textContent = String(mapCol(toOldC));
              }
            }
          }
        }
      }

      anchorsToRemove.forEach((a) => {
        if (a && a.parentNode) a.parentNode.removeChild(a);
      });

      zip.file(filename, serializer.serializeToString(dDom));
    }
  }

  // 13. Update Table XML files (xl/tables/table*.xml)
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('xl/tables/table') && filename.endsWith('.xml')) {
      const tXmlStr = await zip.files[filename].async('string');
      const tDom = parser.parseFromString(tXmlStr, 'text/xml');

      const tableEls = tDom.getElementsByTagName('table');
      if (tableEls.length > 0) {
        const tEl = tableEls.item(0);
        if (tEl) {
          const lastColStr = idxToCol(keepIndices.size - 1);
          tEl.setAttribute('ref', `A1:${lastColStr}${finalMaxRow}`);
        }
      }

      const tcNodes = tDom.getElementsByTagName('tableColumn');
      const tcToRemove: any[] = [];
      for (let i = 0; i < tcNodes.length; i++) {
        const tc = tcNodes.item(i);
        const idAttr = tc?.getAttribute('id');
        if (idAttr) {
          const cIdx = parseInt(idAttr, 10) - 1;
          if (!keepIndices.has(cIdx)) {
            tcToRemove.push(tc);
          } else {
            tc?.setAttribute('id', String(newColIdxMap.get(cIdx)! + 1));
          }
        }
      }
      tcToRemove.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });

      const tableColsNodes = tDom.getElementsByTagName('tableColumns');
      if (tableColsNodes.length > 0) {
        tableColsNodes.item(0)?.setAttribute('count', String(keepIndices.size));
      }

      zip.file(filename, serializer.serializeToString(tDom));
    }
  }

  // 14. If calcChain.xml exists, remove it so Excel rebuilds formulas cleanly without repair warnings
  if (zip.files['xl/calcChain.xml']) {
    zip.remove('xl/calcChain.xml');

    if (zip.files['xl/_rels/workbook.xml.rels']) {
      const relsStr = await zip.files['xl/_rels/workbook.xml.rels'].async('string');
      const relsDom = parser.parseFromString(relsStr, 'text/xml');
      const rels = relsDom.getElementsByTagName('Relationship');
      const toRemove: any[] = [];
      for (let i = 0; i < rels.length; i++) {
        const r = rels.item(i);
        const t = r?.getAttribute('Target');
        if (t === 'calcChain.xml' || t === '/xl/calcChain.xml') {
          toRemove.push(r);
        }
      }
      toRemove.forEach((r) => {
        if (r && r.parentNode) r.parentNode.removeChild(r);
      });
      zip.file('xl/_rels/workbook.xml.rels', serializer.serializeToString(relsDom));
    }

    if (zip.files['[Content_Types].xml']) {
      const ctStr = await zip.files['[Content_Types].xml'].async('string');
      const ctDom = parser.parseFromString(ctStr, 'text/xml');
      const overrides = ctDom.getElementsByTagName('Override');
      const toRemove: any[] = [];
      for (let i = 0; i < overrides.length; i++) {
        const o = overrides.item(i);
        const p = o?.getAttribute('PartName');
        if (p === '/xl/calcChain.xml' || p === 'xl/calcChain.xml') {
          toRemove.push(o);
        }
      }
      toRemove.forEach((o) => {
        if (o && o.parentNode) o.parentNode.removeChild(o);
      });
      zip.file('[Content_Types].xml', serializer.serializeToString(ctDom));
    }
  }

  // 15. Ensure all worksheets in the workbook have view and cursor positioned at cell A1
  for (const filename of Object.keys(zip.files)) {
    if (
      filename.startsWith('xl/worksheets/sheet') &&
      filename.endsWith('.xml') &&
      filename !== sheetPath
    ) {
      try {
        const otherSheetXml = await zip.files[filename].async('string');
        const otherDom = parser.parseFromString(otherSheetXml, 'text/xml');
        resetSheetViewCursorToA1(otherDom);
        zip.file(filename, serializer.serializeToString(otherDom));
      } catch (err) {
        console.warn(`Could not reset cursor in ${filename}:`, err);
      }
    }
  }

  // Output new zip buffer
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    buffer: outBuf,
    originalColumnsCount: totalCols,
    removedColumnsCount: removeSet.size,
    keptColumnsCount: keepIndices.size,
    originalRowsCount: originalDataRowsCount,
    keptRowsCount: keptDataRowsCount,
    removedRowsCount: originalDataRowsCount - keptDataRowsCount,
    rowsCount: keptDataRowsCount,
    appliedEstadoFilter: isEstadoFilterActive ? estadoConservacaoFilter! : null,
    appliedRodoviaFilter: isRodoviaFilterActive ? rodoviaFilter! : null,
  };
}

function resetSheetViewCursorToA1(doc: any) {
  let sheetViews = doc.getElementsByTagName('sheetViews').item(0);
  if (!sheetViews) {
    sheetViews = doc.createElement('sheetViews');
    const sheetData = doc.getElementsByTagName('sheetData').item(0);
    if (sheetData && sheetData.parentNode) {
      sheetData.parentNode.insertBefore(sheetViews, sheetData);
    } else {
      doc.documentElement.insertBefore(sheetViews, doc.documentElement.firstChild);
    }
  }

  const svList = sheetViews.getElementsByTagName('sheetView');
  if (svList.length === 0) {
    const sv = doc.createElement('sheetView');
    sv.setAttribute('workbookViewId', '0');
    sv.setAttribute('tabSelected', '1');
    sv.setAttribute('topLeftCell', 'A1');
    const sel = doc.createElement('selection');
    sel.setAttribute('activeCell', 'A1');
    sel.setAttribute('sqref', 'A1');
    sv.appendChild(sel);
    sheetViews.appendChild(sv);
  } else {
    for (let i = 0; i < svList.length; i++) {
      const sv = svList.item(i);
      if (!sv) continue;

      // Reset visible top-left scroll position to A1
      sv.setAttribute('topLeftCell', 'A1');

      // If pane exists, clean remote topLeftCell (e.g. if it pointed far away like BE282)
      const panes = sv.getElementsByTagName('pane');
      for (let p = 0; p < panes.length; p++) {
        const pane = panes.item(p);
        const pt = pane?.getAttribute('topLeftCell');
        if (pt && !pt.match(/^[A-C][1-5]$/i)) {
          pane?.removeAttribute('topLeftCell');
        }
      }

      // Update or create selection elements so active cell is A1
      const selections = sv.getElementsByTagName('selection');
      if (selections.length > 0) {
        for (let j = 0; j < selections.length; j++) {
          const sel = selections.item(j);
          if (sel) {
            sel.setAttribute('activeCell', 'A1');
            sel.setAttribute('sqref', 'A1');
            if (sel.hasAttribute('activeCellId')) {
              sel.removeAttribute('activeCellId');
            }
          }
        }
      } else {
        const sel = doc.createElement('selection');
        sel.setAttribute('activeCell', 'A1');
        sel.setAttribute('sqref', 'A1');
        sv.appendChild(sel);
      }
    }
  }
}

function toRowElTag(toEl: any): any {
  return (
    toEl.getElementsByTagName('xdr:row').item(0) || toEl.getElementsByTagName('row').item(0)
  );
}

// 3. Process endpoint
app.post('/api/process', async (req, res) => {
  const { fileId, sheetName, columnIndicesToRemove, estadoConservacaoFilter, rodoviaFilter, featureType, customFileName } = req.body as {
    fileId: string;
    sheetName: string;
    columnIndicesToRemove: number[];
    estadoConservacaoFilter?: string | null;
    rodoviaFilter?: string | null;
    featureType?: string;
    customFileName?: string;
  };

  if (!fileId || !sheetName || !Array.isArray(columnIndicesToRemove)) {
    return res.status(400).json({
      error: 'Parâmetros inválidos. É necessário informar fileId, sheetName e colunas a remover.',
    });
  }

  const fileInfo = uploadedFiles.get(fileId);
  if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
    return res.status(404).json({ error: 'Arquivo original não encontrado ou sessão expirada.' });
  }

  try {
    const processed = await processWorkbookWithZip(
      fileInfo.filePath,
      sheetName,
      columnIndicesToRemove,
      estadoConservacaoFilter,
      rodoviaFilter
    );

    let finalFileName = customFileName ? customFileName.trim() : '';
    if (!finalFileName) {
      const parsedName = path.parse(fileInfo.originalName);
      const safeRodovia = rodoviaFilter ? rodoviaFilter.replace(/[\/\\:*?"<>|]/g, '-').trim() : '';
      const safeEstado = estadoConservacaoFilter ? estadoConservacaoFilter.replace(/[\/\\:*?"<>|]/g, '-').trim() : '';

      let suffix = '_filtrada';
      if (safeRodovia && safeEstado) {
        suffix = `_${safeRodovia}_${safeEstado}`;
      } else if (safeRodovia) {
        suffix = `_${safeRodovia}`;
      } else if (safeEstado) {
        suffix = `_${safeEstado}`;
      }
      finalFileName = `${parsedName.name}${suffix}.xlsx`;
    } else if (!finalFileName.toLowerCase().endsWith('.xlsx')) {
      finalFileName = `${finalFileName}.xlsx`;
    }

    const downloadId = 'filtered-' + Date.now() + '-' + Math.round(Math.random() * 1e6);
    const processedFilePath = path.join(PROCESSED_DIR, `${downloadId}.xlsx`);

    fs.writeFileSync(processedFilePath, processed.buffer);
    const processedFileSize = fs.statSync(processedFilePath).size;

    processedFiles.set(downloadId, {
      downloadId,
      filePath: processedFilePath,
      fileName: finalFileName,
      fileSize: processedFileSize,
      createdAt: Date.now(),
      originalColumnsCount: processed.originalColumnsCount,
      removedColumnsCount: processed.removedColumnsCount,
      keptColumnsCount: processed.keptColumnsCount,
      originalRowsCount: processed.originalRowsCount,
      keptRowsCount: processed.keptRowsCount,
      removedRowsCount: processed.removedRowsCount,
      rowsCount: processed.rowsCount,
      originalFileName: fileInfo.originalName,
      appliedEstadoFilter: processed.appliedEstadoFilter,
      appliedRodoviaFilter: processed.appliedRodoviaFilter,
      featureType: featureType || 'drenagem_profunda',
    });

    res.json({
      downloadId,
      fileName: finalFileName,
      fileSize: processedFileSize,
      originalColumnsCount: processed.originalColumnsCount,
      removedColumnsCount: processed.removedColumnsCount,
      keptColumnsCount: processed.keptColumnsCount,
      originalRowsCount: processed.originalRowsCount,
      keptRowsCount: processed.keptRowsCount,
      removedRowsCount: processed.removedRowsCount,
      rowsCount: processed.rowsCount,
      originalFileName: fileInfo.originalName,
      appliedEstadoFilter: processed.appliedEstadoFilter,
      appliedRodoviaFilter: processed.appliedRodoviaFilter,
      downloadUrl: `/api/download/${downloadId}`,
      pdfDownloadUrl: `/api/download-pdf/${downloadId}`,
    });
  } catch (error: any) {
    console.error('Error processing spreadsheet with ZIP engine:', error);
    res.status(500).json({
      error: 'Erro durante o processamento da planilha: ' + (error.message || 'Falha desconhecida'),
    });
  }
});

// 4. Download XLSX endpoint
app.get('/api/download/:downloadId', (req, res) => {
  const downloadId = req.params.downloadId;
  const processedInfo = processedFiles.get(downloadId);

  if (!processedInfo || !fs.existsSync(processedInfo.filePath)) {
    return res.status(404).send('Arquivo para download não encontrado ou já expirado.');
  }

  const stat = fs.statSync(processedInfo.filePath);
  const cleanFileName = processedInfo.fileName.replace(/"/g, '');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`
  );

  const fileStream = fs.createReadStream(processedInfo.filePath);
  fileStream.pipe(res);
});

interface ExtractedMediaItem {
  base64: string;
  format: 'JPEG' | 'PNG';
}

interface ExtractedMediaStore {
  byName: Map<string, ExtractedMediaItem>;
  byCell: Map<string, ExtractedMediaItem>;
  allMedia: ExtractedMediaItem[];
}

function cleanImageKey(key: string): string {
  if (!key) return '';
  return key
    .toLowerCase()
    .trim()
    .replace(/[\\/]/g, '')
    .replace(/\s+/g, '')
    .replace(/[._\-+]/g, '');
}

async function extractMediaFromZipWorkbook(filePath: string): Promise<ExtractedMediaStore> {
  const store: ExtractedMediaStore = {
    byName: new Map(),
    byCell: new Map(),
    allMedia: [],
  };

  try {
    if (!fs.existsSync(filePath)) return store;
    const fileBuf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuf);
    const parser = new DOMParser();

    // 1. Extract all media files from xl/media/
    const rawMediaFiles = new Map<string, ExtractedMediaItem>();

    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.startsWith('xl/media/') && !zipEntry.dir) {
        try {
          const rawBuffer = await zipEntry.async('nodebuffer');
          const ext = path.extname(relPath).toLowerCase();

          let format: 'JPEG' | 'PNG' = 'JPEG';
          let processedBuffer = rawBuffer;

          try {
            const meta = await sharp(rawBuffer).metadata();
            if (meta.format === 'png') {
              format = 'PNG';
              processedBuffer = await sharp(rawBuffer)
                .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
            } else {
              format = 'JPEG';
              processedBuffer = await sharp(rawBuffer)
                .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            }
          } catch {
            format = ext === '.png' ? 'PNG' : 'JPEG';
          }

          const base64 = processedBuffer.toString('base64');
          const mediaItem: ExtractedMediaItem = {
            base64,
            format,
          };

          rawMediaFiles.set(relPath, mediaItem);
          const baseName = path.basename(relPath);
          rawMediaFiles.set(baseName, mediaItem);
          rawMediaFiles.set(`../media/${baseName}`, mediaItem);

          store.allMedia.push(mediaItem);
          store.byName.set(cleanImageKey(baseName), mediaItem);
          store.byName.set(cleanImageKey(baseName.replace(/\.[^.]+$/, '')), mediaItem);
        } catch (mediaErr) {
          console.warn(`Failed to process media file ${relPath}:`, mediaErr);
        }
      }
    }

    // 2. Parse drawing relationships (xl/drawings/_rels/drawing*.xml.rels)
    const relsMap = new Map<string, Map<string, ExtractedMediaItem>>();

    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.startsWith('xl/drawings/_rels/drawing') && relPath.endsWith('.xml.rels')) {
        try {
          const relsXml = await zipEntry.async('string');
          const doc = parser.parseFromString(relsXml, 'text/xml');
          const relNodes = doc.getElementsByTagName('Relationship');
          const curRels = new Map<string, ExtractedMediaItem>();

          for (let i = 0; i < relNodes.length; i++) {
            const rEl = relNodes.item(i);
            const id = rEl?.getAttribute('Id') || '';
            const target = rEl?.getAttribute('Target') || '';
            if (id && target) {
              const targetBase = path.basename(target);
              const matched =
                rawMediaFiles.get(target) ||
                rawMediaFiles.get(targetBase) ||
                rawMediaFiles.get(`xl/media/${targetBase}`);
              if (matched) {
                curRels.set(id, matched);
              }
            }
          }

          const drawingName = relPath.replace('_rels/', '').replace('.rels', '');
          relsMap.set(drawingName, curRels);
          relsMap.set(path.basename(drawingName), curRels);
        } catch (e) {
          console.warn('Error reading drawing rels:', e);
        }
      }
    }

    // 3. Parse drawing XML files (xl/drawings/drawing*.xml)
    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.startsWith('xl/drawings/drawing') && relPath.endsWith('.xml')) {
        try {
          const drawingXml = await zipEntry.async('string');
          const doc = parser.parseFromString(drawingXml, 'text/xml');
          const curRels = relsMap.get(relPath) || relsMap.get(path.basename(relPath)) || new Map();

          const anchors = Array.from(doc.documentElement.childNodes).filter((n: any) => n.nodeType === 1);

          for (const anchor of anchors) {
            const el = anchor as any;
            const fromEl = el.getElementsByTagName('xdr:from').item(0) || el.getElementsByTagName('from').item(0);
            const rowEl = fromEl?.getElementsByTagName('xdr:row').item(0) || fromEl?.getElementsByTagName('row').item(0);
            const colEl = fromEl?.getElementsByTagName('xdr:col').item(0) || fromEl?.getElementsByTagName('col').item(0);

            const row0 = rowEl ? parseInt(rowEl.textContent || '-1', 10) : -1;
            const col0 = colEl ? parseInt(colEl.textContent || '-1', 10) : -1;

            const blipEl = el.getElementsByTagName('a:blip').item(0) || el.getElementsByTagName('blip').item(0);
            const rId = blipEl?.getAttribute('r:embed') || blipEl?.getAttribute('embed') || '';

            const cNvPrEl = el.getElementsByTagName('xdr:cNvPr').item(0) || el.getElementsByTagName('cNvPr').item(0);
            const name = cNvPrEl?.getAttribute('name') || '';
            const descr = cNvPrEl?.getAttribute('descr') || '';
            const title = cNvPrEl?.getAttribute('title') || '';

            const media = curRels.get(rId) || rawMediaFiles.get(name) || rawMediaFiles.get(path.basename(name));

            if (media) {
              if (row0 >= 0 && col0 >= 0) {
                const sheetRow = row0 + 1;
                const sheetCol = col0 + 1;
                store.byCell.set(`${sheetRow}:${sheetCol}`, media);
              }

              if (name) {
                store.byName.set(cleanImageKey(name), media);
                store.byName.set(cleanImageKey(path.basename(name)), media);
                store.byName.set(cleanImageKey(name.replace(/\.[^.]+$/, '')), media);
              }
              if (descr) {
                store.byName.set(cleanImageKey(descr), media);
              }
              if (title) {
                store.byName.set(cleanImageKey(title), media);
              }
            }
          }
        } catch (e) {
          console.warn('Error reading drawing xml:', e);
        }
      }
    }
  } catch (err) {
    console.error('Error extracting media from zip workbook:', err);
  }

  return store;
}

// Helper to detect photo columns beyond Foto4 to exclude ONLY from the PDF output
function isExcludedPdfPhotoColumn(headerName: string): boolean {
  const norm = headerName.toLowerCase().replace(/[\s_\-]/g, '');
  const match = norm.match(/^foto(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return num > 4; // Exclude Foto5, Foto6, ... Foto15 etc. from the PDF
  }
  return false;
}

// 4.1 Download PDF Landscape endpoint
app.get('/api/download-pdf/:downloadId', async (req, res) => {
  const downloadId = req.params.downloadId;
  const processedInfo = processedFiles.get(downloadId);

  if (!processedInfo || !fs.existsSync(processedInfo.filePath)) {
    return res.status(404).send('Arquivo para download PDF não encontrado ou já expirado.');
  }

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(processedInfo.filePath);
    const ws = wb.worksheets[0];

    if (!ws) {
      return res.status(400).send('Não foi possível ler as linhas da planilha para gerar o PDF.');
    }

    // Extract all embedded images from the processed Excel file
    const mediaStore = await extractMediaFromZipWorkbook(processedInfo.filePath);
    const eprLogoPng = await getEprLogoPng();

    const headerRow = ws.getRow(1);
    const totalCols = ws.columnCount;

    // Filter columns for PDF: include metadata columns and only photos up to Foto4
    const validPdfCols: { originalCol: number; header: string; isPhoto: boolean; photoNum?: number }[] = [];

    for (let c = 1; c <= totalCols; c++) {
      const cell = headerRow.getCell(c);
      const textVal = String(cell.text || cell.value || `Col ${c}`).trim();
      if (!textVal) continue;

      // Exclude Foto5, Foto6, ... Foto15 from the PDF output as requested
      if (isExcludedPdfPhotoColumn(textVal)) {
        continue;
      }

      const normCol = textVal.toLowerCase().replace(/[\s_\-]/g, '');
      const match = normCol.match(/^foto(\d+)$/);
      const isPhoto =
        match !== null ||
        normCol.startsWith('foto') ||
        normCol.includes('imagem') ||
        normCol.includes('fotografia') ||
        normCol.includes('img');
      const photoNum = match ? parseInt(match[1], 10) : undefined;

      validPdfCols.push({
        originalCol: c,
        header: textVal,
        isPhoto,
        photoNum,
      });
    }

    const headers = validPdfCols.map((c) => c.header);
    const dataRows: string[][] = [];
    const cellImages = new Map<string, ExtractedMediaItem>();
    const totalRows = ws.rowCount;
    let hasAnyImages = false;

    for (let r = 2; r <= totalRows; r++) {
      const row = ws.getRow(r);
      const rowData: string[] = [];
      let hasAnyData = false;
      const rowIndex = dataRows.length; // 0-based for autoTable

      for (let pdfColIdx = 0; pdfColIdx < validPdfCols.length; pdfColIdx++) {
        const colInfo = validPdfCols[pdfColIdx];
        const originalCol = colInfo.originalCol;
        const cell = row.getCell(originalCol);
        let valStr = '';

        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object' && 'text' in cell.value) {
            valStr = String((cell.value as any).text || '');
          } else if (typeof cell.value === 'object' && 'result' in cell.value) {
            valStr = String((cell.value as any).result || '');
          } else if (cell.value instanceof Date) {
            valStr = cell.value.toLocaleDateString('pt-BR');
          } else {
            valStr = String(cell.text || cell.value || '');
          }
        }

        const trimmedVal = valStr.trim();
        if (trimmedVal) hasAnyData = true;

        // Check if an image matches this cell
        let matchedImage: ExtractedMediaItem | undefined;

        // 1. Match by cell coordinate (r, originalCol)
        const cellKey = `${r}:${originalCol}`;
        if (mediaStore.byCell.has(cellKey)) {
          matchedImage = mediaStore.byCell.get(cellKey);
        }

        // 2. Match by cell filename text
        if (!matchedImage && trimmedVal) {
          const cleanKey = cleanImageKey(trimmedVal);
          const baseNameClean = cleanImageKey(path.basename(trimmedVal));
          const noExtClean = cleanImageKey(trimmedVal.replace(/\.[^.]+$/, ''));

          matchedImage =
            mediaStore.byName.get(cleanKey) ||
            mediaStore.byName.get(baseNameClean) ||
            mediaStore.byName.get(noExtClean);

          if (
            !matchedImage &&
            (cleanKey.includes('foto') ||
              cleanKey.includes('drenagem') ||
              cleanKey.includes('jpg') ||
              cleanKey.includes('png'))
          ) {
            for (const [k, img] of mediaStore.byName.entries()) {
              if (k.length > 5 && (cleanKey.includes(k) || k.includes(cleanKey))) {
                matchedImage = img;
                break;
              }
            }
          }
        }

        // 3. Match by photo column order if only sequential images exist
        if (
          !matchedImage &&
          colInfo.isPhoto &&
          trimmedVal &&
          (trimmedVal.endsWith('.jpg') ||
            trimmedVal.endsWith('.png') ||
            trimmedVal.endsWith('.jpeg'))
        ) {
          const simpleName = path.basename(trimmedVal).toLowerCase();
          for (const [k, img] of mediaStore.byName.entries()) {
            if (simpleName.includes(k) || k.includes(simpleName)) {
              matchedImage = img;
              break;
            }
          }
        }

        if (matchedImage) {
          cellImages.set(`${rowIndex}:${pdfColIdx}`, matchedImage);
          hasAnyImages = true;
          // When image exists, render blank text in cell so text doesn't overlap the photo
          rowData.push('');
        } else {
          rowData.push(trimmedVal);
        }
      }

      if (hasAnyData) {
        dataRows.push(rowData);
      }
    }

    // Generate PDF in Landscape format (A4: 297mm width x 210mm height)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const colCount = Math.max(1, headers.length);

    // Optimized typography for clean readability when photos 1 to 4 are displayed
    let fontSize = 7.0;
    let cellPadding = 1.2;
    if (colCount <= 8) {
      fontSize = 8.5;
      cellPadding = 1.8;
    } else if (colCount <= 12) {
      fontSize = 7.2;
      cellPadding = 1.3;
    } else if (colCount <= 16) {
      fontSize = 6.2;
      cellPadding = 1.0;
    } else {
      fontSize = 5.2;
      cellPadding = 0.8;
    }

    const featureName =
      processedInfo.featureType === 'drenagem_superficial'
        ? 'Drenagem Superficial'
        : 'Drenagem Profunda';

    // Calculate precise column widths so that the table fills 100% of the horizontal width (285mm)
    const totalUsableWidth = 285.0; // 297mm A4 width - 6mm left margin - 6mm right margin
    const photoCols = validPdfCols.filter((c) => c.isPhoto);
    const metaCols = validPdfCols.filter((c) => !c.isPhoto);

    // Calculate metadata column widths
    const metaWidthMap: Record<number, number> = {};
    let totalMetaWidth = 0;

    validPdfCols.forEach((col, idx) => {
      if (!col.isPhoto) {
        const headerLower = col.header.toLowerCase().replace(/[\s_\-]/g, '');
        let colW = 15.0;
        if (headerLower === 'codauto') colW = 14.0;
        else if (headerLower === 'km') colW = 14.0;
        else if (headerLower === 'rodovia') colW = 16.0;
        else if (headerLower === 'sentido') colW = 13.0;
        else if (headerLower === 'elemento') colW = 18.0;
        else if (headerLower.includes('limpeza') || headerLower.includes('reparar') || headerLower.includes('extensao')) colW = 15.0;
        else if (headerLower.includes('estado')) colW = 19.0;
        else colW = 15.0;

        metaWidthMap[idx] = colW;
        totalMetaWidth += colW;
      }
    });

    const photoColsCount = Math.max(1, photoCols.length);
    const remainingWidthForPhotos = Math.max(40, totalUsableWidth - totalMetaWidth);
    const individualPhotoWidth = remainingWidthForPhotos / photoColsCount;

    // Define column styles with calculated widths to reach the right margin (291mm)
    const columnStyles: Record<number, any> = {};
    validPdfCols.forEach((col, idx) => {
      if (col.isPhoto) {
        columnStyles[idx] = {
          cellWidth: individualPhotoWidth,
          halign: 'center',
          valign: 'middle',
        };
      } else {
        columnStyles[idx] = {
          cellWidth: metaWidthMap[idx] || 15.0,
          halign: 'center',
          valign: 'middle',
        };
      }
    });

    // Generous cell height for rows when photos are present (39.5mm allows photos up to 50mm x 37.5mm!)
    const photoCellHeight = Math.max(26.0, Math.min(42.0, ((individualPhotoWidth - 2.0) / 1.3333) + 2.5));
    const minCellHeight = hasAnyImages ? photoCellHeight : 5.0;

    autoTable(doc, {
      head: [headers],
      body: dataRows,
      startY: 23,
      margin: { top: 23, right: 6, bottom: 12, left: 6 },
      tableWidth: totalUsableWidth,
      theme: 'grid',
      columnStyles,
      styles: {
        fontSize,
        cellPadding,
        overflow: 'linebreak',
        halign: 'center',
        valign: 'middle',
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.1,
        textColor: [30, 41, 59], // slate-800
        minCellHeight,
      },
      headStyles: {
        fillColor: [7, 43, 74], // EPR Navy Blue #072b4a
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        fontSize: fontSize + 0.3,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      horizontalPageBreak: false,
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const key = `${data.row.index}:${data.column.index}`;
          const img = cellImages.get(key);
          if (img) {
            try {
              const pad = 1.0;
              const maxW = data.cell.width - pad * 2;
              const maxH = data.cell.height - pad * 2;

              // Maintain standard 4:3 photo aspect ratio inside the cell
              const targetRatio = 1.333;
              let imgW = maxW;
              let imgH = imgW / targetRatio;
              if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH * targetRatio;
              }

              const posX = data.cell.x + (data.cell.width - imgW) / 2;
              const posY = data.cell.y + (data.cell.height - imgH) / 2;

              doc.addImage(img.base64, img.format, posX, posY, imgW, imgH);

              // Subtle rounded border around photo
              doc.setDrawColor(203, 213, 225);
              doc.setLineWidth(0.12);
              doc.roundedRect(posX, posY, imgW, imgH, 0.4, 0.4, 'S');
            } catch (drawErr) {
              console.warn('Failed to embed cell photo in PDF:', drawErr);
            }
          }
        }
      },
      didDrawPage: () => {
        // Embed EPR Paraná Logo at top-left
        try {
          doc.addImage(eprLogoPng, 'PNG', 6, 3.5, 14.5, 14.5);
        } catch (logoErr) {
          console.warn('Failed to render EPR logo on PDF:', logoErr);
        }

        // Header Title
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(7, 43, 74); // EPR Navy #072b4a
        doc.text(`EPR PARANÁ • RELATÓRIO DE LEVANTAMENTO • ${featureName.toUpperCase()}`, 23.5, 8.5);

        // Header Subtitle
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139); // slate-500

        let filterText = '';
        if (processedInfo.appliedRodoviaFilter) {
          filterText += ` • Rodovia: ${processedInfo.appliedRodoviaFilter}`;
        }
        if (processedInfo.appliedEstadoFilter) {
          filterText += ` • Estado: ${processedInfo.appliedEstadoFilter}`;
        }

        const photosCountStr = hasAnyImages ? ` • Fotos 1 a 4 incorporadas` : '';
        const subtitle = `Arquivo: ${processedInfo.originalFileName} • Total: ${dataRows.length.toLocaleString('pt-BR')} registros • ${colCount} colunas no PDF${filterText}${photosCountStr}`;
        doc.text(subtitle, 23.5, 13.5);

        // Header Green Accent Divider Line
        doc.setDrawColor(103, 186, 123); // EPR Green #67ba7b
        doc.setLineWidth(0.4);
        doc.line(6, 19.5, 291, 19.5);
      },
    });

    // Page footer with pagination "Página X de Y" and timestamp
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // slate-400

      // Footer divider line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(6, 201, 291, 201);

      doc.text(
        `EPR Paraná • Sistema de Padronização de Drenagem • Gerado em ${new Date().toLocaleString('pt-BR')}`,
        6,
        205.5
      );
      doc.text(`Página ${i} de ${totalPages}`, 291, 205.5, { align: 'right' });
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const parsedName = path.parse(processedInfo.fileName);
    const pdfFileName = `${parsedName.name}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdfFileName}"; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`
    );

    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Erro ao gerar o arquivo PDF: ' + (error.message || 'Falha desconhecida'));
  }
});


// 5. Generate sample XLSX endpoint for quick testing using ExcelJS
app.post('/api/generate-sample', async (req, res) => {
  try {
    const { featureType = 'drenagem_profunda' } = req.body || {};
    const wb = new ExcelJS.Workbook();

    const isSuperficial = featureType === 'drenagem_superficial';
    const sheetTitle = isSuperficial ? 'Drenagem_Superficial' : 'Drenagem_Profunda';

    // 1st sheet: feature specific headers + extra fields to test removal
    const ws1 = wb.addWorksheet(sheetTitle);

    let roadHeaders: string[];
    if (isSuperficial) {
      roadHeaders = [
        'codAuto',
        'Elemento',
        'km',
        'Rodovia',
        'Sentido',
        'ExtensaoReparar',
        'ExtensaoLimpeza',
        'EstadoConservacao',
        'CodTrechoAntigo',
        'ObservacoesDescartadas',
        'CustoEstimado',
        'RascunhoInterno',
        'Foto1',
        'Foto2',
        'Foto3',
        'Foto4',
        'Foto5',
        'Foto6',
        'Foto7',
        'Foto8',
        'Foto9',
        'Foto10',
        'Foto11',
        'Foto12',
        'Foto13',
        'Foto14',
        'Foto15',
      ];
    } else {
      roadHeaders = [
        'codAuto',
        'km',
        'Rodovia',
        'Sentido',
        'repararEntorno',
        'Limpeza.',
        'CaixaDanificada.',
        'TampaDanificada/Inxistente',
        'EstadoConservacao',
        'CodTrechoAntigo',
        'ObservacoesDescartadas',
        'CustoEstimado',
        'RascunhoInterno',
        'Foto1',
        'Foto2',
        'Foto3',
        'Foto4',
        'Foto5',
        'Foto6',
        'Foto7',
        'Foto8',
        'Foto9',
        'Foto10',
        'Foto11',
        'Foto12',
        'Foto13',
        'Foto14',
        'Foto15',
      ];
    }

    ws1.columns = roadHeaders.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: 18,
    }));

    const highways = ['SP-330', 'SP-310', 'BR-116', 'SP-348', 'SP-070'];
    const yesNo = ['Sim', 'Não'];
    const conservations = ['BOM', 'REGULAR', 'PRECÁRIO'];
    const sentidos = ['Norte', 'Sul', 'Leste', 'Oeste'];
    const elementos = ['Valeta de Proteção', 'Sarjeta Triangular', 'Descida d\'Água', 'Meio-Fio'];

    for (let i = 1; i <= 250; i++) {
      if (isSuperficial) {
        ws1.addRow([
          1000 + i,
          elementos[i % elementos.length],
          (i * 1.5).toFixed(1),
          highways[i % highways.length],
          sentidos[i % sentidos.length],
          (i * 3.2).toFixed(1) + ' m',
          (i * 5.0).toFixed(1) + ' m',
          conservations[i % conservations.length],
          `ANTIGO-${i}`,
          `Anotação de descarte ${i}`,
          (1500 + i * 25).toFixed(2),
          `Rascunho interno nº ${i}`,
          `IMG_${i}_01.jpg`,
          `IMG_${i}_02.jpg`,
          `IMG_${i}_03.jpg`,
          `IMG_${i}_04.jpg`,
          `IMG_${i}_05.jpg`,
          `IMG_${i}_06.jpg`,
          `IMG_${i}_07.jpg`,
          `IMG_${i}_08.jpg`,
          `IMG_${i}_09.jpg`,
          `IMG_${i}_10.jpg`,
          `IMG_${i}_11.jpg`,
          `IMG_${i}_12.jpg`,
          `IMG_${i}_13.jpg`,
          `IMG_${i}_14.jpg`,
          `IMG_${i}_15.jpg`,
        ]);
      } else {
        ws1.addRow([
          1000 + i,
          (i * 1.5).toFixed(1),
          highways[i % highways.length],
          yesNo[i % 2],
          yesNo[(i + 1) % 2],
          yesNo[i % 3 === 0 ? 0 : 1],
          yesNo[i % 4 === 0 ? 0 : 1],
          conservations[i % conservations.length],
          `ANTIGO-${i}`,
          `Anotação de descarte ${i}`,
          (1500 + i * 25).toFixed(2),
          `Rascunho interno nº ${i}`,
          `IMG_${i}_01.jpg`,
          `IMG_${i}_02.jpg`,
          `IMG_${i}_03.jpg`,
          `IMG_${i}_04.jpg`,
          `IMG_${i}_05.jpg`,
          `IMG_${i}_06.jpg`,
          `IMG_${i}_07.jpg`,
          `IMG_${i}_08.jpg`,
          `IMG_${i}_09.jpg`,
          `IMG_${i}_10.jpg`,
          `IMG_${i}_11.jpg`,
          `IMG_${i}_12.jpg`,
          `IMG_${i}_13.jpg`,
          `IMG_${i}_14.jpg`,
          `IMG_${i}_15.jpg`,
        ]);
      }
    }

    // 2nd sheet: Colaboradores
    const ws2 = wb.addWorksheet('Colaboradores');
    const sampleHeaders = [
      'ID',
      'Nome Completo',
      'E-mail',
      'Cargo',
      'Departamento',
      'Salário Base (R$)',
      'Data de Admissão',
      'Status',
    ];

    ws2.columns = sampleHeaders.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: 18,
    }));

    for (let i = 1; i <= 50; i++) {
      ws2.addRow([
        i,
        `Colaborador ${i}`,
        `usuario${i}@empresa.com.br`,
        'Técnico de Campo',
        'Operações',
        4500 + i * 50,
        new Date(2022, 0, i),
        'Ativo',
      ]);
    }

    const sampleFileName = isSuperficial
      ? 'planilha_drenagem_superficial_exemplo.xlsx'
      : 'planilha_drenagem_profunda_exemplo.xlsx';
    const sampleFilePath = path.join(UPLOAD_DIR, `sample-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(sampleFilePath);

    const fileId = path.basename(sampleFilePath);
    const stat = fs.statSync(sampleFilePath);

    const sheetNames = wb.worksheets.map((w) => w.name);
    const activeSheet = sheetNames[0];
    const sheetDetails = await getSheetDetailsAsync(sampleFilePath, activeSheet);

    uploadedFiles.set(fileId, {
      fileId,
      originalName: sampleFileName,
      filePath: sampleFilePath,
      fileSize: stat.size,
      uploadedAt: Date.now(),
      sheetNames,
    });

    res.json({
      fileId,
      originalName: sampleFileName,
      fileSize: stat.size,
      sheetNames,
      activeSheet,
      sheetDetails,
      featureType,
    });
  } catch (error: any) {
    console.error('Error generating sample:', error);
    res.status(500).json({ error: 'Erro ao gerar planilha de teste: ' + error.message });
  }
});

// 6. Cleanup endpoint
app.delete('/api/cleanup/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fileInfo = uploadedFiles.get(fileId);
  if (fileInfo) {
    try {
      if (fs.existsSync(fileInfo.filePath)) {
        fs.unlinkSync(fileInfo.filePath);
      }
      uploadedFiles.delete(fileId);
    } catch (e) {
      console.error('Error unlinking uploaded file:', e);
    }
  }
  res.json({ status: 'ok' });
});

// Periodic cleanup of files older than 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;

  for (const [fileId, info] of uploadedFiles.entries()) {
    if (now - info.uploadedAt > maxAge) {
      try {
        if (fs.existsSync(info.filePath)) {
          fs.unlinkSync(info.filePath);
        }
      } catch (e) {}
      uploadedFiles.delete(fileId);
    }
  }

  for (const [downloadId, info] of processedFiles.entries()) {
    if (now - info.createdAt > maxAge) {
      try {
        if (fs.existsSync(info.filePath)) {
          fs.unlinkSync(info.filePath);
        }
      } catch (e) {}
      processedFiles.delete(downloadId);
    }
  }
}, 10 * 60 * 1000);

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

