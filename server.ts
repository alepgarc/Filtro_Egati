import express from 'express';
import path from 'path';
import fs from 'fs';
import v8 from 'v8';
import { fileURLToPath } from 'url';

try {
  v8.setFlagsFromString('--max-old-space-size=3072');
} catch (v8Err) {
  console.warn('Could not set v8 flags:', v8Err);
}
import multer from 'multer';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createServer as createViteServer } from 'vite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';
import * as xlsxModule from 'xlsx';

const XLSX: any = (xlsxModule as any).default || xlsxModule;

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
  if (!col) return 0;
  const upper = col.toUpperCase();
  let idx = 0;
  for (let i = 0; i < upper.length; i++) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
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
const CHUNKS_DIR = path.join(TMP_BASE, 'chunks');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PROCESSED_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

// Body parser for JSON
app.use(express.json({ limit: '10mb' }));

// Multer storage for chunked uploads (each chunk ~10 MB, memory buffer)
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});

// Multer storage for files up to 100MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.xlsx').toLowerCase();
    const cleanExt = ext === '.xls' ? '.xls' : '.xlsx';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${uniqueSuffix}${cleanExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 600 * 1024 * 1024, // 600 MB max for large sheets with photos
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Formato inválido. Apenas arquivos .xlsx e .xls são permitidos.'));
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
  sheetName?: string;
}

const uploadedFiles = new Map<string, UploadedFileInfo>();
const processedFiles = new Map<string, ProcessedFileInfo>();

// Helpers for EstadoConservacao / Situação Retrorrefletancia and Rodovia column and filter detection
function normalizeString(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isTargetRowStatusCol(name: string, featureType?: string): boolean {
  if (!name) return false;
  const n = normalizeString(name);

  // Exclude non-status columns
  if (
    n === 'rodovia' ||
    n === 'rodovias' ||
    n === 'uf' ||
    n === 'km' ||
    n === 'sentido' ||
    n === 'bordo' ||
    n === 'cor' ||
    n === 'codauto' ||
    n === 'elemento' ||
    /^foto\d*$/.test(n)
  ) {
    return false;
  }

  // Feature-specific logic with fallback to broad status matching
  if (
    featureType === 'sinalizacao_horizontal_dispositivo' ||
    featureType === 'sinalizacao_horizontal_zebrado' ||
    featureType === 'sinalizacao_horizontal_marca_viaria'
  ) {
    if (
      n === 'resultadogeral' ||
      n === 'resultado' ||
      n.startsWith('resultado') ||
      n === 'status' ||
      n === 'situacao' ||
      n === 'situacaogeral' ||
      n === 'estado' ||
      n === 'estadoconservacao'
    ) {
      return true;
    }
  }

  if (featureType === 'eps_defensa') {
    if (
      n === 'aparenciageral' ||
      n === 'aparencia_geral' ||
      n === 'aparencia' ||
      n.startsWith('aparencia') ||
      n === 'estadoconservacao' ||
      n === 'estado_conservacao' ||
      n === 'estadodeconservacao' ||
      n.startsWith('estadoconservac') ||
      n === 'estado' ||
      n === 'condicao' ||
      n === 'situacao' ||
      n === 'status' ||
      n === 'resultado'
    ) {
      return true;
    }
  }

  if (featureType === 'sinalizacao_vertical') {
    if (
      n === 'situacaoretrorrefletancia' ||
      n === 'situacaoderetrorrefletancia' ||
      n === 'situacaoretrorefletancia' ||
      n === 'situacaoderetrorefletancia' ||
      n === 'retrorrefletancia' ||
      n.includes('retrorreflet') ||
      n.includes('retroreflet') ||
      n === 'situacao' ||
      n === 'resultado'
    ) {
      return true;
    }
  }

  if (featureType === 'drenagem_profunda' || featureType === 'drenagem_superficial') {
    if (
      n === 'estadoconservacao' ||
      n === 'estadodeconservacao' ||
      n.startsWith('estadoconservac') ||
      n === 'estado' ||
      n === 'situacao'
    ) {
      return true;
    }
  }

  // Universal fallback for any status column
  return (
    n === 'estadoconservacao' ||
    n === 'estadodeconservacao' ||
    n.startsWith('estadoconservac') ||
    n === 'situacaoretrorrefletancia' ||
    n === 'situacaoderetrorrefletancia' ||
    n === 'situacaoretrorefletancia' ||
    n === 'situacaoderetrorefletancia' ||
    n === 'retrorrefletancia' ||
    n.includes('retrorreflet') ||
    n.includes('retroreflet') ||
    n === 'resultadogeral' ||
    n === 'resultado' ||
    n.startsWith('resultado') ||
    n === 'status' ||
    n === 'situacao'
  );
}

function isEstadoConservacaoCol(name: string): boolean {
  return isTargetRowStatusCol(name);
}

function matchesEstadoFilter(cellValue: string, filter: string): boolean {
  if (!filter || filter.toUpperCase() === 'TODOS') return true;
  const cellNorm = normalizeString(cellValue);
  const filterNorm = normalizeString(filter);

  if (!cellNorm) return false;
  if (cellNorm === filterNorm) return true;
  if (cellNorm.includes(filterNorm) || filterNorm.includes(cellNorm)) return true;

  // Gender-neutral normalized matches
  const isFilterReprovado =
    filterNorm.startsWith('reprovad') ||
    filterNorm === 'nok' ||
    filterNorm === 'ruim' ||
    filterNorm.includes('ruim') ||
    filterNorm.includes('nc') ||
    filterNorm.includes('naoconforme') ||
    filterNorm.includes('pessimo');

  const isFilterRegular =
    filterNorm.startsWith('regula') ||
    filterNorm === 'reg' ||
    filterNorm === 'r';

  const isFilterAprovado =
    filterNorm.startsWith('aprovad') ||
    filterNorm === 'ok' ||
    filterNorm === 'b' ||
    filterNorm === 'boa' ||
    filterNorm.startsWith('bom') ||
    filterNorm.startsWith('boa') ||
    filterNorm.includes('bom') ||
    filterNorm.includes('conforme');

  const isFilterPrecario =
    filterNorm.startsWith('precar') ||
    filterNorm === 'pr' ||
    filterNorm === 'prec' ||
    filterNorm.includes('critico');

  const isFilterSuficiente =
    filterNorm.startsWith('sufic') ||
    filterNorm === 'su' ||
    filterNorm === 'sf' ||
    filterNorm === 's';

  if (isFilterReprovado) {
    return (
      cellNorm.startsWith('reprovad') ||
      cellNorm === 'nok' ||
      cellNorm === 'ruim' ||
      cellNorm.includes('ruim') ||
      cellNorm.includes('nc') ||
      cellNorm.includes('naoconforme') ||
      cellNorm.includes('pessimo')
    );
  }
  if (isFilterRegular) {
    return (
      cellNorm.startsWith('regula') ||
      cellNorm === 'reg' ||
      cellNorm === 'r'
    );
  }
  if (isFilterAprovado) {
    return (
      cellNorm.startsWith('aprovad') ||
      cellNorm === 'ok' ||
      cellNorm === 'b' ||
      cellNorm === 'boa' ||
      cellNorm.startsWith('bom') ||
      cellNorm.startsWith('boa') ||
      cellNorm.includes('bom') ||
      cellNorm.includes('conforme')
    );
  }
  if (isFilterPrecario) {
    return (
      cellNorm.startsWith('precar') ||
      cellNorm === 'pr' ||
      cellNorm === 'prec' ||
      cellNorm.includes('ruim') ||
      cellNorm.includes('pessimo') ||
      cellNorm.startsWith('reprovad') ||
      cellNorm.includes('critico')
    );
  }
  if (isFilterSuficiente) {
    return (
      cellNorm.startsWith('sufic') ||
      cellNorm === 'su' ||
      cellNorm === 'sf' ||
      cellNorm === 's'
    );
  }

  return false;
}

function isRodoviaCol(name: string): boolean {
  if (!name) return false;
  const n = normalizeString(name);
  return (
    n === 'rodovia' ||
    n === 'rodovias' ||
    n === 'br' ||
    n === 'pr' ||
    n === 'sc' ||
    n === 'rs' ||
    n === 'sp' ||
    n === 'mg' ||
    n === 'rod' ||
    n === 'trecho' ||
    n === 'rodoviauf' ||
    n === 'bruf' ||
    n === 'rodoviatrecho' ||
    n.startsWith('rodovia')
  );
}

function normalizeRodoviaForFeature(rodovia: string, featureType?: string): string {
  if (!rodovia) return '';
  const trimmed = rodovia.trim();
  if (featureType === 'eps_defensa') {
    const norm = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    // For EPS - Defensa, always treat any variation of BR-376 (e.g. BR-376 CN, BR-376 TU, BR-376 PR, BR-376/PR) as "BR/376"
    if (norm.includes('376')) {
      return 'BR/376';
    }
  }
  return trimmed;
}

function matchesRodoviaFilter(cellValue: string, filter: string, featureType?: string): boolean {
  if (!filter || filter.toUpperCase() === 'TODAS' || filter.toUpperCase() === 'TODOS') return true;
  if (!cellValue) return false;

  if (featureType === 'eps_defensa') {
    const normFilter = normalizeRodoviaForFeature(filter, 'eps_defensa');
    const normCell = normalizeRodoviaForFeature(cellValue, 'eps_defensa');
    if (normFilter === 'BR/376' && normCell === 'BR/376') {
      return true;
    }
  }

  const cNorm = normalizeString(cellValue);
  const fNorm = normalizeString(filter);
  if (cNorm === fNorm) return true;

  if (fNorm.includes('376') && cNorm.includes('376')) return true;

  const cClean = cNorm.replace(/[^a-z0-9]/g, '');
  const fClean = fNorm.replace(/[^a-z0-9]/g, '');
  if (cClean === fClean) return true;
  if (cClean.length > 0 && fClean.length > 0) {
    if (cClean.includes(fClean) || fClean.includes(cClean)) return true;
  }

  // Also match numbers if rodovia has digits (e.g. 323 or 376)
  const cDigits = cNorm.replace(/\D/g, '');
  const fDigits = fNorm.replace(/\D/g, '');
  if (cDigits && fDigits && cDigits === fDigits) return true;

  return false;
}

function isNumericSequenceRow(row: any[], nextRow?: any[]): boolean {
  if (!row || row.length === 0) return false;
  const nonEmpties = row.filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (nonEmpties.length === 0) return false;

  // Check how many cells are numeric / integers (e.g. 1, 4, 5, 8, "1", "4", "5", etc.)
  const numericCount = nonEmpties.filter((v) => {
    if (typeof v === 'number') return true;
    const str = String(v).trim();
    return /^\d+(\.0+)?$/.test(str);
  }).length;

  const isMostlyNumeric = numericCount / nonEmpties.length >= 0.5;

  if (nextRow && nextRow.length > 0) {
    const nextNonEmpties = nextRow.filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const nextAlphaCount = nextNonEmpties.filter((v) => {
      const str = String(v).trim();
      return /[a-zA-ZÀ-ÿ]/.test(str);
    }).length;
    if (isMostlyNumeric && nextAlphaCount >= 2) {
      return true;
    }
  }

  return isMostlyNumeric && nonEmpties.length >= 2;
}

// Helper to inspect a sheet with ExcelJS and SheetJS fallback
// Helper to inspect a sheet using SheetJS (XLSX) in a memory-safe, ultra-fast manner (bypasses raw image decompression)
async function getSheetDetailsAsync(
  filePath: string,
  sheetName: string,
  featureType?: string
) {
  try {
    // 1. First retrieve all sheet names cheaply without decompressing or parsing any worksheet XML
    let availableSheetNames: string[] = [];
    try {
      const namesWb = XLSX.readFile(filePath, { bookSheets: true });
      availableSheetNames = namesWb.SheetNames || [];
    } catch {
      availableSheetNames = [];
    }

    let targetSheetName =
      availableSheetNames.find(
        (sn) => sn === sheetName || sn.toLowerCase().trim() === sheetName.toLowerCase().trim()
      );

    if (!targetSheetName && sheetName) {
      const normTarget = normalizeString(sheetName);
      targetSheetName = availableSheetNames.find(
        (sn) => normalizeString(sn) === normTarget
      );
    }

    if (!targetSheetName && sheetName) {
      const normTarget = normalizeString(sheetName);
      targetSheetName = availableSheetNames.find(
        (sn) =>
          normalizeString(sn).includes(normTarget) ||
          normTarget.includes(normalizeString(sn)) ||
          normalizeString(sn).replace(/s$/g, '') === normTarget.replace(/s$/g, '')
      );
    }

    if (!targetSheetName) {
      targetSheetName = availableSheetNames[0] || sheetName;
    }

    // 2. Read ONLY the single targeted worksheet to keep memory and CPU low
    const workbook = XLSX.readFile(filePath, {
      sheets: targetSheetName ? [targetSheetName] : undefined,
      cellDates: true,
      dense: true,
    });

    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      return {
        headers: [],
        columns: [],
        totalRows: 0,
        totalCols: 0,
        previewRows: [],
        rodoviaOptions: [],
        rowFiltersData: [],
        rodoviaCounts: {},
        estadoCounts: {},
      };
    }

    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return {
        headers: [],
        columns: [],
        totalRows: 0,
        totalCols: 0,
        previewRows: [],
        rodoviaOptions: [],
        rowFiltersData: [],
        rodoviaCounts: {},
        estadoCounts: {},
      };
    }

    // Check if rawRows[0] is a numeric sequence row (e.g. 1, 4, 5, 8, 9, 10...)
    // If so, discard row 1 and use row 2 (rawRows[1]) as the header row containing real field names.
    let headerRowIdx = 0;
    if (rawRows.length > 1 && isNumericSequenceRow(rawRows[0], rawRows[1])) {
      headerRowIdx = 1;
    }

    const headerRow: string[] = (rawRows[headerRowIdx] || []).map((h, i) =>
      String(h || `Coluna ${idxToCol(i)}`).trim()
    );
    const columns = headerRow.map((name, index) => ({
      index,
      name,
      letter: idxToCol(index),
    }));

    let rodoviaColIdx = -1;
    let estadoColIdx = -1;
    headerRow.forEach((h, idx) => {
      if (isRodoviaCol(h)) rodoviaColIdx = idx;
      if (isTargetRowStatusCol(h, featureType)) estadoColIdx = idx;
    });

    const dataStartIdx = headerRowIdx + 1;
    const rowFiltersData: { r: string; e: string }[] = [];
    const rodoviaCounts: Record<string, number> = {};
    const estadoCounts: Record<string, number> = {};
    const uniqueRodovias = new Set<string>();

    for (let r = dataStartIdx; r < rawRows.length; r++) {
      const row = rawRows[r] || [];
      let rVal =
        rodoviaColIdx >= 0 && row[rodoviaColIdx] !== undefined && row[rodoviaColIdx] !== null
          ? String(row[rodoviaColIdx]).trim()
          : '';
      if (rVal && featureType === 'eps_defensa') {
        rVal = normalizeRodoviaForFeature(rVal, featureType);
      }
      const eVal =
        estadoColIdx >= 0 && row[estadoColIdx] !== undefined && row[estadoColIdx] !== null
          ? String(row[estadoColIdx]).trim()
          : '';

      rowFiltersData.push({ r: rVal, e: eVal });
      if (rVal) {
        uniqueRodovias.add(rVal);
        rodoviaCounts[rVal] = (rodoviaCounts[rVal] || 0) + 1;
      }
      if (eVal) {
        const normE = normalizeString(eVal);
        let matchedKey = '';

        if (featureType === 'eps_defensa') {
          if (normE === 'ruim' || normE.startsWith('ruim')) {
            matchedKey = 'Ruim';
          } else if (normE === 'regular' || normE.startsWith('regular')) {
            matchedKey = 'Regular';
          } else if (
            normE === 'boa' ||
            normE.startsWith('boa') ||
            normE === 'bom' ||
            normE.startsWith('bom')
          ) {
            matchedKey = 'Boa';
          } else {
            matchedKey = eVal;
          }
        } else if (normE === 'bom' || normE.startsWith('bom')) {
          matchedKey = 'BOM';
        } else if (normE === 'regular' || normE.startsWith('regular')) {
          matchedKey = 'REGULAR';
        } else if (normE === 'precario' || normE.startsWith('precario')) {
          matchedKey = 'PRECÁRIO';
        } else if (normE === 'aprovado' || normE.startsWith('aprovado') || normE === 'ok') {
          matchedKey = 'Aprovado';
        } else if (normE === 'reprovado' || normE.startsWith('reprovado') || normE === 'nok') {
          matchedKey = 'Reprovado';
        } else {
          // Case-insensitive lookup in existing keys to group duplicates
          const existingKeys = Object.keys(estadoCounts);
          const foundKey = existingKeys.find((k) => k.toLowerCase() === eVal.toLowerCase());
          matchedKey = foundKey || eVal;
        }

        estadoCounts[matchedKey] = (estadoCounts[matchedKey] || 0) + 1;
      }
    }

    const rodoviaOptions = Array.from(uniqueRodovias).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    const previewRows = rawRows.slice(dataStartIdx, dataStartIdx + 20).map((row) =>
      headerRow.map((_, colI) => {
        const v = row[colI];
        if (v instanceof Date) return v.toLocaleDateString('pt-BR');
        return v !== undefined && v !== null ? String(v) : '';
      })
    );

    return {
      headers: headerRow,
      columns,
      totalRows: rowFiltersData.length,
      totalCols: headerRow.length,
      previewRows,
      rodoviaOptions,
      rowFiltersData,
      rodoviaCounts,
      estadoCounts,
    };
  } catch (err) {
    console.error('Error reading sheet details with SheetJS:', err);
    return {
      headers: [],
      columns: [],
      totalRows: 0,
      totalCols: 0,
      previewRows: [],
      rodoviaOptions: [],
      rowFiltersData: [],
      rodoviaCounts: {},
      estadoCounts: {},
    };
  }
}

