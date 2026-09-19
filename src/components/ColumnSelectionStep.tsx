import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  ArrowLeftRight,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  Layers,
  Eye,
  Filter,
  Route,
  Zap,
} from 'lucide-react';
import { UploadResponse, SheetDetails, DrainageFeatureType } from '../types';
import {
  DRAINAGE_FEATURES,
  isDefaultPresetField,
  normalizeColKey,
  matchesEstadoFilterFrontend,
  APARENCIA_GERAL_OPTIONS,
  normalizeRodoviaForFeature,
} from '../constants/presets';
import { TurboModeModal } from './TurboModeModal';
import { getAreaIdentifier } from '../utils/fileNaming';

export const SINALIZACAO_RETRORREFLETANCIA_OPTIONS = [
  { value: '', label: 'Todas as linhas' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Reprovado', label: 'Reprovado' },
] as const;

export const RESULTADO_GERAL_OPTIONS = [
  { value: '', label: 'Todas as linhas' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Reprovado', label: 'Reprovado' },
] as const;

export const ESTADO_CONSERVACAO_OPTIONS = [
  { value: '', label: 'Todas as linhas' },
  { value: 'BOM', label: 'BOM' },
  { value: 'REGULAR', label: 'REGULAR' },
  { value: 'PRECÁRIO', label: 'PRECÁRIO' },
] as const;

interface ColumnSelectionStepProps {
  uploadData: UploadResponse;
  initialFeatureType?: DrainageFeatureType;
  onFeatureChange?: (feature: DrainageFeatureType) => void;
  parcialNumber: string;
  onParcialChange: (parcial: string) => void;
  onBackToUpload: () => void;
  onProcessComplete: (result: any) => void;
}

export const ColumnSelectionStep: React.FC<ColumnSelectionStepProps> = ({
  uploadData,
  initialFeatureType = 'drenagem_profunda',
  onFeatureChange,
  parcialNumber,
  onParcialChange,
  onBackToUpload,
  onProcessComplete,
}) => {
  const [featureType, setFeatureType] = useState<DrainageFeatureType>(
    uploadData.featureType || initialFeatureType
  );
  const [activeSheet, setActiveSheet] = useState<string>(uploadData.activeSheet);
  const [sheetDetails, setSheetDetails] = useState<SheetDetails>(uploadData.sheetDetails);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);

  // Active view tab: 'columns' or 'preview'
  const [viewTab, setViewTab] = useState<'columns' | 'preview'>('columns');

  // Set of column indices marked for KEEPING ("Manter").
  const [selectedForKeeping, setSelectedForKeeping] = useState<Set<number>>(new Set());

  // Row filters
  const [estadoFilter, setEstadoFilter] = useState<string>('');
  const [rodoviaFilter, setRodoviaFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Turbo Mode Modal state
  const [isTurboModeOpen, setIsTurboModeOpen] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  useEffect(() => {
    const target = uploadData.featureType || initialFeatureType;
    if (target && target !== featureType) {
      setFeatureType(target);
    }
  }, [uploadData.featureType, initialFeatureType]);

  // Auto-apply default preset columns on initial mount if not yet selected
  useEffect(() => {
    if (sheetDetails?.columns && sheetDetails.columns.length > 0) {
      setSelectedForKeeping((prev) => {
        if (prev.size > 0) return prev;
        const matchingIdxs = sheetDetails.columns
          .filter((col) => isDefaultPresetField(col.name, featureType))
          .map((col) => col.index);
        return new Set(matchingIdxs);
      });
    }
  }, [sheetDetails, featureType]);

  const featureConfig = DRAINAGE_FEATURES[featureType];

  // Switch sheet
  const handleSheetChange = async (newSheetName: string) => {
    if (newSheetName === activeSheet || isLoadingSheet) return;
    setIsLoadingSheet(true);
    setProcessingError(null);
    try {
      const res = await fetch(
        `/api/sheet-details/${uploadData.fileId}/${encodeURIComponent(newSheetName)}?featureType=${featureType}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao carregar detalhes da aba.');
      }
      const newDetails: SheetDetails = await res.json();
      setActiveSheet(newSheetName);
      setSheetDetails(newDetails);
      const matchingIdxs = newDetails.columns
        .filter((col) => isDefaultPresetField(col.name, featureType))
        .map((col) => col.index);
      setSelectedForKeeping(new Set(matchingIdxs));
      setEstadoFilter('');
      setRodoviaFilter('');
      setSearchQuery('');
    } catch (err: any) {
      setProcessingError(err.message || 'Falha ao trocar de aba.');
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleFeatureSwitch = (newFeature: DrainageFeatureType) => {
    setFeatureType(newFeature);
    if (uploadData) {
      uploadData.featureType = newFeature;
    }
    if (onFeatureChange) {
      onFeatureChange(newFeature);
    }

    const matchingIdxs = sheetDetails.columns
      .filter((col) => isDefaultPresetField(col.name, newFeature))
      .map((col) => col.index);
    setSelectedForKeeping(new Set(matchingIdxs));
  };

  const handleToggleColumn = (colIndex: number) => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      if (next.has(colIndex)) {
        next.delete(colIndex);
      } else {
        next.add(colIndex);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      filteredColumns.forEach((col) => next.add(col.index));
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      filteredColumns.forEach((col) => next.delete(col.index));
      return next;
    });
  };

  const handleInvertVisible = () => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      filteredColumns.forEach((col) => {
        if (next.has(col.index)) {
          next.delete(col.index);
        } else {
          next.add(col.index);
        }
      });
      return next;
    });
  };

  const presetMatchingIndices = useMemo(() => {
    return sheetDetails.columns
      .filter((col) => isDefaultPresetField(col.name, featureType))
      .map((col) => col.index);
  }, [sheetDetails.columns, featureType]);

  const matchedPresetCount = presetMatchingIndices.length;

  const isPresetActive = useMemo(() => {
    if (presetMatchingIndices.length === 0) return false;
    if (selectedForKeeping.size !== presetMatchingIndices.length) return false;
    return presetMatchingIndices.every((idx) => selectedForKeeping.has(idx));
  }, [presetMatchingIndices, selectedForKeeping]);

  const handleToggleDefaultPreset = () => {
    if (isPresetActive) {
      setSelectedForKeeping(new Set());
    } else {
      setSelectedForKeeping(new Set(presetMatchingIndices));
    }
  };

  const handleApplyDefaultPreset = () => {
    setSelectedForKeeping(new Set(presetMatchingIndices));
  };

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return sheetDetails.columns;
    const q = searchQuery.toLowerCase().trim();
    return sheetDetails.columns.filter(
      (col) =>
        col.name.toLowerCase().includes(q) ||
        col.letter.toLowerCase().includes(q) ||
        String(col.index + 1).includes(q)
    );
  }, [sheetDetails.columns, searchQuery]);

  const estadoColInfo = useMemo(() => {
    return sheetDetails.columns.find((col) => {
      const norm = normalizeColKey(col.name);
      if (
        featureType === 'sinalizacao_horizontal_dispositivo' ||
        featureType === 'sinalizacao_horizontal_zebrado'
      ) {
        return norm === 'resultadogeral' || norm === 'resultado' || norm === 'status';
      }
      if (featureType === 'sinalizacao_horizontal_marca_viaria') {
        return norm === 'resultado' || norm === 'resultadogeral' || norm === 'status';
      }
      if (featureType === 'sinalizacao_vertical') {
        return (
          norm === 'situacaoretrorrefletancia' ||
          norm === 'situacaoderetrorrefletancia' ||
          norm === 'situacaoretrorefletancia' ||
          norm === 'situacaoderetrorefletancia' ||
          norm === 'retrorrefletancia'
        );
      }
      return norm === 'estadoconservacao' || norm === 'estadodeconservacao';
    });
  }, [sheetDetails.columns, featureType]);

  const rodoviaColInfo = useMemo(() => {
    return sheetDetails.columns.find((col) => {
      const norm = normalizeColKey(col.name);
      return norm === 'rodovia' || norm === 'rodovias';
    });
  }, [sheetDetails.columns]);

  const rodoviaColRelativeIdx = useMemo(() => {
    if (!rodoviaColInfo || sheetDetails.columns.length === 0) return -1;
    return rodoviaColInfo.index - sheetDetails.columns[0].index;
  }, [rodoviaColInfo, sheetDetails.columns]);

  const availableRodovias = useMemo(() => {
    const set = new Set<string>();
    if (sheetDetails.rodoviaOptions && sheetDetails.rodoviaOptions.length > 0) {
      sheetDetails.rodoviaOptions.forEach((r) => {
        if (r && r.trim()) set.add(normalizeRodoviaForFeature(r.trim(), featureType));
      });
    } else if (rodoviaColRelativeIdx >= 0) {
      sheetDetails.previewRows.forEach((row) => {
        const val = String(row[rodoviaColRelativeIdx] || '').trim();
        if (val) set.add(normalizeRodoviaForFeature(val, featureType));
      });
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [sheetDetails.rodoviaOptions, sheetDetails.previewRows, rodoviaColRelativeIdx, featureType]);

  const matchingRealRowsCount = useMemo(() => {
    if (!sheetDetails.rowFiltersData || sheetDetails.rowFiltersData.length === 0) {
      return sheetDetails.totalRows;
    }
    if (!estadoFilter && !rodoviaFilter) {
      return sheetDetails.totalRows;
    }
    return sheetDetails.rowFiltersData.filter((item) => {
      let matchesEstado = true;
      let matchesRodovia = true;

      if (estadoFilter) {
        matchesEstado = matchesEstadoFilterFrontend(item.e, estadoFilter);
      }

      if (rodoviaFilter) {
        const normItemRod = normalizeRodoviaForFeature(item.r, featureType);
        const normFilterRod = normalizeRodoviaForFeature(rodoviaFilter, featureType);
        matchesRodovia =
          normalizeColKey(normItemRod) === normalizeColKey(normFilterRod) ||
          normItemRod === normFilterRod ||
          normalizeColKey(item.r) === normalizeColKey(rodoviaFilter);
      }

      return matchesEstado && matchesRodovia;
    }).length;
  }, [estadoFilter, rodoviaFilter, sheetDetails.rowFiltersData, sheetDetails.totalRows, featureType]);

  const isHorizontalFeature =
    featureType === 'sinalizacao_horizontal_dispositivo' ||
    featureType === 'sinalizacao_horizontal_marca_viaria' ||
    featureType === 'sinalizacao_horizontal_zebrado';

  const activeStatusOptions =
    featureType === 'eps_defensa'
      ? APARENCIA_GERAL_OPTIONS
      : isHorizontalFeature
      ? RESULTADO_GERAL_OPTIONS
      : featureType === 'sinalizacao_vertical'
      ? SINALIZACAO_RETRORREFLETANCIA_OPTIONS
      : ESTADO_CONSERVACAO_OPTIONS;

  const totalColumns = sheetDetails.columns.length;
  const keptCount = selectedForKeeping.size;
  const removedCount = totalColumns - keptCount;

  const handleProcessSpreadsheet = async () => {
    setProcessingError(null);

    if (keptCount === 0) {
      setProcessingError(
        'Todas as colunas estão marcadas para remoção. Selecione pelo menos 1 coluna para manter.'
      );
      return;
    }

    setIsProcessing(true);

    const columnIndicesToRemove = sheetDetails.columns
      .filter((col) => !selectedForKeeping.has(col.index))
      .map((col) => col.index);

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: uploadData.fileId,
          sheetName: activeSheet,
          columnIndicesToRemove,
          estadoConservacaoFilter: estadoFilter.trim() !== '' ? estadoFilter : null,
          rodoviaFilter: rodoviaFilter.trim() !== '' ? rodoviaFilter : null,
          featureType,
          parcialNumber,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro ao processar a planilha.');
      }

      const result = await res.json();
      result.featureType = featureType;
      onProcessComplete(result);
    } catch (err: any) {
      setProcessingError(err.message || 'Falha ao processar arquivo.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-2">
      {/* 1. Header Control Bar: File Name, Sheet Tabs, Mode Switch, Parcial & Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[220px]" title={uploadData.originalName}>
            {uploadData.originalName}
          </span>
          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
            {(uploadData.fileSize / (1024 * 1024)).toFixed(1)} MB
          </span>

          {/* Sheet Selector Pills */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-[320px] scrollbar-none ml-1">
            {uploadData.sheetNames.map((name) => {
              const isActive = name === activeSheet;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSheetChange(name)}
                  disabled={isLoadingSheet}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Tools: Feature Selector, Parcial, Modo Turbo & Voltar */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* Feature selector */}
          <select
            value={featureType}
            onChange={(e) => handleFeatureSwitch(e.target.value as DrainageFeatureType)}
            className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
          >
            <option value="drenagem_profunda">Drenagem Profunda</option>
            <option value="drenagem_superficial">Drenagem Superficial</option>
            <option value="sinalizacao_vertical">Sinalização Vertical</option>
            <option value="sinalizacao_horizontal_dispositivo">SH - Dispositivo</option>
            <option value="sinalizacao_horizontal_marca_viaria">SH - Marca Viária</option>
            <option value="sinalizacao_horizontal_zebrado">SH - Zebrado</option>
            <option value="eps_defensa">EPS - Defensa</option>
          </select>

          {/* Parcial selector */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-xs">
            <span className="font-bold text-slate-600">Parcial:</span>
            <select
              id="select-parcial-step2"
              value={parcialNumber}
              onChange={(e) => onParcialChange(e.target.value)}
              className="bg-transparent font-bold text-emerald-800 focus:outline-none cursor-pointer pr-1"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Turbo Mode Button */}
          <button
            type="button"
            onClick={() => setIsTurboModeOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer"
            title="Modo Turbo: gerar arquivos XLSX e PDF por rodovia"
          >
            <Zap className="w-3.5 h-3.5 fill-amber-200 text-amber-100" />
            <span>Turbo</span>
          </button>

          {/* Back button */}
          <button
            type="button"
            onClick={onBackToUpload}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors border border-slate-300 bg-white cursor-pointer shadow-2xs"
            title="Voltar para a Etapa 1"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Filter Controls Row (3 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Filter 1: Seleção Padrão */}
        <div
          id="card-selecao-padrao"
          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
            isPresetActive
              ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/20'
              : 'bg-white border-slate-200'
          }`}
        >
          <label
            htmlFor="checkbox-selecao-padrao"
            className="flex items-center gap-2 cursor-pointer select-none min-w-0"
          >
            <input
              id="checkbox-selecao-padrao"
              type="checkbox"
              checked={isPresetActive}
              onChange={handleToggleDefaultPreset}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                Seleção Padrão
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {matchedPresetCount} colunas da feature
              </div>
            </div>
          </label>

          <button
            type="button"
            onClick={handleApplyDefaultPreset}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all shrink-0 cursor-pointer border ${
              isPresetActive
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-100 hover:bg-emerald-50 text-emerald-800 border-slate-200'
            }`}
          >
            {isPresetActive ? 'Ativa' : 'Aplicar'}
          </button>
        </div>

        {/* Filter 2: Rodovia Filter */}
        <div
          id="card-filtro-rodovia"
          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
            rodoviaFilter
              ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-400/20'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Route className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                <span>Rodovia:</span>
                {rodoviaFilter && (
                  <span className="text-sky-800 font-bold truncate">({rodoviaFilter})</span>
                )}
              </div>
              <select
                id="select-rodovia"
                value={rodoviaFilter}
                onChange={(e) => setRodoviaFilter(e.target.value)}
                className="w-full text-xs font-semibold rounded border border-slate-200 bg-white py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer truncate mt-0.5"
              >
                <option value="">Todas ({sheetDetails.totalRows.toLocaleString('pt-BR')} linhas)</option>
                {availableRodovias.map((rodovia) => {
                  const count = sheetDetails.rodoviaCounts?.[rodovia];
                  return (
                    <option key={rodovia} value={rodovia}>
                      {rodovia} {count !== undefined ? `(${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {rodoviaFilter && (
            <button
              type="button"
              onClick={() => setRodoviaFilter('')}
              className="text-[10px] text-slate-500 hover:text-slate-800 underline shrink-0 px-1"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Filter 3: Estado / Resultado / Situação Filter */}
        <div
          id="card-filtro-estado-conservacao"
          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
            estadoFilter
              ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-400/20'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Filter className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                <span>
                  {featureType === 'eps_defensa'
                    ? 'Aparência:'
                    : isHorizontalFeature
                    ? 'Resultado:'
                    : featureType === 'sinalizacao_vertical'
                    ? 'Retrorreflet.:'
                    : 'Conservação:'}
                </span>
                {estadoFilter && (
                  <span className="text-amber-900 font-bold truncate">({estadoFilter})</span>
                )}
              </div>
              <select
                id="select-estado-conservacao"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className="w-full text-xs font-semibold rounded border border-slate-200 bg-white py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer truncate mt-0.5"
              >
                {activeStatusOptions.map((opt) => {
                  let count: number | undefined;
                  if (!opt.value) {
                    count = sheetDetails.totalRows;
                  } else if (sheetDetails.estadoCounts) {
                    count = sheetDetails.estadoCounts[opt.value];
                  }
                  return (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} {count !== undefined ? `(${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {estadoFilter && (
            <button
              type="button"
              onClick={() => setEstadoFilter('')}
              className="text-[10px] text-slate-500 hover:text-slate-800 underline shrink-0 px-1"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Display Area: View Mode Switcher, Search, Bulk Actions & Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs flex flex-col gap-2">
        {/* Toolbar: View Switcher, Search, and Quick Column Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          {/* View Mode Tabs */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewTab('columns')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewTab === 'columns'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Colunas ({keptCount} mantidas)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab('preview')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewTab === 'preview'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Prévia dos Dados (20 linhas)</span>
            </button>
          </div>

          {/* Search column input */}
          <div className="relative flex-1 max-w-xs min-w-[140px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar coluna..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleSelectAllVisible}
              className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-emerald-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Marcar todas as colunas visíveis para manter"
            >
              <CheckSquare className="w-3 h-3 text-emerald-600" />
              <span className="hidden sm:inline">Manter Todas</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAllVisible}
              className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Marcar todas as colunas para remover"
            >
              <Square className="w-3 h-3 text-rose-500" />
              <span className="hidden sm:inline">Remover Todas</span>
            </button>
            <button
              type="button"
              onClick={handleInvertVisible}
              className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title="Inverter seleção de colunas"
            >
              <ArrowLeftRight className="w-3 h-3 text-slate-500" />
              <span className="hidden sm:inline">Inverter</span>
            </button>
          </div>
        </div>

        {/* View 1: Columns Grid View */}
        {viewTab === 'columns' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 max-h-[36vh] min-h-[180px] overflow-y-auto p-1 border border-slate-200 rounded-lg bg-slate-50/40 scrollbar-thin">
            {filteredColumns.map((col) => {
              const isKept = selectedForKeeping.has(col.index);
              const isPreset = isDefaultPresetField(col.name, featureType);

              return (
                <div
                  key={col.index}
                  onClick={() => handleToggleColumn(col.index)}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer select-none flex items-center justify-between gap-1.5 shadow-2xs ${
                    isKept
                      ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400/20 text-emerald-950 font-bold'
                      : 'bg-white border-slate-200 hover:border-slate-300 opacity-60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        isKept
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 rounded">
                          {col.letter}
                        </span>
                        {isPreset && (
                          <span className="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          isKept ? 'font-bold text-slate-900' : 'line-through text-slate-400'
                        }`}
                        title={col.name}
                      >
                        {col.name || '(Sem nome)'}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                      isKept
                        ? 'bg-emerald-200 text-emerald-900'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {isKept ? 'Manter' : 'Remover'}
                  </span>
                </div>
              );
            })}

            {filteredColumns.length === 0 && (
              <div className="col-span-full p-6 text-center text-slate-400 text-xs">
                Nenhuma coluna encontrada para "{searchQuery}".
              </div>
            )}
          </div>
        )}

        {/* View 2: Interactive Table Preview View */}
        {viewTab === 'preview' && (
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs max-h-[36vh] min-h-[180px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <th className="p-1.5 border-r border-slate-200 text-center w-10 bg-slate-100 text-[10px]">
                    #
                  </th>
                  {sheetDetails.columns.map((col) => {
                    const isKept = selectedForKeeping.has(col.index);
                    return (
                      <th
                        key={col.index}
                        onClick={() => handleToggleColumn(col.index)}
                        className={`p-1.5 border-r border-slate-200 transition-colors cursor-pointer select-none whitespace-nowrap min-w-[120px] max-w-[200px] ${
                          isKept
                            ? 'bg-emerald-100 text-emerald-950 border-b-2 border-b-emerald-600'
                            : 'bg-rose-50/70 text-rose-700 opacity-60 border-b-2 border-b-rose-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="truncate font-bold text-xs">
                            <span className="text-[10px] font-mono text-slate-500 mr-1">
                              [{col.letter}]
                            </span>
                            <span>{col.name}</span>
                          </div>
                          <span
                            className={`text-[8px] px-1 py-0.2 rounded font-bold uppercase ${
                              isKept
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-200 text-rose-900'
                            }`}
                          >
                            {isKept ? 'Manter' : 'Remover'}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-[11px]">
                {sheetDetails.previewRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                  >
                    <td className="p-1.5 border-r border-slate-200 text-slate-400 font-mono text-center bg-slate-50">
                      {rIdx + 1}
                    </td>
                    {sheetDetails.columns.map((col) => {
                      const isKept = selectedForKeeping.has(col.index);
                      const cellValue = row[col.index - sheetDetails.columns[0].index];
                      return (
                        <td
                          key={col.index}
                          className={`p-1.5 border-r border-slate-100 whitespace-nowrap max-w-[180px] truncate ${
                            !isKept ? 'bg-rose-50/30 text-rose-400 line-through' : 'text-slate-800'
                          }`}
                        >
                          {cellValue !== undefined && cellValue !== null && cellValue !== '' ? (
                            String(cellValue)
                          ) : (
                            <span className="text-slate-300 italic font-mono">vazio</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error alert if processing failed */}
      {processingError && (
        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="flex-1">{processingError}</span>
        </div>
      )}

      {/* 4. Action Footer Bar: Compact Metrics & Generation Button */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <span>
            Resultado:{' '}
            <strong className="text-emerald-700 font-bold">{keptCount} colunas</strong> mantidas
          </span>
          <span className="text-slate-300">•</span>
          <span>
            <strong className="text-indigo-900 font-bold">
              {matchingRealRowsCount.toLocaleString('pt-BR')}
            </strong>{' '}
            de {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas
          </span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <span className="font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[11px] hidden sm:inline">
            Parcial {parcialNumber || '1'}{getAreaIdentifier(featureType) || '_'}BR-369.xlsx
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleProcessSpreadsheet}
            disabled={isProcessing || keptCount === 0}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm transition-all shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando arquivo...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Gerar Planilha Desta Aba ({keptCount} colunas)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Turbo Mode Execution Modal */}
      <TurboModeModal
        isOpen={isTurboModeOpen}
        onClose={() => setIsTurboModeOpen(false)}
        fileId={uploadData.fileId}
        originalFileName={uploadData.originalName}
        sheetName={activeSheet}
        sheetNames={uploadData.sheetNames}
        featureType={featureType}
        allColumns={sheetDetails.columns}
        availableRodovias={availableRodovias}
        rowFiltersData={sheetDetails.rowFiltersData}
        totalRows={sheetDetails.totalRows}
        onBackToUpload={onBackToUpload}
        parcialNumber={parcialNumber}
        onParcialChange={onParcialChange}
      />
    </div>
  );
};
