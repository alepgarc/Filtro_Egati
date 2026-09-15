import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Detect Rodovia column index (1-based) and extract unique options
  let rodoviaColIdx = -1;
  for (let c = 1; c <= totalCols; c++) {
    const colName = headers[c - 1];
    if (isRodoviaCol(colName)) {
      rodoviaColIdx = c;
      break;
    }
  }

  const rodoviaOptions: string[] = [];
  if (rodoviaColIdx > 0) {
    const uniqueRodovias = new Set<string>();
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const cell = row.getCell(rodoviaColIdx);
        let val = '';
        if (cell.value !== null && cell.value !== undefined) {
          val = String(cell.text || cell.value).trim();
        }
        if (val) {
          uniqueRodovias.add(val);
        }
      }
    });
    rodoviaOptions.push(
      ...Array.from(uniqueRodovias).sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
      )
    );
  }

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
    totalRows,
    totalCols,
    previewRows,
    rodoviaOptions,
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
  const { fileId, sheetName, columnIndicesToRemove, estadoConservacaoFilter, rodoviaFilter } = req.body as {
    fileId: string;
    sheetName: string;
    columnIndicesToRemove: number[];
    estadoConservacaoFilter?: string | null;
    rodoviaFilter?: string | null;
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

    const parsedName = path.parse(fileInfo.originalName);
    const finalFileName = `${parsedName.name}_filtrada.xlsx`;

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
    });
  } catch (error: any) {
    console.error('Error processing spreadsheet with ZIP engine:', error);
    res.status(500).json({
      error: 'Erro durante o processamento da planilha: ' + (error.message || 'Falha desconhecida'),
    });
  }
});

// 4. Download endpoint
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

// 5. Generate sample XLSX endpoint for quick testing using ExcelJS
app.post('/api/generate-sample', async (_req, res) => {
  try {
    const wb = new ExcelJS.Workbook();

    // 1st sheet: Levantamento_Rodoviario with user's preset fields + extra fields
    const ws1 = wb.addWorksheet('Levantamento_Rodoviario');
    const roadHeaders = [
      'codAuto',
      'km',
      'Rodovia',
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

    ws1.columns = roadHeaders.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: 18,
    }));

    const highways = ['SP-330', 'SP-310', 'BR-116', 'SP-348', 'SP-070'];
    const yesNo = ['Sim', 'Não'];
    const conservations = ['BOM', 'REGULAR', 'PRECÁRIO'];

    for (let i = 1; i <= 250; i++) {
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

    const sampleFileName = 'planilha_levantamento_exemplo.xlsx';
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