// Helper function to process completed upload (used by both direct upload and chunked upload)
async function processCompletedUpload(
  uploadedFilePath: string,
  originalName: string,
  fileSize: number,
  featureType: string
) {
  let filePath = uploadedFilePath;
  const originalExt = path.extname(originalName).toLowerCase();

  // If user uploaded a legacy .xls file, convert it to standard .xlsx
  if (originalExt === '.xls' || !filePath.toLowerCase().endsWith('.xlsx')) {
    const xlsxConvertedPath = path.join(
      UPLOAD_DIR,
      `${path.basename(filePath, path.extname(filePath))}-converted.xlsx`
    );
    await convertXlsToXlsxWithImages(filePath, xlsxConvertedPath);
    filePath = xlsxConvertedPath;
  }

  const fileId = path.basename(filePath);

  let sheetNames: string[] = [];
  try {
    const xlsxBook = XLSX.readFile(filePath, { bookSheets: true });
    sheetNames = xlsxBook.SheetNames || [];
  } catch (bookErr) {
    console.warn('XLSX bookSheets read failed, reading full workbook:', bookErr);
    const xlsxBook = XLSX.readFile(filePath);
    sheetNames = xlsxBook.SheetNames || [];
  }

  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('A planilha enviada não possui nenhuma aba válida.');
  }

  let activeSheet = sheetNames[0];

  // For EPS-Defensa, select first matching standard tab if present
  if (featureType === 'eps_defensa') {
    const expectedTabs = [
      'Barreira de Concreto',
      'Defensa Metalica',
      'Defensa OAE',
      'Barreiras de Concreto',
      'Defensas Metalicas',
      'Defensas',
      'Barreiras',
      'Defensa',
      'Barreira',
    ];
    const matched = sheetNames.find((sn) => {
      const normSn = normalizeString(sn);
      return expectedTabs.some((exp) => {
        const normExp = normalizeString(exp);
        return normSn === normExp || normSn.includes(normExp) || normExp.includes(normSn);
      });
    });
    if (matched) activeSheet = matched;
  }

  const sheetDetails = await getSheetDetailsAsync(filePath, activeSheet, featureType);

  uploadedFiles.set(fileId, {
    fileId,
    originalName,
    filePath,
    fileSize,
    uploadedAt: Date.now(),
    sheetNames,
  });

  return {
    fileId,
    originalName,
    fileSize,
    sheetNames,
    activeSheet,
    sheetDetails,
    featureType,
  };
}

// Keep track of active assemblies to prevent race condition if duplicate chunk packets arrive
const activeAssemblies = new Set<string>();

// Endpoint to check health and keep proxy session active
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Endpoint to check chunk upload status (allows resuming if needed)
app.get('/api/upload-status/:uploadId', (req, res) => {
  const uploadId = String(req.params.uploadId || '').replace(/[^a-zA-Z0-9_\-]/g, '');
  if (!uploadId) return res.status(400).json({ error: 'ID inválido' });
  const uploadChunkDir = path.join(CHUNKS_DIR, uploadId);
  if (!fs.existsSync(uploadChunkDir)) {
    return res.json({ parts: [] });
  }
  try {
    const parts = fs
      .readdirSync(uploadChunkDir)
      .filter((f) => f.endsWith('.part'))
      .map((f) => parseInt(f.replace('.part', ''), 10))
      .filter((n) => !isNaN(n));
    return res.json({ parts });
  } catch {
    return res.json({ parts: [] });
  }
});

// 1. Chunked Upload endpoint (bypasses Cloud Run / proxy 32MB payload limit for large files)
app.post('/api/upload-chunk', (req, res) => {
  chunkUpload.single('chunk')(req, res, async (err) => {
    if (err) {
      console.error('Chunk upload error:', err);
      return res.status(400).json({
        error: err.message || 'Falha ao enviar parte do arquivo.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum pedaço de arquivo recebido.' });
    }

    try {
      const chunkIndex = parseInt(req.body.chunkIndex, 10);
      const totalChunks = parseInt(req.body.totalChunks, 10);
      const uploadId = String(req.body.uploadId || '').replace(/[^a-zA-Z0-9_\-]/g, '');
      const rawFileName = req.body.fileName || 'planilha.xlsx';
      let fileName = rawFileName;
      try {
        fileName = Buffer.from(rawFileName, 'latin1').toString('utf8');
      } catch {
        fileName = rawFileName;
      }
      const featureType = (req.body.featureType as string) || 'drenagem_profunda';

      if (isNaN(chunkIndex) || isNaN(totalChunks) || !uploadId) {
        return res.status(400).json({ error: 'Parâmetros de fatiamento do upload inválidos.' });
      }

      const uploadChunkDir = path.join(CHUNKS_DIR, uploadId);
      if (!fs.existsSync(uploadChunkDir)) {
        fs.mkdirSync(uploadChunkDir, { recursive: true });
      }

      const partPath = path.join(uploadChunkDir, `${chunkIndex}.part`);
      fs.writeFileSync(partPath, req.file.buffer);

      // Check if all parts from 0 to totalChunks - 1 are present on disk
      const partFiles = fs.readdirSync(uploadChunkDir).filter((f) => f.endsWith('.part'));
      const allPartsExist =
        partFiles.length === totalChunks &&
        Array.from({ length: totalChunks }).every((_, i) =>
          fs.existsSync(path.join(uploadChunkDir, `${i}.part`))
        );

      if (!allPartsExist || activeAssemblies.has(uploadId)) {
        return res.json({
          status: 'chunk_received',
          chunkIndex,
          totalChunks,
          receivedCount: partFiles.length,
        });
      }

      // Mark assembly active for this uploadId
      activeAssemblies.add(uploadId);

      try {
        // All chunks received: Assemble chunks sequentially into the final file
        console.log(`[Upload] All ${totalChunks} chunks received for ${uploadId}. Assembling final file...`);
        const originalExt = path.extname(fileName).toLowerCase();
        const cleanExt = originalExt === '.xls' ? '.xls' : '.xlsx';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const finalFileName = `upload-${uniqueSuffix}${cleanExt}`;
        const finalFilePath = path.join(UPLOAD_DIR, finalFileName);

        fs.writeFileSync(finalFilePath, Buffer.alloc(0));
        for (let i = 0; i < totalChunks; i++) {
          const currentPart = path.join(uploadChunkDir, `${i}.part`);
          if (!fs.existsSync(currentPart)) {
            throw new Error(`Parte ${i + 1} de ${totalChunks} não foi encontrada durante a montagem.`);
          }
          const partBuf = fs.readFileSync(currentPart);
          fs.appendFileSync(finalFilePath, partBuf);
        }

        // Cleanup chunks folder
        try {
          fs.rmSync(uploadChunkDir, { recursive: true, force: true });
        } catch (rmErr) {
          console.warn('Could not remove chunk dir:', rmErr);
        }

        const stat = fs.statSync(finalFilePath);
        console.log(`[Upload] File assembled: ${finalFilePath} (${stat.size} bytes). Processing...`);
        const result = await processCompletedUpload(finalFilePath, fileName, stat.size, featureType);
        console.log(`[Upload] Successfully processed ${fileName} (${result.sheetNames.length} sheets)`);

        res.setHeader('Content-Type', 'application/json');
        return res.json(result);
      } finally {
        activeAssemblies.delete(uploadId);
      }
    } catch (chunkErr: any) {
      console.error('Error assembling chunked file:', chunkErr);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error:
          'Erro ao processar planilha enviada: ' +
          (chunkErr.message || 'Arquivo corrompido ou falha no upload.'),
      });
    }
  });
});

// 2. Direct Upload endpoint (for files submitted as single multipart request)
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'O arquivo excede o limite máximo permitido de 600 MB.',
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
      let originalName = req.file.originalname;
      try {
        originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      } catch {
        originalName = req.file.originalname;
      }
      const featureType = (req.body?.featureType as string) || 'drenagem_profunda';

      const result = await processCompletedUpload(
        filePath,
        originalName,
        req.file.size,
        featureType
      );

      res.setHeader('Content-Type', 'application/json');
      return res.json(result);
    } catch (parseError: any) {
      console.error('Error parsing uploaded file:', parseError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error:
          'Erro ao processar planilha Excel: ' +
          (parseError.message || 'Arquivo corrompido ou formato não suportado.'),
      });
    }
  });
});

// 2. Switch Sheet preview and details endpoints
const handleSheetDetails = async (req: express.Request, res: express.Response) => {
  const fileId = (req.params.fileId || req.query.fileId) as string;
  const sheetName = (req.params.sheetName || req.query.sheetName) as string;
  const featureType = (req.query.featureType as string) || undefined;

  if (!fileId || !sheetName) {
    return res.status(400).json({ error: 'Parâmetros fileId e sheetName são obrigatórios.' });
  }

  const fileInfo = uploadedFiles.get(fileId);
  if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado ou sessão expirada.' });
  }

  try {
    const sheetDetails = await getSheetDetailsAsync(fileInfo.filePath, sheetName, featureType);
    res.json({
      sheetName,
      sheetDetails,
      ...sheetDetails,
    });
  } catch (error: any) {
    console.error('Error fetching sheet preview:', error);
    res.status(500).json({ error: 'Falha ao carregar prévia da aba: ' + error.message });
  }
};

