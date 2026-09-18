export type DrainageFeatureType =
  | 'drenagem_profunda'
  | 'drenagem_superficial'
  | 'sinalizacao_vertical'
  | 'sinalizacao_horizontal_dispositivo'
  | 'sinalizacao_horizontal_marca_viaria'
  | 'sinalizacao_horizontal_zebrado'
  | 'eps_defensa';

export interface ColumnInfo {
  index: number;
  name: string;
  letter: string;
}

export interface RowFilterItem {
  r: string;
  e: string;
}

export interface SheetDetails {
  headers: string[];
  columns: ColumnInfo[];
  totalRows: number;
  totalCols: number;
  previewRows: (string | number | boolean | null)[][];
  rodoviaOptions?: string[];
  rowFiltersData?: RowFilterItem[];
  rodoviaCounts?: Record<string, number>;
  estadoCounts?: Record<string, number>;
}

export interface UploadResponse {
  fileId: string;
  originalName: string;
  fileSize: number;
  sheetNames: string[];
  activeSheet: string;
  sheetDetails: SheetDetails;
  featureType?: DrainageFeatureType;
}

export interface ProcessResponse {
  downloadId: string;
  fileName: string;
  fileSize: number;
  originalColumnsCount: number;
  removedColumnsCount: number;
  keptColumnsCount: number;
  originalRowsCount?: number;
  keptRowsCount?: number;
  removedRowsCount?: number;
  rowsCount: number;
  originalFileName: string;
  downloadUrl: string;
  appliedEstadoFilter?: string | null;
  appliedRodoviaFilter?: string | null;
  featureType?: DrainageFeatureType;
  parcialNumber?: number | string;
  pdfDownloadUrl?: string;
}

export type Step = 1 | 2 | 3;