app.get('/api/sheet-preview', handleSheetDetails);
app.get('/api/sheet-details/:fileId/:sheetName', handleSheetDetails);

function getRelsNodes(dom: any): any[] {
  if (!dom) return [];
  const r1 = Array.from(dom.getElementsByTagName('Relationship'));
  const r2 = Array.from(dom.getElementsByTagNameNS('*', 'Relationship'));
  const relsSet = new Set([...r1, ...r2]);
  return Array.from(relsSet);
}

async function findSheetXmlPath(
  zip: JSZip,
  parser: DOMParser,
  sheetNameTarget: string
): Promise<string> {
  let targetRelId: string | null = null;
  if (zip.files['xl/workbook.xml']) {
    const wbXmlStr = await zip.files['xl/workbook.xml'].async('string');
    const wbDom = parser.parseFromString(wbXmlStr, 'text/xml');
    
    const s1 = Array.from(wbDom.getElementsByTagName('sheet'));
    const s2 = Array.from(wbDom.getElementsByTagNameNS('*', 'sheet'));
    const sheetsSet = new Set([...s1, ...s2]);
    const sheets = Array.from(sheetsSet);

    const getSheetRelId = (sheetEl: any): string | null => {
      if (!sheetEl) return null;
      let id = sheetEl.getAttribute('r:id') || sheetEl.getAttribute('id') || null;
      if (!id && sheetEl.attributes) {
        for (let j = 0; j < sheetEl.attributes.length; j++) {
          const attr = sheetEl.attributes.item(j);
          if (attr && (attr.name === 'r:id' || attr.name === 'id' || attr.name.endsWith(':id') || attr.localName === 'id')) {
            id = attr.value;
            break;
          }
        }
      }
      return id;
    };

    // 1. Exact or lowercase trimmed match
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const name = (s as any)?.getAttribute('name') || '';
      if (
        name === sheetNameTarget ||
        name.trim().toLowerCase() === sheetNameTarget?.trim().toLowerCase()
      ) {
        targetRelId = getSheetRelId(s);
        break;
      }
    }

    // 2. Normalized match (accents removed, whitespace and symbols collapsed)
    if (!targetRelId && sheetNameTarget) {
      const normTarget = normalizeString(sheetNameTarget);
      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        const name = (s as any)?.getAttribute('name') || '';
        if (normalizeString(name) === normTarget) {
          targetRelId = getSheetRelId(s);
          break;
        }
      }
    }

    // 3. Substring inclusion
    if (!targetRelId && sheetNameTarget) {
      const normTarget = normalizeString(sheetNameTarget);
      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        const name = (s as any)?.getAttribute('name') || '';
        const normName = normalizeString(name);
        if (normName.includes(normTarget) || normTarget.includes(normName)) {
          targetRelId = getSheetRelId(s);
          break;
        }
      }
    }

    // 4. Fallback to first sheet
    if (!targetRelId && sheets.length > 0) {
      const first = sheets[0];
      targetRelId = getSheetRelId(first);
    }
  }

  // Resolve targetRelId in xl/_rels/workbook.xml.rels
  let sheetPath = '';
  if (targetRelId && zip.files['xl/_rels/workbook.xml.rels']) {
    const relsXmlStr = await zip.files['xl/_rels/workbook.xml.rels'].async('string');
    const relsDom = parser.parseFromString(relsXmlStr, 'text/xml');
    const rels = getRelsNodes(relsDom);
    for (const r of rels) {
      const relId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
      if (relId === targetRelId) {
        let t = r?.getAttribute('Target') || r?.getAttribute('target') || '';
        if (t.startsWith('/')) t = t.substring(1);
        if (!t.startsWith('xl/')) t = 'xl/' + t;
        sheetPath = t;
        break;
      }
    }
  }

  if (!sheetPath || !zip.files[sheetPath]) {
    const anySheet = Object.keys(zip.files).find(
      (f) => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml')
    );
    if (anySheet) {
      sheetPath = anySheet;
    }
  }

  if (!sheetPath || !zip.files[sheetPath]) {
    throw new Error(`Arquivo XML da aba "${sheetNameTarget}" não foi encontrado no arquivo Excel.`);
  }

  return sheetPath;
}

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
  rodoviaFilter?: string | null,
  featureType?: string
) {
  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const removeSet = new Set(columnIndicesToRemove);

  // 1. Locate target sheet relationship ID and XML path using robust matching
  const sheetPath = await findSheetXmlPath(zip, parser, sheetNameTarget);

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
    // If all columns were marked for removal or empty set, gracefully keep all columns
    for (let c = 0; c < totalCols; c++) {
      keepIndices.add(c);
    }
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

  // 4. Identify if Row 1 is a sequence number / numeric row and find header row (Row 1 or Row 2)
  let isRow1NumericSeq = false;
  const row1Vals: string[] = [];
  const row2Vals: string[] = [];

  for (let i = 0; i < cNodes.length; i++) {
    const cEl = cNodes.item(i);
    const rAttr = cEl?.getAttribute('r');
    if (rAttr) {
      if (/^[A-Z]+1$/.test(rAttr)) {
        const val = getCellTextValue(cEl, sharedStrings).trim();
        if (val) row1Vals.push(val);
      } else if (/^[A-Z]+2$/.test(rAttr)) {
        const val = getCellTextValue(cEl, sharedStrings).trim();
        if (val) row2Vals.push(val);
      }
    }
  }

  if (row1Vals.length > 0 && row2Vals.length > 0) {
    const r1NumCount = row1Vals.filter((v) => /^\d+(\.0+)?$/.test(v)).length;
    const r2AlphaCount = row2Vals.filter((v) => /[a-zA-ZÀ-ÿ]/.test(v)).length;
    if (r1NumCount / row1Vals.length >= 0.5 && r2AlphaCount >= 2) {
      isRow1NumericSeq = true;
    }
  }

  const headerRowNumber = isRow1NumericSeq ? 2 : 1;
  const dataStartRowNumber = headerRowNumber + 1; // 3 if isRow1NumericSeq else 2

  // Identify EstadoConservacao, Rodovia, and Km columns in header (Row 1 or Row 2)
  let estadoConservacaoColLetter: string | null = null;
  let rodoviaColLetter: string | null = null;
  let kmColLetter: string | null = null;
  const headerRowMatchRegex = new RegExp(`^[A-Z]+${headerRowNumber}$`);
  const headerStripRegex = new RegExp(`${headerRowNumber}$`);

  for (let i = 0; i < cNodes.length; i++) {
    const cEl = cNodes.item(i);
    const rAttr = cEl?.getAttribute('r');
    if (rAttr && headerRowMatchRegex.test(rAttr)) {
      const colLetter = rAttr.replace(headerStripRegex, '');
      const headerVal = getCellTextValue(cEl, sharedStrings);
      if (isTargetRowStatusCol(headerVal, featureType)) {
        estadoConservacaoColLetter = colLetter;
      }
      if (isRodoviaCol(headerVal)) {
        rodoviaColLetter = colLetter;
      }
      const normH = String(headerVal || '').toLowerCase().trim();
      if (normH === 'km' || normH === 'kmlegenda' || normH === 'km_legenda' || (!kmColLetter && normH.includes('km'))) {
        kmColLetter = colLetter;
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

  function parseKmValue(val: string): number {
    if (!val) return 99999999;
    const clean = val.replace(/km/i, '').trim();
    if (clean.includes('+')) {
      const parts = clean.split('+');
      const km = parseFloat(parts[0].replace(',', '.')) || 0;
      const m = parseFloat(parts[1].replace(',', '.')) || 0;
      return km + m / 1000;
    }
    const parsed = parseFloat(clean.replace(',', '.'));
    return isNaN(parsed) ? 99999999 : parsed;
  }

  // 5. Build list of matching rows, retrieve KM for sorting, and identify rows to remove
  const rowsToRemove: any[] = [];
  const rowNodes = sheetDom.getElementsByTagName('row');
  let originalDataRowsCount = 0;
  let keptDataRowsCount = 0;

  interface KeptRowItem {
    rowEl: any;
    origR: number;
    kmVal: number;
  }
  const keptRowsList: KeptRowItem[] = [];

  for (let i = 0; i < rowNodes.length; i++) {
    const rowEl = rowNodes.item(i);
    if (!rowEl) continue;
    const rNum = parseInt(rowEl.getAttribute('r') || '0', 10);
    if (rNum <= 0) continue;
    if (rNum < dataStartRowNumber) {
      if (isRow1NumericSeq && rNum === 1) {
        rowsToRemove.push(rowEl);
      }
      continue;
    }

    originalDataRowsCount++;

    let matchesEstado = true;
    let matchesRodovia = true;
    const cChildren = rowEl.getElementsByTagName('c');

    if (isEstadoFilterActive) {
      let cellVal = '';
      const targetCellRef = `${estadoConservacaoColLetter}${rNum}`.toUpperCase();
      for (let j = 0; j < cChildren.length; j++) {
        const c = cChildren.item(j);
        if (c?.getAttribute('r')?.toUpperCase() === targetCellRef) {
          cellVal = getCellTextValue(c, sharedStrings);
          break;
        }
      }
      matchesEstado = matchesEstadoFilter(cellVal, estadoConservacaoFilter!);
    }

    if (isRodoviaFilterActive) {
      let cellVal = '';
      const targetCellRef = `${rodoviaColLetter}${rNum}`.toUpperCase();
      for (let j = 0; j < cChildren.length; j++) {
        const c = cChildren.item(j);
        if (c?.getAttribute('r')?.toUpperCase() === targetCellRef) {
          cellVal = getCellTextValue(c, sharedStrings);
          break;
        }
      }
      matchesRodovia = matchesRodoviaFilter(cellVal, rodoviaFilter!, featureType);
    }

    if (matchesEstado && matchesRodovia) {
      let kmStr = '';
      if (kmColLetter) {
        const kmCellRef = `${kmColLetter}${rNum}`.toUpperCase();
        for (let j = 0; j < cChildren.length; j++) {
          const c = cChildren.item(j);
          if (c?.getAttribute('r')?.toUpperCase() === kmCellRef) {
            kmStr = getCellTextValue(c, sharedStrings);
            break;
          }
        }
      }
      const kmVal = parseKmValue(kmStr);
      keptRowsList.push({ rowEl, origR: rNum, kmVal });
      keptDataRowsCount++;
    } else {
      rowsToRemove.push(rowEl);
    }
  }

  // Sort kept rows numerically by KM
  keptRowsList.sort((a, b) => a.kmVal - b.kmVal);

  const newRowMap = new Map<number, number>();
  if (isRow1NumericSeq) {
    // Row 2 (the header with actual field names) becomes Row 1 in the output
    newRowMap.set(2, 1);
  } else {
    newRowMap.set(1, 1); // Row 1 is kept as row 1
  }

  let nextNewRow = 2;
  for (const item of keptRowsList) {
    newRowMap.set(item.origR, nextNewRow);
    nextNewRow++;
  }

  // Remove rows from sheet DOM that did not match the filter
  rowsToRemove.forEach((r) => {
    if (r && r.parentNode) {
      r.parentNode.removeChild(r);
    }
  });

  // Renumber remaining row elements and update spans using static snapshot
  const remainingRows = Array.from(sheetDom.getElementsByTagName('row'));
  remainingRows.forEach((rowEl) => {
    const origR = parseInt(rowEl.getAttribute('r') || '0', 10);
    if (newRowMap.has(origR)) {
      const newR = newRowMap.get(origR)!;
      rowEl.setAttribute('r', String(newR));
      if (rowEl.hasAttribute('spans')) {
        rowEl.setAttribute('spans', `1:${Math.max(1, keepIndices.size)}`);
      }
    } else {
      if (rowEl.parentNode) {
        rowEl.parentNode.removeChild(rowEl);
      }
    }
  });

  // 6. Update or remove cell elements <c> across the entire sheet
  const allCNodes = Array.from(sheetDom.getElementsByTagName('c'));
  const cellsToRemove: any[] = [];
  for (let i = 0; i < allCNodes.length; i++) {
    const cEl = allCNodes[i];
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

  // Physically sort <row> elements in ascending order and sort <c> elements left-to-right
  const sheetData = sheetDom.getElementsByTagName('sheetData').item(0);
  if (sheetData) {
    const rows = Array.from(sheetData.getElementsByTagName('row'));
    rows.sort((a, b) => {
      const rA = parseInt(a.getAttribute('r') || '0', 10);
      const rB = parseInt(b.getAttribute('r') || '0', 10);
      return rA - rB;
    });
    rows.forEach((r) => {
      sheetData.appendChild(r);
      const cells = Array.from(r.getElementsByTagName('c'));
      cells.sort((a, b) => {
        const rA = a.getAttribute('r') || '';
        const rB = b.getAttribute('r') || '';
        const matchA = rA.match(/^([A-Z]+)/);
        const matchB = rB.match(/^([A-Z]+)/);
        const colA = matchA ? colToIdx(matchA[1]) : 0;
        const colB = matchB ? colToIdx(matchB[1]) : 0;
        return colA - colB;
      });
      cells.forEach((c) => {
        // Strip formula tags <f> if present to avoid broken references
        const fTags = Array.from(c.getElementsByTagName('f'));
        fTags.forEach((f) => {
          if (f.parentNode) f.parentNode.removeChild(f);
        });
        r.appendChild(c);
      });
    });
  }

  // Remove sheet protection to prevent password/hash validation corruption on modified sheets
  const protNodes = Array.from(sheetDom.getElementsByTagName('sheetProtection'));
  protNodes.forEach((p) => {
    if (p.parentNode) p.parentNode.removeChild(p);
  });

  const finalMaxRow = nextNewRow - 1;

  // 7. Update <dimension ref="..." />
  const dimNodes = sheetDom.getElementsByTagName('dimension');
  if (dimNodes.length > 0) {
    const lastColStr = idxToCol(Math.max(0, keepIndices.size - 1));
    dimNodes.item(0)?.setAttribute('ref', `A1:${lastColStr}${Math.max(1, finalMaxRow)}`);
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

      // If cols has no children left, remove it from sheetDom to avoid XML schema violation
      if (colsEl.getElementsByTagName('col').length === 0) {
        if (colsEl.parentNode) {
          colsEl.parentNode.removeChild(colsEl);
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
      if (finalMaxRow <= 1) {
        // If there are no data rows, remove the autoFilter element because an autoFilter on header only causes schema repair issues
        if (afEl.parentNode) {
          afEl.parentNode.removeChild(afEl);
        }
      } else {
        const lastColStr = idxToCol(Math.max(0, keepIndices.size - 1));
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

  // 12. Update Drawing XML file for THIS sheet only (xl/drawings/drawing*.xml)
  const sheetRelsPath = sheetPath
    .replace('worksheets/', 'worksheets/_rels/')
    .replace('.xml', '.xml.rels');

  let sheetDrawingRelId: string | null = null;
  const drawingNodes = sheetDom.getElementsByTagName('drawing');
  if (drawingNodes.length > 0) {
    const dn = drawingNodes.item(0);
    sheetDrawingRelId = dn?.getAttribute('r:id') || dn?.getAttribute('id') || null;
    if (!sheetDrawingRelId && dn?.attributes) {
      for (let j = 0; j < dn.attributes.length; j++) {
        const attr = dn.attributes.item(j);
        if (attr && (attr.name === 'r:id' || attr.name === 'id' || attr.name.endsWith(':id'))) {
          sheetDrawingRelId = attr.value;
          break;
        }
      }
    }
  }

  let thisSheetDrawingFile: string | null = null;
  if (sheetDrawingRelId && zip.files[sheetRelsPath]) {
    const sRelsStr = await zip.files[sheetRelsPath].async('string');
    const sRelsDom = parser.parseFromString(sRelsStr, 'text/xml');
    const rels = getRelsNodes(sRelsDom);
    for (const r of rels) {
      const relId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
      if (relId === sheetDrawingRelId) {
        let target = r?.getAttribute('Target') || r?.getAttribute('target') || '';
        if (target.startsWith('../')) target = target.substring(3);
        if (!target.startsWith('xl/')) target = 'xl/' + target;
        if (zip.files[target]) {
          thisSheetDrawingFile = target;
        }
        break;
      }
    }
  }

  if (thisSheetDrawingFile && zip.files[thisSheetDrawingFile]) {
    const filename = thisSheetDrawingFile;
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
            const toRowEl = toRowElTag(toEl);
            if (toRowEl) {
              const toOrigRow0 = parseInt(toRowEl.textContent || '0', 10);
              const rowDiff = toOrigRow0 - origRow0;
              toRowEl.textContent = String(newRow1 - 1 + rowDiff);
            }
          }
        }

        if (colEl) {
          const oldC = parseInt(colEl.textContent || '0', 10);
          if (!keepIndices.has(oldC)) {
            // Column was removed! Remove this drawing anchor
            anchorsToRemove.push(anchor);
            continue;
          }

          const newC = newColIdxMap.get(oldC)!;
          colEl.textContent = String(newC);

          const toEl =
            (anchor as any).getElementsByTagName('xdr:to').item(0) ||
            (anchor as any).getElementsByTagName('to').item(0);
          if (toEl) {
            const toColEl =
              toEl.getElementsByTagName('xdr:col').item(0) ||
              toEl.getElementsByTagName('col').item(0);
            if (toColEl) {
              const toOldC = parseInt(toColEl.textContent || '0', 10);
              const colDiff = toOldC - oldC;
              toColEl.textContent = String(newC + colDiff);
            }
          }
        }
      }
    }

    anchorsToRemove.forEach((a) => {
      if (a && a.parentNode) a.parentNode.removeChild(a);
    });

    zip.file(filename, serializer.serializeToString(dDom));

    // Prune unreferenced relationships in this drawing's .rels file
    const drawingRelsPath = filename
      .replace('drawings/', 'drawings/_rels/')
      .replace('.xml', '.xml.rels');

    if (zip.files[drawingRelsPath]) {
      try {
        const dRelsStr = await zip.files[drawingRelsPath].async('string');
        const dRelsDom = parser.parseFromString(dRelsStr, 'text/xml');
        const dRelsNodes = getRelsNodes(dRelsDom);

        // Find all r:embed or embed or link attributes currently used in remaining drawing anchors
        const usedEmbedIds = new Set<string>();
        const allElements = dDom.getElementsByTagName('*');
        for (let k = 0; k < allElements.length; k++) {
          const el = allElements.item(k);
          if (el && el.attributes) {
            for (let a = 0; a < el.attributes.length; a++) {
              const attr = el.attributes.item(a);
              if (
                attr &&
                (attr.name === 'r:embed' ||
                  attr.name === 'r:link' ||
                  attr.name.endsWith(':embed') ||
                  attr.name.endsWith(':link') ||
                  attr.localName === 'embed')
              ) {
                if (attr.value) usedEmbedIds.add(attr.value);
              }
            }
          }
        }

        const dRelsToRemove: any[] = [];
        for (let i = 0; i < dRelsNodes.length; i++) {
          const r = dRelsNodes[i];
          const relId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
          if (relId && !usedEmbedIds.has(relId)) {
            dRelsToRemove.push(r);
          }
        }
        dRelsToRemove.forEach((r) => {
          if (r && r.parentNode) r.parentNode.removeChild(r);
        });
        zip.file(drawingRelsPath, serializer.serializeToString(dRelsDom));
      } catch (err) {
        console.warn(`Could not prune drawing rels in ${drawingRelsPath}:`, err);
      }
    }
  }

  // 13. Update Table XML file for THIS sheet only if present
  let sheetTableRelIds: string[] = [];
  const tablePartNodes = sheetDom.getElementsByTagName('tablePart');
  for (let i = 0; i < tablePartNodes.length; i++) {
    const tp = tablePartNodes.item(i);
    const rid = tp?.getAttribute('r:id') || tp?.getAttribute('id');
    if (rid) sheetTableRelIds.push(rid);
  }

  if (sheetTableRelIds.length > 0 && zip.files[sheetRelsPath]) {
    if (finalMaxRow <= 1) {
      // Remove tablePart from sheetDom so Excel does not attempt to parse an empty table
      const tpNodes = Array.from(sheetDom.getElementsByTagName('tablePart'));
      tpNodes.forEach((tp) => {
        if (tp.parentNode) tp.parentNode.removeChild(tp);
      });
      const tpParents = Array.from(sheetDom.getElementsByTagName('tableParts'));
      tpParents.forEach((tpp) => {
        if (tpp.parentNode) tpp.parentNode.removeChild(tpp);
      });
    } else {
      const sRelsStr = await zip.files[sheetRelsPath].async('string');
      const sRelsDom = parser.parseFromString(sRelsStr, 'text/xml');
      const rels = getRelsNodes(sRelsDom);

      for (const rid of sheetTableRelIds) {
        for (let i = 0; i < rels.length; i++) {
          const r = rels[i];
          const relId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
          if (relId === rid) {
            let target = r?.getAttribute('Target') || r?.getAttribute('target') || '';
            if (target.startsWith('../')) target = target.substring(3);
            if (!target.startsWith('xl/')) target = 'xl/' + target;
            if (zip.files[target]) {
              const filename = target;
              const tXmlStr = await zip.files[filename].async('string');
              const tDom = parser.parseFromString(tXmlStr, 'text/xml');

              const tableEls = tDom.getElementsByTagName('table');
              if (tableEls.length > 0) {
                const tEl = tableEls.item(0);
                if (tEl) {
                  const origRef = tEl.getAttribute('ref') || 'A1:A1';
                  const rangeParts = origRef.split(':');
                  const startCell = rangeParts[0] || 'A1';
                  const lastColStr = idxToCol(Math.max(0, keepIndices.size - 1));
                  tEl.setAttribute('ref', `${startCell}:${lastColStr}${finalMaxRow}`);
                }
              }

              const tcNodes = tDom.getElementsByTagName('tableColumn');
              const tcToRemove: any[] = [];
              for (let j = 0; j < tcNodes.length; j++) {
                const tc = tcNodes.item(j);
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
            break;
          }
        }
      }
    }
  }

  // 14. If calcChain.xml exists, remove it so Excel rebuilds formulas cleanly without repair warnings
  if (zip.files['xl/calcChain.xml']) {
    zip.remove('xl/calcChain.xml');

    if (zip.files['xl/_rels/workbook.xml.rels']) {
      const relsStr = await zip.files['xl/_rels/workbook.xml.rels'].async('string');
      const relsDom = parser.parseFromString(relsStr, 'text/xml');
      const rels = getRelsNodes(relsDom);
      const toRemove: any[] = [];
      for (let i = 0; i < rels.length; i++) {
        const r = rels[i];
        const t = r?.getAttribute('Target') || r?.getAttribute('target');
        if (t === 'calcChain.xml' || t === '/xl/calcChain.xml' || t?.endsWith('calcChain.xml')) {
          toRemove.push(r);
        }
      }
      toRemove.forEach((r) => {
        if (r && r.parentNode) r.parentNode.removeChild(r);
      });
      zip.file('xl/_rels/workbook.xml.rels', serializer.serializeToString(relsDom));
    }
  }

  // Save the modified sheetDom back to zip to ensure all modifications are committed
  zip.file(sheetPath, serializer.serializeToString(sheetDom));

  // 15. Isolate target sheet in multi-sheet workbooks (remove unused sheets and their drawings)
  try {
    if (zip.files['xl/workbook.xml'] && zip.files['xl/_rels/workbook.xml.rels']) {
      const wbXmlStr = await zip.files['xl/workbook.xml'].async('string');
      const wbDom = parser.parseFromString(wbXmlStr, 'text/xml');
      const s1 = Array.from(wbDom.getElementsByTagName('sheet'));
      const s2 = Array.from(wbDom.getElementsByTagNameNS('*', 'sheet'));
      const allSheets = Array.from(new Set([...s1, ...s2]));

      const wbRelsStr = await zip.files['xl/_rels/workbook.xml.rels'].async('string');
      const wbRelsDom = parser.parseFromString(wbRelsStr, 'text/xml');
      const wbRelsNodes = getRelsNodes(wbRelsDom);

      // Find which relationship ID corresponds to our target sheetPath
      const targetSheetBase = path.basename(sheetPath);
      let targetSheetRelId = '';
      for (const r of wbRelsNodes) {
        const target = r?.getAttribute('Target') || r?.getAttribute('target') || '';
        if (
          target === sheetPath ||
          target === `worksheets/${targetSheetBase}` ||
          target.endsWith(targetSheetBase)
        ) {
          targetSheetRelId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
          break;
        }
      }

      if (allSheets.length > 1 && targetSheetRelId) {
        // Remove other sheets from workbook.xml
        for (const s of allSheets) {
          const sEl = s as any;
          const rId = sEl.getAttribute('r:id') || sEl.getAttribute('id');
          if (rId !== targetSheetRelId) {
            if (sEl.parentNode) sEl.parentNode.removeChild(sEl);
          } else {
            sEl.setAttribute('sheetId', '1');
          }
        }

        // Remove other worksheet relationships from xl/_rels/workbook.xml.rels
        const wbRelsToRemove: any[] = [];
        for (const r of wbRelsNodes) {
          const type = r?.getAttribute('Type') || r?.getAttribute('type') || '';
          const relId = r?.getAttribute('Id') || r?.getAttribute('id') || '';
          if (type.includes('worksheet') && relId !== targetSheetRelId) {
            wbRelsToRemove.push(r);
          }
        }
        wbRelsToRemove.forEach((r) => {
          if (r && r.parentNode) r.parentNode.removeChild(r);
        });

        // Save updated workbook.xml and workbook.xml.rels
        zip.file('xl/workbook.xml', serializer.serializeToString(wbDom));
        zip.file('xl/_rels/workbook.xml.rels', serializer.serializeToString(wbRelsDom));

        // Remove all other worksheet files and unneeded drawing files from the zip
        const targetDrawingBase = thisSheetDrawingFile ? path.basename(thisSheetDrawingFile) : '';
        for (const f of Object.keys(zip.files)) {
          if (f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml') && f !== sheetPath) {
            zip.remove(f);
          } else if (
            f.startsWith('xl/worksheets/_rels/sheet') &&
            f.endsWith('.xml.rels') &&
            f !== sheetRelsPath
          ) {
            zip.remove(f);
          } else if (
            f.startsWith('xl/drawings/drawing') &&
            f.endsWith('.xml') &&
            targetDrawingBase &&
            !f.endsWith(targetDrawingBase)
          ) {
            zip.remove(f);
          } else if (
            f.startsWith('xl/drawings/_rels/drawing') &&
            f.endsWith('.xml.rels') &&
            targetDrawingBase &&
            !f.includes(targetDrawingBase)
          ) {
            zip.remove(f);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not isolate target sheet in workbook.xml:', err);
  }

  // 16. Prune orphaned images from xl/media/ (drastically reduces file size and network payload)
  try {
    const activeMediaTargets = new Set<string>();

    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.endsWith('.rels')) {
        try {
          const relsXml = await zipEntry.async('string');
          const doc = parser.parseFromString(relsXml, 'text/xml');
          const relNodes = getRelsNodes(doc);
          for (let i = 0; i < relNodes.length; i++) {
            const rEl = relNodes[i];
            const target = rEl?.getAttribute('Target') || rEl?.getAttribute('target') || '';
            if (target && (target.includes('media/') || target.match(/\.(png|jpe?g|bmp|gif|webp)$/i))) {
              const baseName = path.basename(target).toLowerCase();
              activeMediaTargets.add(baseName);
              let fullPath = target;
              if (fullPath.startsWith('../')) fullPath = fullPath.substring(3);
              if (!fullPath.startsWith('xl/')) fullPath = 'xl/' + fullPath;
              activeMediaTargets.add(fullPath.toLowerCase());
            }
          }
        } catch {}
      }
    }

    for (const f of Object.keys(zip.files)) {
      if (f.startsWith('xl/media/') && !f.endsWith('/')) {
        const baseName = path.basename(f).toLowerCase();
        const fLower = f.toLowerCase();
        if (!activeMediaTargets.has(baseName) && !activeMediaTargets.has(fLower)) {
          zip.remove(f);
        }
      }
    }
  } catch (err) {
    console.warn('Could not prune orphaned media from xl/media/:', err);
  }

  // 17. Clean [Content_Types].xml of any removed files
  try {
    if (zip.files['[Content_Types].xml']) {
      const ctStr = await zip.files['[Content_Types].xml'].async('string');
      const ctDom = parser.parseFromString(ctStr, 'text/xml');
      const overrides = ctDom.getElementsByTagName('Override');
      const toRemove: any[] = [];
      for (let i = 0; i < overrides.length; i++) {
        const o = overrides.item(i);
        const p = o?.getAttribute('PartName') || '';
        const cleanP = p.startsWith('/') ? p.substring(1) : p;
        if (cleanP && !zip.files[cleanP]) {
          toRemove.push(o);
        }
      }
      toRemove.forEach((o) => {
        if (o && o.parentNode) o.parentNode.removeChild(o);
      });
      zip.file('[Content_Types].xml', serializer.serializeToString(ctDom));
    }
  } catch (err) {
    console.warn('Could not clean [Content_Types].xml:', err);
  }

  // 18. Ensure all remaining worksheets in the workbook have view and cursor positioned at cell A1
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('xl/worksheets/sheet') && filename.endsWith('.xml')) {
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

  // Output new zip buffer directly (fully compliant OpenXML with all drawings, styles, XML relationships, and views preserved)
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
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  let sheetViews = doc.getElementsByTagName('sheetViews').item(0) || doc.getElementsByTagNameNS('*', 'sheetViews').item(0);
  if (!sheetViews) {
    sheetViews = doc.createElementNS(ns, 'sheetViews');
    const sheetData = doc.getElementsByTagName('sheetData').item(0) || doc.getElementsByTagNameNS('*', 'sheetData').item(0);
    if (sheetData && sheetData.parentNode) {
      sheetData.parentNode.insertBefore(sheetViews, sheetData);
    } else if (doc.documentElement) {
      doc.documentElement.insertBefore(sheetViews, doc.documentElement.firstChild);
    }
  }

  const svList = sheetViews.getElementsByTagName('sheetView');
  if (svList.length === 0) {
    const sv = doc.createElementNS(ns, 'sheetView');
    sv.setAttribute('workbookViewId', '0');
    sv.setAttribute('tabSelected', '1');
    sv.setAttribute('topLeftCell', 'A1');
    const sel = doc.createElementNS(ns, 'selection');
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

      // If pane exists, keep valid topLeftCell (e.g. A2) instead of removing it
      const panes = sv.getElementsByTagName('pane');
      for (let p = 0; p < panes.length; p++) {
        const pane = panes.item(p);
        if (pane) {
          const pt = pane.getAttribute('topLeftCell');
          if (!pt || !pt.match(/^[A-C][1-5]$/i)) {
            pane.setAttribute('topLeftCell', 'A2');
          }
        }
      }

      // Update or create selection elements with proper namespace so active cell is A1
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
        const sel = doc.createElementNS(ns, 'selection');
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

function extractCleanRodoviaName(rodovia: string | null | undefined): string {
  if (!rodovia) return 'Geral';
  const trimmed = rodovia.trim();
  if (!trimmed || trimmed.toLowerCase().includes('todas') || trimmed.toLowerCase() === 'geral') {
    return 'Geral';
  }

  const match = trimmed.match(/\b([A-Za-z]{2})[\s\/\-_]?(\d{2,4})\b/);
  if (match) {
    return `${match[1].toUpperCase()}-${match[2]}`;
  }

  return trimmed
    .replace(/[\/\\:*?"<>|\r\n]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '');
}

function getAreaIdentifier(featureType: string, sheetName?: string): string | null {
  switch (featureType) {
    case 'drenagem_superficial':
      return '_DrenSuperficial_';
    case 'drenagem_profunda':
      return '_DrenProfunda_';
    case 'sinalizacao_horizontal_dispositivo':
      return '_SinHoriz_Dispositivo_';
    case 'sinalizacao_horizontal_marca_viaria':
      return '_SinHoriz_MarcaViaria_';
    case 'sinalizacao_horizontal_zebrado':
      return '_SinHoriz_Zebrado_';
    case 'sinalizacao_vertical':
      return '_SinVertical_';
    case 'eps_defensa': {
      const s = (sheetName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (s.includes('barreira') || s.includes('concreto')) {
        return '_EPS_BarrConcreto_';
      }
      if (s.includes('metalica')) {
        return '_EPS_DefensaMetalica_';
      }
      if (s.includes('oea') || s.includes('oae')) {
        return '_EPS_Defensa OEA_';
      }
      return '_EPS_Defensa_';
    }
    default:
      return null;
  }
}

function buildStandardFileName(params: {
  parcialNumber?: number | string | null;
  featureType: string;
  sheetName?: string;
  rodoviaFilter?: string | null;
  extension?: 'xlsx' | 'pdf' | 'xls';
  fallbackOriginalName?: string;
  estadoConservacaoFilter?: string | null;
}): string {
  const {
    parcialNumber,
    featureType,
    sheetName,
    rodoviaFilter,
    extension = 'xlsx',
    fallbackOriginalName,
    estadoConservacaoFilter,
  } = params;

  const rawNum =
    parcialNumber !== undefined && parcialNumber !== null
      ? String(parcialNumber).replace(/\D/g, '')
      : '1';
  const num = rawNum || '1';
  const parcialPart = `Parcial ${num}`;
  const areaPart = getAreaIdentifier(featureType, sheetName);
  const rodoviaPart = extractCleanRodoviaName(rodoviaFilter);

  if (areaPart) {
    return `${parcialPart}${areaPart}${rodoviaPart}.${extension}`;
  }

  // Fallback to legacy format if not mapped
  const baseName = fallbackOriginalName
    ? fallbackOriginalName.replace(/\.[^/.]+$/, '')
    : 'planilha_filtrada';
  const safeRodovia = rodoviaFilter ? rodoviaFilter.replace(/[\/\\:*?"<>|]/g, '-').trim() : '';
  const safeEstado = estadoConservacaoFilter
    ? estadoConservacaoFilter.replace(/[\/\\:*?"<>|]/g, '-').trim()
    : '';

  let suffix = '_filtrada';
  if (safeRodovia && safeEstado) {
    suffix = `_${safeRodovia}_${safeEstado}`;
  } else if (safeRodovia) {
    suffix = `_${safeRodovia}`;
  } else if (safeEstado) {
    suffix = `_${safeEstado}`;
  }

  return `${baseName}${suffix}.${extension}`;
}

// 3. Process endpoint
app.post('/api/process', async (req, res) => {
  const {
    fileId,
    sheetName,
    columnIndicesToRemove,
    estadoConservacaoFilter,
    rodoviaFilter,
    featureType,
    customFileName,
    parcialNumber,
  } = req.body as {
    fileId: string;
    sheetName: string;
    columnIndicesToRemove: number[];
    estadoConservacaoFilter?: string | null;
    rodoviaFilter?: string | null;
    featureType?: string;
    customFileName?: string;
    parcialNumber?: number | string | null;
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
      rodoviaFilter,
      featureType
    );

    let finalFileName = customFileName ? customFileName.trim() : '';
    if (!finalFileName) {
      finalFileName = buildStandardFileName({
        parcialNumber,
        featureType: featureType || 'drenagem_profunda',
        sheetName,
        rodoviaFilter,
        extension: 'xlsx',
        fallbackOriginalName: fileInfo.originalName,
        estadoConservacaoFilter,
      });
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
      sheetName,
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
  try {
    const downloadId = req.params.downloadId;
    const processedInfo = processedFiles.get(downloadId);

    if (!processedInfo || !fs.existsSync(processedInfo.filePath)) {
      return res.status(404).json({ error: 'Arquivo para download não encontrado ou já expirado.' });
    }

    const stat = fs.statSync(processedInfo.filePath);
    const cleanFileName = (processedInfo.fileName || 'planilha_filtrada.xlsx')
      .replace(/[\/\\:*?"<>|\r\n]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    const asciiFileName = cleanFileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`
    );

    const fileStream = fs.createReadStream(processedInfo.filePath);
    fileStream.on('error', (err) => {
      console.error('File stream error in /api/download:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao ler arquivo.' });
      }
    });
    fileStream.pipe(res);
  } catch (err: any) {
    console.error('Error in /api/download:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao processar download: ' + (err?.message || 'Falha interna') });
    }
  }
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

interface ExtractedRawImage {
  buffer: Buffer;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
  nameKey?: string;
}

function getWorkbookStream(buf: Buffer): Buffer {
  if (buf.length < 512) return buf;
  if (buf.readUInt32LE(0) !== 0xE011CFD0 || buf.readUInt32LE(4) !== 0xE11AB1A1) return buf;

  const sectorSize = 1 << buf.readUInt16LE(30);
  const miniSectorSize = 1 << buf.readUInt16LE(32);
  const dirStartSector = buf.readUInt32LE(48);
  const miniFatStartSec = buf.readUInt32LE(60);
  const minSizeStandardStream = buf.readUInt32LE(56);

  const difatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = buf.readUInt32LE(76 + i * 4);
    if (s < 0xFFFFFFFC) difatSectors.push(s);
  }

  const fat: number[] = [];
  for (const fSec of difatSectors) {
    const offset = (fSec + 1) * sectorSize;
    if (offset + sectorSize > buf.length) break;
    for (let i = 0; i < sectorSize; i += 4) {
      fat.push(buf.readUInt32LE(offset + i));
    }
  }

  let dirBuf = Buffer.alloc(0);
  let sec = dirStartSector;
  const visitedDir = new Set();
  while (sec < 0xFFFFFFFC && !visitedDir.has(sec)) {
    visitedDir.add(sec);
    const offset = (sec + 1) * sectorSize;
    if (offset + sectorSize > buf.length) break;
    dirBuf = Buffer.concat([dirBuf, buf.subarray(offset, offset + sectorSize)]);
    sec = fat[sec] !== undefined ? fat[sec] : 0xFFFFFFFF;
  }

  let workbookEntry = null;
  let rootEntry = null;
  for (let i = 0; i < dirBuf.length; i += 128) {
    const entry = dirBuf.subarray(i, i + 128);
    if (entry.length < 128) break;
    const nameLen = entry.readUInt16LE(64);
    if (nameLen === 0) continue;
    const name = entry.toString("utf16le", 0, nameLen - 2);
    const startSec = entry.readUInt32LE(116);
    const size = entry.readUInt32LE(120);
    if (name === "Root Entry") rootEntry = { startSec, size };
    else if (name === "Workbook" || name === "Book") workbookEntry = { startSec, size };
  }

  if (!workbookEntry) return buf;

  const miniFat = [];
  sec = miniFatStartSec;
  const visitedMiniFat = new Set();
  while (sec < 0xFFFFFFFC && !visitedMiniFat.has(sec)) {
    visitedMiniFat.add(sec);
    const offset = (sec + 1) * sectorSize;
    if (offset + sectorSize > buf.length) break;
    for (let i = 0; i < sectorSize; i += 4) {
      miniFat.push(buf.readUInt32LE(offset + i));
    }
    sec = fat[sec] !== undefined ? fat[sec] : 0xFFFFFFFF;
  }

  let miniStream = Buffer.alloc(0);
  if (rootEntry) {
    sec = rootEntry.startSec;
    const visitedRoot = new Set();
    while (sec < 0xFFFFFFFC && !visitedRoot.has(sec)) {
      visitedRoot.add(sec);
      const offset = (sec + 1) * sectorSize;
      if (offset + sectorSize > buf.length) break;
      miniStream = Buffer.concat([miniStream, buf.subarray(offset, offset + sectorSize)]);
      sec = fat[sec] !== undefined ? fat[sec] : 0xFFFFFFFF;
    }
  }

  let streamBuf = Buffer.alloc(0);
  if (workbookEntry.size < minSizeStandardStream) {
    sec = workbookEntry.startSec;
    const visitedStream = new Set();
    while (sec < 0xFFFFFFFC && !visitedStream.has(sec)) {
      visitedStream.add(sec);
      const offset = sec * miniSectorSize;
      if (offset + miniSectorSize > miniStream.length) break;
      streamBuf = Buffer.concat([streamBuf, miniStream.subarray(offset, offset + miniSectorSize)]);
      sec = miniFat[sec] !== undefined ? miniFat[sec] : 0xFFFFFFFF;
    }
  } else {
    sec = workbookEntry.startSec;
    const visitedStream = new Set();
    while (sec < 0xFFFFFFFC && !visitedStream.has(sec)) {
      visitedStream.add(sec);
      const offset = (sec + 1) * sectorSize;
      if (offset + sectorSize > buf.length) break;
      streamBuf = Buffer.concat([streamBuf, buf.subarray(offset, offset + sectorSize)]);
      sec = fat[sec] !== undefined ? fat[sec] : 0xFFFFFFFF;
    }
  }
  return streamBuf.subarray(0, workbookEntry.size);
}

async function extractImagesFromBuffer(buf: Buffer): Promise<ExtractedRawImage[]> {
  const images: ExtractedRawImage[] = [];
  if (!buf || buf.length < 500) return images;

  // Re-assemble Workbook stream to remove OLE2 sector / BIFF record continuation fragment headers
  const wbStream = getWorkbookStream(buf);

  // Parse BIFF8 records to build drawing streams
  const drawingStreams: Buffer[] = [];
  let currentDrawingPayloads: Buffer[] = [];

  let pos = 0;
  while (pos < wbStream.length - 4) {
    const type = wbStream.readUInt16LE(pos);
    const len = wbStream.readUInt16LE(pos + 2);
    pos += 4;

    if (pos + len > wbStream.length) break;
    const payload = wbStream.subarray(pos, pos + len);
    pos += len;

    if (type === 0x00EC || type === 0x00EB) {
      // MSODRAWING or MSODRAWINGGROUP
      if (currentDrawingPayloads.length > 0) {
        drawingStreams.push(Buffer.concat(currentDrawingPayloads));
        currentDrawingPayloads = [];
      }
      currentDrawingPayloads.push(payload);
    } else if (type === 0x003C) {
      // CONTINUE
      if (currentDrawingPayloads.length > 0) {
        currentDrawingPayloads.push(payload);
      }
    } else {
      // Other record type
      if (currentDrawingPayloads.length > 0) {
        drawingStreams.push(Buffer.concat(currentDrawingPayloads));
        currentDrawingPayloads = [];
      }
    }
  }
  if (currentDrawingPayloads.length > 0) {
    drawingStreams.push(Buffer.concat(currentDrawingPayloads));
  }

  // Scan clean contiguous drawing streams for JPEGs and PNGs
  for (const dStream of drawingStreams) {
    // 1. Scan for JPEGs (FF D8 FF)
    let p = 0;
    while (p < dStream.length - 4) {
      if (dStream[p] === 0xFF && dStream[p + 1] === 0xD8 && dStream[p + 2] === 0xFF) {
        let end = p + 3;
        while (end < dStream.length - 1) {
          if (dStream[end] === 0xFF && dStream[end + 1] === 0xD9) {
            const jpegLen = (end + 2) - p;
            const candidate = dStream.subarray(p, p + jpegLen);
            if (candidate.length > 200) {
              let w = 120;
              let h = 90;
              let nameKey: string | undefined = undefined;
              try {
                const meta = await sharp(candidate).metadata();
                if (meta && meta.width && meta.height) {
                  w = meta.width;
                  h = meta.height;
                }
              } catch {}

              try {
                const strSample = candidate.toString('binary');
                const match =
                  strSample.match(/(Legenda_[A-Za-z0-9_\+\-\.]+)/i) ||
                  strSample.match(/(Foto\d+_[A-Za-z0-9_\+\-\.]+)/i) ||
                  strSample.match(/([A-Za-z0-9_\+\-]+\.jpg)/i);
                if (match) {
                  nameKey = cleanImageKey(match[1]);
                }
              } catch {}

              images.push({
                buffer: candidate,
                format: 'JPEG',
                width: w,
                height: h,
                nameKey,
              });
            }
            p = end + 1;
            break;
          }
          end++;
        }
      }
      p++;
    }

    // 2. Scan for PNGs (Header: 89 50 4E 47 0D 0A 1A 0A)
    p = 0;
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const pngIend = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);

    while (p < dStream.length - 8) {
      if (dStream.subarray(p, p + 8).equals(pngHeader)) {
        let iendIdx = dStream.indexOf(pngIend, p + 8);
        if (iendIdx !== -1) {
          const candidate = dStream.subarray(p, iendIdx + 8);
          if (candidate.length > 200) {
            try {
              const meta = await sharp(candidate).metadata();
              if (meta && meta.width && meta.height) {
                images.push({
                  buffer: candidate,
                  format: 'PNG',
                  width: meta.width,
                  height: meta.height,
                });
                p = iendIdx + 8;
                continue;
              }
            } catch {}
          }
        }
      }
      p++;
    }
  }

  // Fallback: If no images found inside clean drawings streams, scan raw buffer
  if (images.length === 0) {
    let p = 0;
    while (p < buf.length - 4) {
      if (buf[p] === 0xFF && buf[p + 1] === 0xD8 && buf[p + 2] === 0xFF) {
        let end = p + 3;
        while (end < buf.length - 1) {
          if (buf[end] === 0xFF && buf[end + 1] === 0xD9) {
            const jpegLen = (end + 2) - p;
            const candidate = buf.subarray(p, p + jpegLen);
            if (candidate.length > 500) {
              let w = 120;
              let h = 90;
              let nameKey: string | undefined = undefined;
              try {
                const meta = await sharp(candidate).metadata();
                if (meta && meta.width && meta.height) {
                  w = meta.width;
                  h = meta.height;
                }
              } catch {}

              try {
                const strSample = candidate.toString('binary');
                const match =
                  strSample.match(/(Legenda_[A-Za-z0-9_\+\-\.]+)/i) ||
                  strSample.match(/(Foto\d+_[A-Za-z0-9_\+\-\.]+)/i) ||
                  strSample.match(/([A-Za-z0-9_\+\-]+\.jpg)/i);
                if (match) {
                  nameKey = cleanImageKey(match[1]);
                }
              } catch {}

              images.push({
                buffer: candidate,
                format: 'JPEG',
                width: w,
                height: h,
                nameKey,
              });
            }
            p = end + 1;
            break;
          }
          end++;
        }
      }
      p++;
    }
  }

  return images;
}

function extractAnchorsFromBiff8(buf: Buffer): { col1: number; row1: number; col2: number; row2: number }[] {
  const anchors: { col1: number; row1: number; col2: number; row2: number }[] = [];
  let pos = 0;
  while (pos < buf.length - 8) {
    if (buf[pos + 2] === 0x10 && buf[pos + 3] === 0xf0) {
      const recLen = buf.readUInt32LE(pos + 4);
      if (recLen >= 18 && pos + 8 + recLen <= buf.length) {
        const payload = buf.subarray(pos + 8, pos + 8 + recLen);
        const col1 = payload.readUInt16LE(2);
        const row1 = payload.readUInt16LE(6);
        const col2 = payload.readUInt16LE(10);
        const row2 = payload.readUInt16LE(14);
        if (row1 >= 0 && col1 >= 0 && row1 < 20000 && col1 < 500) {
          anchors.push({ col1, row1, col2, row2 });
        }
        pos += 8 + recLen;
        continue;
      }
    }
    pos++;
  }
  return anchors;
}

function formatWorksheetLayout(ws: ExcelJS.Worksheet) {
  if (!ws || ws.rowCount === 0) return;

  const headerRow = ws.getRow(1);
  const totalCols = Math.max(ws.columnCount, ws.actualColumnCount || 0);
  if (totalCols === 0) return;

  // 1. Detect photo columns
  const photoColIndices = new Set<number>();
  for (let c = 1; c <= totalCols; c++) {
    const headerVal = String(headerRow.getCell(c).value || '').toLowerCase().replace(/[\s_\-]/g, '');
    if (
      headerVal.includes('foto') ||
      headerVal.includes('imagem') ||
      headerVal.includes('fotografia') ||
      headerVal.includes('img')
    ) {
      photoColIndices.add(c);
    }
  }

  // Also check if any images are anchored in columns
  try {
    const images = (ws as any).getImages ? (ws as any).getImages() : [];
    images.forEach((img: any) => {
      if (img && img.range && img.range.tl) {
        const colIdx = Math.floor(img.range.tl.col) + 1;
        photoColIndices.add(colIdx);
      }
    });
  } catch {}

  const hasPhotos = photoColIndices.size > 0;

  // 2. Format Header Row (Row 1)
  headerRow.height = 28;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFD1D5DB' } },
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  }

  // 3. Format Data Rows (Row 2..N)
  const dataRowHeight = hasPhotos ? 75 : 22;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.height = dataRowHeight;
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      const isPhotoCol = photoColIndices.has(c);

      let hAlign: 'left' | 'center' | 'right' = 'left';
      if (isPhotoCol) {
        hAlign = 'center';
      } else {
        const val = cell.value;
        if (typeof val === 'number') {
          hAlign = 'right';
        } else {
          const sVal = String(val || '').trim();
          if (sVal === 'PR' || sVal === 'OK' || sVal === 'NOK' || sVal.length <= 4) {
            hAlign = 'center';
          }
        }
      }

      cell.alignment = {
        vertical: 'middle',
        horizontal: hAlign,
        wrapText: !isPhotoCol,
      };

      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    }
  }

  // 4. Set Column Widths
  for (let c = 1; c <= totalCols; c++) {
    const col = ws.getColumn(c);
    const headerStr = String(headerRow.getCell(c).value || '').trim();
    const normHeader = normalizeString(headerStr);

    if (photoColIndices.has(c)) {
      col.width = 22;
      continue;
    }

    let minWidth = 12;
    if (normHeader === 'codauto' || normHeader === 'codmonitoramento') minWidth = 12;
    else if (normHeader.includes('tipohoriz')) minWidth = 18;
    else if (normHeader === 'estado' || normHeader === 'estadoconservacao') minWidth = 10;
    else if (normHeader.includes('localiz')) minWidth = 20;
    else if (normHeader === 'rodovia') minWidth = 14;
    else if (normHeader === 'km' || normHeader === 'kmlegenda') minWidth = 12;
    else if (normHeader === 'sentido') minWidth = 15;
    else if (normHeader === 'bordo') minWidth = 18;
    else if (normHeader === 'cor') minWidth = 12;
    else if (normHeader.includes('resultado')) minWidth = 16;
    else if (normHeader.includes('situacao')) minWidth = 16;
    else if (normHeader.includes('elemento')) minWidth = 16;
    else if (normHeader === 'kmfinal' || normHeader === 'kmfim') minWidth = 12;
    else if (normHeader.includes('tipodefensa') || normHeader.includes('defensa') || normHeader.includes('barreira')) minWidth = 18;
    else if (normHeader === 'lado') minWidth = 12;
    else if (normHeader.includes('aparencia')) minWidth = 15;
    else if (normHeader.includes('observacao') || normHeader === 'obs') minWidth = 24;

    let maxLen = headerStr.length;
    for (let r = 2; r <= Math.min(ws.rowCount, 200); r++) {
      const val = ws.getRow(r).getCell(c).value;
      if (val !== null && val !== undefined) {
        const strVal = String(val).trim();
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    }

    col.width = Math.min(40, Math.max(minWidth, maxLen + 3));
  }
}

async function convertXlsToXlsxWithImages(xlsPath: string, outputPath: string) {
  try {
    const fileBuf = fs.readFileSync(xlsPath);
    const extractedImages = await extractImagesFromBuffer(fileBuf);
    const biffAnchors = extractAnchorsFromBiff8(fileBuf);

    const xlsWorkbook = XLSX.readFile(xlsPath, { cellDates: true, raw: false });

    if (extractedImages.length === 0) {
      XLSX.writeFile(xlsWorkbook, outputPath, { bookType: 'xlsx' });
      return;
    }

    const wb = new ExcelJS.Workbook();

    for (const sheetName of xlsWorkbook.SheetNames) {
      const sheet = xlsWorkbook.Sheets[sheetName];
      if (!sheet) continue;

      const ws = wb.addWorksheet(sheetName);
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (rawRows.length === 0) continue;

      rawRows.forEach((rowVals) => {
        ws.addRow(rowVals);
      });

      // Identify photo columns
      const isNumSeq = rawRows.length > 1 && isNumericSequenceRow(rawRows[0], rawRows[1]);
      const headerRow = (isNumSeq ? rawRows[1] : rawRows[0]) || [];
      const photoColIndices: number[] = [];

      headerRow.forEach((colName: any, idx: number) => {
        const colStr = String(colName || '').toLowerCase().replace(/[\s_\-]/g, '');
        if (
          colStr.match(/^foto\d+$/) ||
          colStr.startsWith('foto') ||
          colStr.includes('imagem') ||
          colStr.includes('fotografia') ||
          colStr.includes('img')
        ) {
          photoColIndices.push(idx); // 0-based
        }
      });

      // If we have BIFF8 ClientAnchors mapping 1-to-1 to extracted images, embed images at exact cell coordinates
      if (biffAnchors.length > 0) {
        let finalAnchors = biffAnchors;
        if (photoColIndices.length > 0) {
          const photoColIndicesSet = new Set(photoColIndices);
          finalAnchors = biffAnchors
            .filter((a) => photoColIndicesSet.has(a.col1) && a.row1 >= 1)
            .sort((a, b) => {
              if (a.row1 !== b.row1) return a.row1 - b.row1;
              return a.col1 - b.col1;
            });
        }

        const count = Math.min(finalAnchors.length, extractedImages.length);
        for (let i = 0; i < count; i++) {
          const anchor = finalAnchors[i];
          const imgItem = extractedImages[i];
          try {
            const imageId = wb.addImage({
              buffer: imgItem.buffer,
              extension: imgItem.format === 'PNG' ? 'png' : 'jpeg',
            });

            ws.addImage(imageId, {
              tl: { col: anchor.col1, row: anchor.row1 },
              ext: { width: 120, height: 90 },
              editAs: 'oneCell',
            });
          } catch (addErr) {
            console.warn(`Error adding image ${i} to anchor R${anchor.row1}C${anchor.col1}:`, addErr);
          }
        }
      } else {
        // Fallback: match by photo columns or text
        if (photoColIndices.length > 0) {
          const photoCells: { row: number; col: number; text: string }[] = [];
          for (let r = 2; r <= rawRows.length; r++) {
            const rowVals = rawRows[r - 1] || [];
            for (const colIdx of photoColIndices) {
              const val = String(rowVals[colIdx] || '').trim();
              photoCells.push({ row: r, col: colIdx + 1, text: val });
            }
          }

          const usedImgIndices = new Set<number>();
          photoCells.forEach((pCell) => {
            let matchedImgIdx = -1;
            if (pCell.text) {
              const cleanVal = cleanImageKey(pCell.text);
              const baseVal = cleanImageKey(path.basename(pCell.text));
              for (let i = 0; i < extractedImages.length; i++) {
                if (usedImgIndices.has(i)) continue;
                const img = extractedImages[i];
                if (img.nameKey) {
                  if (
                    cleanVal.includes(img.nameKey) ||
                    img.nameKey.includes(cleanVal) ||
                    baseVal.includes(img.nameKey) ||
                    img.nameKey.includes(baseVal)
                  ) {
                    matchedImgIdx = i;
                    break;
                  }
                }
              }
            }

            if (matchedImgIdx >= 0 && matchedImgIdx < extractedImages.length) {
              usedImgIndices.add(matchedImgIdx);
              const imgItem = extractedImages[matchedImgIdx];
              try {
                const imageId = wb.addImage({
                  buffer: imgItem.buffer,
                  extension: imgItem.format === 'PNG' ? 'png' : 'jpeg',
                });
                ws.addImage(imageId, {
                  tl: { col: pCell.col - 1, row: pCell.row - 1 },
                  ext: { width: 120, height: 90 },
                  editAs: 'oneCell',
                });
              } catch (addErr) {
                console.warn(`Error adding image to cell R${pCell.row}C${pCell.col}:`, addErr);
              }
            }
          });
        }
      }
    }

    wb.worksheets.forEach((ws) => {
      formatWorksheetLayout(ws);
    });

    await wb.xlsx.writeFile(outputPath);
  } catch (err) {
    console.error('Error in convertXlsToXlsxWithImages:', err);
    try {
      const xlsWorkbook = XLSX.readFile(xlsPath, { cellDates: true, raw: false });
      XLSX.writeFile(xlsWorkbook, outputPath, { bookType: 'xlsx' });
    } catch {}
  }
}

// Global memory cache for resized/converted cell images to avoid re-processing in Sharp
const processedImageCache = new Map<string, ExtractedMediaItem>();

// Helper to convert zip image buffer to base64 with Sharp (with caching)
async function getProcessedImageFromZip(zipEntry: any, fileName: string): Promise<ExtractedMediaItem | null> {
  const cacheKey = `${fileName}_${zipEntry._data?.uncompressedSize || ''}`;
  if (processedImageCache.has(cacheKey)) {
    return processedImageCache.get(cacheKey)!;
  }

  try {
    const rawBuffer = await zipEntry.async('nodebuffer');
    if (!rawBuffer || rawBuffer.length === 0) return null;

    let format: 'JPEG' | 'PNG' = 'JPEG';
    let processedBuffer: Buffer;

    try {
      const meta = await sharp(rawBuffer).metadata();
      if (meta.format === 'png') {
        format = 'PNG';
        processedBuffer = await sharp(rawBuffer)
          .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
          .png({ quality: 85 })
          .toBuffer();
      } else {
        format = 'JPEG';
        processedBuffer = await sharp(rawBuffer)
          .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      }
    } catch {
      // If Sharp cannot process the image format (e.g. EMF/WMF vectors or corrupt image bytes),
      // return null so jsPDF does not crash when rendering.
      return null;
    }

    const base64 = processedBuffer.toString('base64');
    const item: ExtractedMediaItem = { base64, format };

    if (processedImageCache.size > 1000) {
      const firstK = processedImageCache.keys().next().value;
      if (firstK) processedImageCache.delete(firstK);
    }
    processedImageCache.set(cacheKey, item);
    return item;
  } catch (err) {
    console.warn(`Failed to process image ${fileName}:`, err);
    return null;
  }
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

// 4.1 Download PDF Landscape endpoint - Fast, memory-safe, lazy image loading
app.get('/api/download-pdf/:downloadId', async (req, res) => {
  const downloadId = req.params.downloadId;
  const processedInfo = processedFiles.get(downloadId);

  if (!processedInfo || !fs.existsSync(processedInfo.filePath)) {
    return res.status(404).json({ error: 'Arquivo para download PDF não encontrado ou já expirado.' });
  }

  try {
    const fileBuf = fs.readFileSync(processedInfo.filePath);
    const zip = await JSZip.loadAsync(fileBuf);
    const parser = new DOMParser();

    // 1. Load sharedStrings
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

    // 2. Find target worksheet XML using robust matching
    const targetSheetPath = await findSheetXmlPath(zip, parser, processedInfo.sheetName || '');

    if (!zip.files[targetSheetPath]) {
      return res.status(400).json({ error: 'Aba da planilha não encontrada para geração de PDF.' });
    }

    // 3. Parse Worksheet XML directly
    const sheetXmlStr = await zip.files[targetSheetPath].async('string');
    const sheetDom = parser.parseFromString(sheetXmlStr, 'text/xml');

    // Parse all rows from sheetData
    const rowNodes = sheetDom.getElementsByTagName('row');
    const rawGrid = new Map<number, Map<number, string>>();
    let maxColIdx = 0;
    let maxRowIdx = 1;

    for (let r = 0; r < rowNodes.length; r++) {
      const rowEl = rowNodes.item(r);
      const rowNum = parseInt(rowEl?.getAttribute('r') || String(r + 1), 10);
      if (rowNum > maxRowIdx) maxRowIdx = rowNum;

      const cNodes = rowEl?.getElementsByTagName('c');
      if (!cNodes) continue;

      const rowMap = new Map<number, string>();
      for (let c = 0; c < cNodes.length; c++) {
        const cEl = cNodes.item(c);
        if (!cEl) continue;
        const rAttr = cEl.getAttribute('r');
        let colIdx = 0;
        if (rAttr) {
          const match = rAttr.match(/^([A-Z]+)(\d+)$/);
          if (match) colIdx = colToIdx(match[1]);
        }
        if (colIdx > maxColIdx) maxColIdx = colIdx;

        const tAttr = cEl.getAttribute('t');
        let val = '';
        if (tAttr === 's') {
          const vEl = cEl.getElementsByTagName('v').item(0);
          const sIdx = parseInt(vEl?.textContent || '-1', 10);
          if (sIdx >= 0 && sIdx < sharedStrings.length) {
            val = sharedStrings[sIdx];
          }
        } else if (tAttr === 'inlineStr') {
          val = cEl.getElementsByTagName('t').item(0)?.textContent || '';
        } else {
          val = cEl.getElementsByTagName('v').item(0)?.textContent || '';
        }
        rowMap.set(colIdx + 1, val);
      }
      rawGrid.set(rowNum, rowMap);
    }

    // 4. Identify header row index and valid PDF columns
    let headerRowIdx = 1;
    let headerRowMap = rawGrid.get(1) || new Map<number, string>();

    const r1Vals: string[] = [];
    const r2Vals: string[] = [];
    for (let c = 1; c <= maxColIdx + 1; c++) {
      r1Vals.push((rawGrid.get(1)?.get(c) || '').trim());
      r2Vals.push((rawGrid.get(2)?.get(c) || '').trim());
    }

    if (isNumericSequenceRow(r1Vals, r2Vals)) {
      headerRowIdx = 2;
      headerRowMap = rawGrid.get(2) || new Map<number, string>();
    }

    const validPdfCols: { originalCol: number; header: string; isPhoto: boolean; photoNum?: number }[] = [];

    for (let c = 1; c <= maxColIdx + 1; c++) {
      const textVal = String(headerRowMap.get(c) || '').trim();
      if (!textVal) continue;

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

    if (validPdfCols.length === 0) {
      return res.status(400).json({ error: 'Nenhuma coluna válida encontrada para o relatório.' });
    }

    // 5. Parse Drawing relationships & anchors for lazy photo extraction
    // Map cell `${sheetRow}:${sheetCol}` -> zip file entry
    const cellToZipEntryMap = new Map<string, any>();
    const nameToZipEntryMap = new Map<string, any>();

    // Map drawing rels
    const drawingRelsMap = new Map<string, Map<string, any>>();
    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.startsWith('xl/drawings/_rels/drawing') && relPath.endsWith('.xml.rels')) {
        try {
          const relsXml = await zipEntry.async('string');
          const doc = parser.parseFromString(relsXml, 'text/xml');
          const relNodes = getRelsNodes(doc);
          const curRels = new Map<string, any>();
          for (let i = 0; i < relNodes.length; i++) {
            const rEl = relNodes[i];
            const id = rEl?.getAttribute('Id') || rEl?.getAttribute('id') || '';
            const target = rEl?.getAttribute('Target') || rEl?.getAttribute('target') || '';
            if (id && target) {
              const targetBase = path.basename(target);
              const zEntry =
                zip.files[target] ||
                zip.files[`xl/media/${targetBase}`] ||
                zip.files[target.replace(/^\.\.\//, 'xl/')];
              if (zEntry) curRels.set(id, zEntry);
            }
          }
          const drawingName = relPath.replace('_rels/', '').replace('.rels', '');
          drawingRelsMap.set(drawingName, curRels);
          drawingRelsMap.set(path.basename(drawingName), curRels);
        } catch {}
      }
    }

    // Parse drawing anchors
    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
      if (relPath.startsWith('xl/drawings/drawing') && relPath.endsWith('.xml')) {
        try {
          const drawingXml = await zipEntry.async('string');
          const doc = parser.parseFromString(drawingXml, 'text/xml');
          const curRels = drawingRelsMap.get(relPath) || drawingRelsMap.get(path.basename(relPath)) || new Map();

          const anchors = Array.from(doc?.documentElement?.childNodes || []).filter((n: any) => n.nodeType === 1);
          for (const anchor of anchors) {
            const el = anchor as any;
            const fromEl = el.getElementsByTagName('xdr:from').item(0) || el.getElementsByTagName('from').item(0);
            const rowEl = fromEl?.getElementsByTagName('xdr:row').item(0) || fromEl?.getElementsByTagName('row').item(0);
            const colEl = fromEl?.getElementsByTagName('xdr:col').item(0) || fromEl?.getElementsByTagName('col').item(0);

            const row0 = rowEl ? parseInt(rowEl.textContent || '-1', 10) : -1;
            const col0 = colEl ? parseInt(colEl.textContent || '-1', 10) : -1;

            const blipEl = el.getElementsByTagName('a:blip').item(0) || el.getElementsByTagName('blip').item(0);
            let rId = blipEl?.getAttribute('r:embed') || blipEl?.getAttribute('embed') || '';
            if (!rId && blipEl?.attributes) {
              for (let i = 0; i < blipEl.attributes.length; i++) {
                const attr = blipEl.attributes.item(i);
                if (attr && (attr.name === 'r:embed' || attr.name === 'embed' || attr.localName === 'embed')) {
                  rId = attr.value;
                  break;
                }
              }
            }

            const cNvPrEl = el.getElementsByTagName('xdr:cNvPr').item(0) || el.getElementsByTagName('cNvPr').item(0);
            const name = cNvPrEl?.getAttribute('name') || '';
            const zEntry = curRels.get(rId) || zip.files[`xl/media/${path.basename(name)}`];

            if (zEntry) {
              if (row0 >= 0 && col0 >= 0) {
                cellToZipEntryMap.set(`${row0 + 1}:${col0 + 1}`, zEntry);
              }
              if (name) {
                nameToZipEntryMap.set(cleanImageKey(name), zEntry);
                nameToZipEntryMap.set(cleanImageKey(path.basename(name)), zEntry);
              }
            }
          }
        } catch {}
      }
    }

    // 6. Build data rows and lazily extract cell images ONLY for present rows
    const headers = validPdfCols.map((c) => c.header);
    const dataRows: string[][] = [];
    const cellImages = new Map<string, ExtractedMediaItem>();
    let hasAnyImages = false;

    for (let r = headerRowIdx + 1; r <= maxRowIdx; r++) {
      const rowMap = rawGrid.get(r);
      if (!rowMap) continue;

      const rowData: string[] = [];
      let hasAnyData = false;
      const rowIndex = dataRows.length;

      for (let pdfColIdx = 0; pdfColIdx < validPdfCols.length; pdfColIdx++) {
        const colInfo = validPdfCols[pdfColIdx];
        const valStr = (rowMap.get(colInfo.originalCol) || '').trim();
        if (valStr) hasAnyData = true;

        let matchedImage: ExtractedMediaItem | null = null;
        if (colInfo.isPhoto) {
          const cellKey = `${r}:${colInfo.originalCol}`;
          const zEntry = cellToZipEntryMap.get(cellKey) || (valStr ? nameToZipEntryMap.get(cleanImageKey(valStr)) : null);
          if (zEntry) {
            matchedImage = await getProcessedImageFromZip(zEntry, zEntry.name || cellKey);
          }
        }

        if (matchedImage) {
          cellImages.set(`${rowIndex}:${pdfColIdx}`, matchedImage);
          hasAnyImages = true;
          rowData.push('');
        } else {
          rowData.push(valStr);
        }
      }

      if (hasAnyData) {
        dataRows.push(rowData);
      }
    }

    // If no records found with the applied filter (e.g. 0 ruins)
    if (dataRows.length === 0) {
      const emptyRow = new Array(headers.length).fill('');
      emptyRow[0] = 'Nenhum registro encontrado com o filtro selecionado.';
      dataRows.push(emptyRow);
    }

    const eprLogoPng = await getEprLogoPng();

    // Generate PDF in Landscape format (A4: 297mm width x 210mm height)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const colCount = Math.max(1, headers.length);
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
      processedInfo.featureType === 'eps_defensa'
        ? 'EPS - Defensa'
        : processedInfo.featureType === 'sinalizacao_vertical'
        ? 'Sinalização Vertical'
        : processedInfo.featureType === 'sinalizacao_horizontal_dispositivo'
        ? 'Sinalização Horizontal - Dispositivo'
        : processedInfo.featureType === 'sinalizacao_horizontal_marca_viaria'
        ? 'Sinalização Horizontal - Marca Viária'
        : processedInfo.featureType === 'sinalizacao_horizontal_zebrado'
        ? 'Sinalização Horizontal - Zebrado'
        : processedInfo.featureType === 'drenagem_superficial'
        ? 'Drenagem Superficial'
        : 'Drenagem Profunda';

    const totalUsableWidth = 285.0; // 297mm - 12mm margins
    const baseWidths: number[] = [];

    validPdfCols.forEach((col) => {
      if (col.isPhoto) {
        baseWidths.push(32.0);
      } else {
        const headerLower = col.header.toLowerCase().replace(/[\s_\-]/g, '');
        let colW = 15.0;
        if (headerLower === 'codauto') colW = 14.0;
        else if (headerLower === 'sigla') colW = 12.0;
        else if (headerLower.includes('montante')) colW = 16.0;
        else if (headerLower === 'km' || headerLower === 'kmfinal' || headerLower === 'kmfim') colW = 12.0;
        else if (headerLower === 'rodovia') colW = 15.0;
        else if (headerLower === 'sentido') colW = 12.0;
        else if (headerLower.includes('defensa') || headerLower.includes('barreira')) colW = 18.0;
        else if (headerLower === 'lado') colW = 11.0;
        else if (headerLower.includes('aparencia')) colW = 15.0;
        else if (headerLower.includes('observacao') || headerLower === 'obs') colW = 20.0;
        else if (headerLower === 'elemento') colW = 18.0;
        else if (headerLower.includes('limpeza') || headerLower.includes('reparar') || headerLower.includes('extensao')) colW = 15.0;
        else if (headerLower.includes('estado')) colW = 19.0;
        else colW = 15.0;

        baseWidths.push(colW);
      }
    });

    const sumBaseWidths = baseWidths.reduce((a, b) => a + b, 0);
    const widthFactor = sumBaseWidths > 0 ? totalUsableWidth / sumBaseWidths : 1.0;

    const columnStyles: Record<number, any> = {};
    validPdfCols.forEach((col, idx) => {
      const finalW = Math.round(baseWidths[idx] * widthFactor * 100) / 100;
      columnStyles[idx] = {
        cellWidth: finalW,
        halign: 'center',
        valign: 'middle',
      };
    });

    const photoColsCount = validPdfCols.filter((c) => c.isPhoto).length;
    const calcPhotoWidth = photoColsCount > 0 ? (32.0 * widthFactor) : 32.0;
    const photoCellHeight = Math.max(26.0, Math.min(42.0, ((calcPhotoWidth - 2.0) / 1.3333) + 2.5));
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
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        textColor: [30, 41, 59],
        minCellHeight,
      },
      headStyles: {
        fillColor: [7, 43, 74],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        fontSize: fontSize + 0.3,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
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

              const targetRatio = 1.333;
              let imgW = maxW;
              let imgH = imgW / targetRatio;
              if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH * targetRatio;
              }

              const posX = data.cell.x + (data.cell.width - imgW) / 2;
              const posY = data.cell.y + (data.cell.height - imgH) / 2;

              const prefix = img.format === 'PNG' ? 'data:image/png;base64,' : 'data:image/jpeg;base64,';
              const imgDataUri = img.base64.startsWith('data:') ? img.base64 : `${prefix}${img.base64}`;
              doc.addImage(imgDataUri, img.format, posX, posY, imgW, imgH);

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
        try {
          doc.addImage(eprLogoPng, 'PNG', 6, 3.5, 14.5, 14.5);
        } catch (logoErr) {
          console.warn('Failed to render EPR logo on PDF:', logoErr);
        }

        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(7, 43, 74);
        doc.text(`EPR PARANÁ • RELATÓRIO DE LEVANTAMENTO • ${featureName.toUpperCase()}`, 23.5, 8.5);

        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);

        let filterText = '';
        if (processedInfo.sheetName) {
          filterText += ` • Aba: ${processedInfo.sheetName}`;
        }
        if (processedInfo.appliedRodoviaFilter) {
          filterText += ` • Rodovia: ${processedInfo.appliedRodoviaFilter}`;
        }
        if (processedInfo.appliedEstadoFilter) {
          const filterColLabel =
            processedInfo.featureType === 'eps_defensa'
              ? 'Aparência Geral'
              : processedInfo.featureType === 'sinalizacao_vertical'
              ? 'Retrorrefletância'
              : processedInfo.featureType?.startsWith('sinalizacao_horizontal')
              ? 'Resultado'
              : 'Estado';
          filterText += ` • ${filterColLabel}: ${processedInfo.appliedEstadoFilter}`;
        }

        const countDisplay = dataRows[0]?.[0]?.includes('Nenhum registro') ? 0 : dataRows.length;
        const subtitle = `Arquivo: ${processedInfo.originalFileName} • Total: ${countDisplay.toLocaleString('pt-BR')} registros${filterText}`;
        doc.text(subtitle, 23.5, 13.5);

        doc.setDrawColor(103, 186, 123);
        doc.setLineWidth(0.4);
        doc.line(6, 19.5, 291, 19.5);
      },
    });

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);

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
    const pdfFileName = `${parsedName.name}.pdf`
      .replace(/[\/\\:*?"<>|\r\n]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    const asciiPdfFileName = pdfFileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiPdfFileName}"; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`
    );

    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao gerar o arquivo PDF: ' + (error.message || 'Falha desconhecida') });
    }
  }
});


// 5. Generate sample XLSX endpoint for quick testing using ExcelJS
app.post('/api/generate-sample', async (req, res) => {
  try {
    const { featureType = 'drenagem_profunda' } = req.body || {};
    const wb = new ExcelJS.Workbook();

    if (featureType === 'eps_defensa') {
      const epsSheets = ['Barreira de Concreto', 'Defensa Metalica', 'Defensa OAE'];
      const epsHeaders = [
        'codAuto',
        'km',
        'kmFinal',
        'sentido',
        'tipoDefensa',
        'rodovia',
        'lado',
        'observacao',
        'aparenciaGeral',
        'CodTrechoAntigo',
        'ObservacoesDescartadas',
        'CustoEstimado',
        'RascunhoInterno',
        'Foto1',
        'Foto2',
        'Foto3',
        'Foto4',
      ];

      const highways = ['SP-330', 'SP-310', 'BR-116', 'SP-348', 'SP-070'];
      const sentidos = ['Norte', 'Sul', 'Leste', 'Oeste'];
      const lados = ['Direito', 'Esquerdo', 'Canteiro Central'];
      const aparencias = ['Ruim', 'Regular', 'Boa'];

      epsSheets.forEach((sheetName, sIdx) => {
        const ws = wb.addWorksheet(sheetName);
        ws.columns = epsHeaders.map((h, i) => ({
          header: h,
          key: `col_${i}`,
          width: 18,
        }));

        for (let i = 1; i <= 60; i++) {
          const rowCod = (sIdx + 1) * 1000 + i;
          const rod = highways[(i + sIdx) % highways.length];
          const st = sentidos[(i + sIdx) % sentidos.length];
          const ld = lados[(i + sIdx) % lados.length];
          const ap = aparencias[(i + sIdx) % aparencias.length];
          const tipoDef =
            sheetName === 'Barreira de Concreto'
              ? 'Barreira Tipo New Jersey'
              : sheetName === 'Defensa Metalica'
              ? 'Defensa Semi-Rígida W'
              : 'Defensa de Encontro OAE';

          ws.addRow([
            rowCod,
            (i * 1.2).toFixed(1),
            (i * 1.2 + 0.4).toFixed(1),
            st,
            tipoDef,
            rod,
            ld,
            ap === 'Ruim' ? 'Deformação na estrutura e pintura gasta' : 'Em conformidade',
            ap,
            `ANTIGO-${rowCod}`,
            `Anotação de descarte ${rowCod}`,
            (3500 + i * 20).toFixed(2),
            `Rascunho interno nº ${rowCod}`,
            `IMG_DEF_${rowCod}_01.jpg`,
            `IMG_DEF_${rowCod}_02.jpg`,
            `IMG_DEF_${rowCod}_03.jpg`,
            `IMG_DEF_${rowCod}_04.jpg`,
          ]);
        }
      });

      const sampleFileName = 'planilha_eps_defensa_exemplo.xlsx';
      const sampleFilePath = path.join(UPLOAD_DIR, `sample-${Date.now()}.xlsx`);
      await wb.xlsx.writeFile(sampleFilePath);

      const fileId = path.basename(sampleFilePath);
      const stat = fs.statSync(sampleFilePath);
      const sheetNames = wb.worksheets.map((w) => w.name);
      const activeSheet = sheetNames[0];
      const sheetDetails = await getSheetDetailsAsync(sampleFilePath, activeSheet, featureType);

      uploadedFiles.set(fileId, {
        fileId,
        originalName: sampleFileName,
        filePath: sampleFilePath,
        fileSize: stat.size,
        uploadedAt: Date.now(),
        sheetNames,
      });

      return res.json({
        fileId,
        originalName: sampleFileName,
        fileSize: stat.size,
        sheetNames,
        activeSheet,
        sheetDetails,
        featureType,
      });
    }

    const isSinalizacao = featureType === 'sinalizacao_vertical';
    const isSuperficial = featureType === 'drenagem_superficial';
    const sheetTitle = isSinalizacao
      ? 'Sinalizacao_Vertical'
      : isSuperficial
      ? 'Drenagem_Superficial'
      : 'Drenagem_Profunda';

    // 1st sheet: feature specific headers + extra fields to test removal
    const ws1 = wb.addWorksheet(sheetTitle);

    let roadHeaders: string[];
    if (isSinalizacao) {
      roadHeaders = [
        'codAuto',
        'rodovia',
        'sentido',
        'km',
        'posicao',
        'localizacao',
        'lado',
        'codigoTipo',
        'materialSuporte',
        'largura',
        'altura',
        'metro2',
        'EstadoConservacao',
        'CodTrechoAntigo',
        'ObservacoesDescartadas',
        'CustoEstimado',
        'RascunhoInterno',
        'foto1',
        'foto2',
        'foto3',
        'foto4',
        'foto5',
        'foto6',
        'foto7',
        'Situação Retrorrefletancia',
        'ObservacaoPlacaDanificada',
      ];
    } else if (isSuperficial) {
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
        'TipoMontante',
        'sigla',
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
    const tiposPlaca = ['R-1', 'R-19', 'A-1a', 'A-14', 'I-01', 'S-03'];
    const materiais = ['Poste de Aço Galvanizado', 'Braço Projetado', 'Colunas Duplas', 'Pórtico'];
    const lados = ['Direito', 'Esquerdo', 'Canteiro Central', 'Aéreo'];
    const posicoes = ['Marginal', 'Pista Principal', 'Alça de Acesso'];
    const localizacoes = ['Acostamento', 'Bordo da Pista', 'Canteiro'];

    for (let i = 1; i <= 250; i++) {
      if (isSinalizacao) {
        ws1.addRow([
          2000 + i,
          highways[i % highways.length],
          sentidos[i % sentidos.length],
          (i * 1.5).toFixed(1),
          posicoes[i % posicoes.length],
          localizacoes[i % localizacoes.length],
          lados[i % lados.length],
          tiposPlaca[i % tiposPlaca.length],
          materiais[i % materiais.length],
          '1.20 m',
          '0.80 m',
          '0.96 m²',
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
          i % 3 === 0 ? 'Reprovado' : 'Aprovado',
          i % 4 === 0 ? 'Película descascada e amassada' : 'Sem avarias físicas',
        ]);
      } else if (isSuperficial) {
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

  // Clean abandoned chunk directories older than 30 minutes
  try {
    if (fs.existsSync(CHUNKS_DIR)) {
      const dirs = fs.readdirSync(CHUNKS_DIR);
      for (const d of dirs) {
        const fullDir = path.join(CHUNKS_DIR, d);
        try {
          const stats = fs.statSync(fullDir);
          if (now - stats.mtimeMs > 30 * 60 * 1000) {
            fs.rmSync(fullDir, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  } catch {}
}, 10 * 60 * 1000);

// API 404 fallback - prevents unmatched API routes from serving Vite HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Rota de API ${req.method} ${req.path} não encontrada.` });
});

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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.timeout = 15 * 60 * 1000;
  server.keepAliveTimeout = 120 * 1000;
  server.headersTimeout = 125 * 1000;
  (server as any).requestTimeout = 15 * 60 * 1000;
}

startServer();

