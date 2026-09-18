import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  ArrowLeftRight,
  Trash2,
  Table,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  Layers,
  Eye,
  Info,
  Filter,
  Route,
  Waves,
  Milestone,
  CircleDot,
  Paintbrush,
  Grid3X3,
  Sparkles,
  Zap,
} from 'lucide-react';
import { UploadResponse, SheetDetails, ColumnInfo, DrainageFeatureType } from '../types';
import {
  DRAINAGE_FEATURES,
  isDefaultPresetField,
  normalizeColKey,
  matchesEstadoFilterFrontend,
  DRENAGEM_PROFUNDA_FIELDS,
  DRENAGEM_SUPERFICIAL_FIELDS,
  SINALIZACAO_VERTICAL_FIELDS,
  SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS,
  SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS,
  SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS,
  EPS_DEFENSA_FIELDS,
  APARENCIA_GERAL_OPTIONS,
  normalizeRodoviaForFeature,
} from '../constants/presets';
import { TurboModeModal } from './TurboModeModal';
import { getAreaIdentifier } from '../utils/fileNaming';

export const SINALIZACAO_RETRORREFLETANCIA_OPTIONS = [
  { value: '', label: 'Todas as linhas (Sem filtro)' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Reprovado', label: 'Reprovado' },
] as const;

export const RESULTADO_GERAL_OPTIONS = [
  { value: '', label: 'Todas as linhas (Sem filtro)' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Reprovado', label: 'Reprovado' },
] as const;

export const ESTADO_CONSERVACAO_OPTIONS = [
  { value: '', label: 'Todas as linhas (Sem filtro)' },
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

  // Set of column indices marked for KEEPING ("Manter").
  // Starts empty: all columns initially start marked for REMOVAL ("Remover").
  const [selectedForKeeping, setSelectedForKeeping] = useState<Set<number>>(new Set());

  // Estado de Conservação Row Filter: '' (Todas as linhas), 'BOM', 'REGULAR' ou 'PRECÁRIO'
  const [estadoFilter, setEstadoFilter] = useState<string>('');

  // Rodovia Row Filter: '' (Todas as rodovias), ou nome da rodovia específica (ex: 'SP-310', etc.)
  const [rodoviaFilter, setRodoviaFilter] = useState<string>('');

  // Search filter for columns
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
      // Auto-apply preset matching columns for the newly selected sheet
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

    // Auto-apply preset matching columns for the newly selected feature
    const matchingIdxs = sheetDetails.columns
      .filter((col) => isDefaultPresetField(col.name, newFeature))
      .map((col) => col.index);
    setSelectedForKeeping(new Set(matchingIdxs));
  };

  // Toggle keeping a single column
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

  // Select all visible columns
  const handleSelectAllVisible = () => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      filteredColumns.forEach((col) => next.add(col.index));
      return next;
    });
  };

  // Deselect all visible columns (mark all for removal)
  const handleDeselectAllVisible = () => {
    setSelectedForKeeping((prev) => {
      const next = new Set(prev);
      filteredColumns.forEach((col) => next.delete(col.index));
      return next;
    });
  };

  // Invert selection on visible columns
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

  // Indices of columns in this sheet matching the active feature's preset fields
  const presetMatchingIndices = useMemo(() => {
    return sheetDetails.columns
      .filter((col) => isDefaultPresetField(col.name, featureType))
      .map((col) => col.index);
  }, [sheetDetails.columns, featureType]);

  const matchedPresetCount = presetMatchingIndices.length;

  // Check if all preset columns are currently selected for keeping and nothing else
  const isPresetActive = useMemo(() => {
    if (presetMatchingIndices.length === 0) return false;
    if (selectedForKeeping.size !== presetMatchingIndices.length) return false;
    return presetMatchingIndices.every((idx) => selectedForKeeping.has(idx));
  }, [presetMatchingIndices, selectedForKeeping]);

  // Toggle handler for the "Seleção Padrão" checkbox
  const handleToggleDefaultPreset = () => {
    if (isPresetActive) {
      // If active, clicking deselects all (marks all for removal)
      setSelectedForKeeping(new Set());
    } else {
      // If inactive, selects all columns that match the default preset
      setSelectedForKeeping(new Set(presetMatchingIndices));
    }
  };

  // Direct action to apply the default preset selection
  const handleApplyDefaultPreset = () => {
    setSelectedForKeeping(new Set(presetMatchingIndices));
  };

  // Filtered columns based on search query
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

  // Identify if EstadoConservacao / Situação Retrorrefletancia / Resultado Geral column exists in this sheet
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

  const estadoColRelativeIdx = useMemo(() => {
    if (!estadoColInfo || sheetDetails.columns.length === 0) return -1;
    return estadoColInfo.index - sheetDetails.columns[0].index;
  }, [estadoColInfo, sheetDetails.columns]);

  // Identify if Rodovia column exists in this sheet
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

  // Extract list of distinct Rodovia options from the sheet
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

  // Count how many TOTAL rows in the ENTIRE sheet match both active filters in conjunction
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

  // Process & generate filtered spreadsheet
  const handleProcessSpreadsheet = async () => {
    setProcessingError(null);

    if (keptCount === 0) {
      setProcessingError(
        'Todas as colunas estão marcadas para remoção. Clique nas colunas para selecionar pelo menos 1 coluna que deseja MANTER na planilha final.'
      );
      return;
    }

    setIsProcessing(true);

    // Compute 0-based column indices that are NOT in selectedForKeeping
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
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* File & Feature Overview Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200/60">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-base">
                {uploadData.originalName}
              </span>
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                {(uploadData.fileSize / (1024 * 1024)).toFixed(2)} MB
              </span>
              <span className="text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                {featureType === 'sinalizacao_vertical' ? (
                  <Milestone className="w-3 h-3 text-emerald-700" />
                ) : featureType === 'drenagem_superficial' ? (
                  <Waves className="w-3 h-3 text-emerald-700" />
                ) : featureType === 'sinalizacao_horizontal_dispositivo' ? (
                  <CircleDot className="w-3 h-3 text-emerald-700" />
                ) : featureType === 'sinalizacao_horizontal_marca_viaria' ? (
                  <Paintbrush className="w-3 h-3 text-emerald-700" />
                ) : featureType === 'sinalizacao_horizontal_zebrado' ? (
                  <Grid3X3 className="w-3 h-3 text-emerald-700" />
                ) : (
                  <Layers className="w-3 h-3 text-emerald-700" />
                )}
                {featureConfig.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Planilha carregada • {uploadData.sheetNames.length}{' '}
              {uploadData.sheetNames.length === 1 ? 'aba identificada' : 'abas identificadas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          {/* Turbo Mode Action Button */}
          <button
            type="button"
            onClick={() => setIsTurboModeOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer active:scale-98"
            title={
              featureType === 'sinalizacao_vertical' ||
              featureType === 'sinalizacao_horizontal_dispositivo' ||
              featureType === 'sinalizacao_horizontal_marca_viaria' ||
              featureType === 'sinalizacao_horizontal_zebrado'
                ? 'Modo Turbo: Gerar automaticamente XLSX e PDF para todas as rodovias com filtro REPROVADO'
                : 'Modo Turbo: Gerar automaticamente XLSX e PDF para todas as rodovias com filtro PRECÁRIO'
            }
          >
            <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-100 animate-pulse" />
            <span>Modo Turbo</span>
          </button>

          {/* Parcial selector dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-500 font-semibold">Parcial:</span>
            <select
              id="select-parcial-step2"
              value={parcialNumber}
              onChange={(e) => onParcialChange(e.target.value)}
              className="bg-transparent font-bold text-emerald-800 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  Parcial {n}
                </option>
              ))}
            </select>
          </div>

          {/* Feature selector dropdown in step 2 */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-500 font-semibold hidden sm:inline">Modo:</span>
            <select
              value={featureType}
              onChange={(e) => handleFeatureSwitch(e.target.value as DrainageFeatureType)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="drenagem_profunda">Drenagem Profunda</option>
              <option value="drenagem_superficial">Drenagem Superficial</option>
              <option value="sinalizacao_vertical">Sinalização Vertical</option>
              <option value="sinalizacao_horizontal_dispositivo">SH - Dispositivo</option>
              <option value="sinalizacao_horizontal_marca_viaria">SH - Marca Viária</option>
              <option value="sinalizacao_horizontal_zebrado">SH - Zebrado</option>
              <option value="eps_defensa">EPS - Defensa</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onBackToUpload}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors border border-slate-300 bg-white cursor-pointer shadow-2xs"
            title="Voltar para a Etapa 1 e enviar uma nova planilha"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Voltar para Etapa 1</span>
          </button>
        </div>
      </div>

      {/* Sheet Tabs Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-slate-800">
              Escolha a aba a processar:
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Linhas na aba ativa:{' '}
            <strong className="text-slate-800 font-semibold">
              {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas de dados
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {uploadData.sheetNames.map((sheetName) => {
            const isActive = sheetName === activeSheet;
            return (
              <button
                key={sheetName}
                type="button"
                onClick={() => handleSheetChange(sheetName)}
                disabled={isLoadingSheet}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{sheetName}</span>
                {isActive && (
                  <span className="bg-emerald-700/80 px-1.5 py-0.5 rounded text-[10px]">
                    {sheetDetails.totalCols} colunas
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Column Selection & Quick Actions Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Selecione as colunas que deseja MANTER</span>
              <span className="text-xs font-normal text-slate-500">
                (Por padrão, todas iniciam para remoção)
              </span>
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Inicialmente todas as colunas estão marcadas como <strong className="text-rose-600 font-semibold">Remover</strong>. Clique nas colunas para marcá-las como <strong className="text-emerald-600 font-semibold">Manter</strong> e salvá-las no arquivo final.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
              Total: <strong>{totalColumns}</strong> colunas
            </div>
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                keptCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                A manter: <strong>{keptCount}</strong>
              </span>
            </div>
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                removedCount > 0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                A remover: <strong>{removedCount}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* 1. Caixa de Seleção para Seleção Padrão (Drenagem Profunda ou Superficial) */}
        <div
          id="card-selecao-padrao"
          className={`p-4 rounded-xl border transition-all ${
            isPresetActive
              ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/25 shadow-xs'
              : 'bg-slate-50/90 border-slate-200 hover:border-emerald-300/80 hover:bg-emerald-50/30'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label
              htmlFor="checkbox-selecao-padrao"
              className="flex items-start sm:items-center gap-3 cursor-pointer select-none group flex-1"
            >
              <div className="relative flex items-center justify-center mt-0.5 sm:mt-0">
                <input
                  id="checkbox-selecao-padrao"
                  type="checkbox"
                  checked={isPresetActive}
                  onChange={handleToggleDefaultPreset}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                    Seleção Padrão — {featureConfig.name}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isPresetActive
                        ? 'bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {matchedPresetCount} de {featureConfig.fields.length} campos identificados nesta aba
                  </span>
                  {isPresetActive && (
                    <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Ativada ({matchedPresetCount} colunas mantidas)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Campos mantidos pela feature:{' '}
                  <span className="font-mono text-[11px] text-slate-800 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200/60 inline-block mt-0.5">
                    {featureType === 'eps_defensa'
                      ? 'codAuto, km, kmFinal, sentido, tipoDefensa, rodovia, lado, observacao, aparenciaGeral, Foto1, Foto2, Foto3, Foto4'
                      : featureType === 'sinalizacao_horizontal_dispositivo'
                      ? 'CodAuto, TipoHorizontal, Rodovia, Km, Sentido, Bordo, Cor, Resultado Geral, Foto 1 a Foto 5'
                      : featureType === 'sinalizacao_horizontal_marca_viaria'
                      ? 'CodAuto, Rodovia, Km, Sentido, TipoHorizontal, Tipo, Cor, Foto 1 a Foto 5, Resultado'
                      : featureType === 'sinalizacao_horizontal_zebrado'
                      ? 'codAuto, tipoHorizontal, rodovia, km, sentido, cor, resultadoGeral, foto1 a foto5'
                      : featureType === 'sinalizacao_vertical'
                      ? 'codAuto, rodovia, sentido, km, posicao, localizacao, lado, codigoTipo, materialSuporte, largura, altura, metro2, foto1 a foto7, Situação Retrorrefletancia, ObservacaoPlacaDanificada'
                      : featureType === 'drenagem_superficial'
                      ? 'codAuto, Elemento, km, Rodovia, Sentido, ExtensaoReparar, ExtensaoLimpeza, EstadoConservacao, Foto1 a Foto15'
                      : 'codAuto, km, Rodovia, Sentido, TipoMontante, sigla, Limpeza., CaixaDanificada., TampaDanificada/Inxistente, EstadoConservacao, Foto1 a Foto15'}
                  </span>
                </p>
              </div>
            </label>

            <button
              type="button"
              onClick={handleApplyDefaultPreset}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border self-start sm:self-center shrink-0 ${
                isPresetActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs'
              }`}
            >
              {isPresetActive ? 'Padrão Aplicado' : `Aplicar Seleção Padrão (${featureConfig.name})`}
            </button>
          </div>
        </div>

        {/* 2. Caixa de Seleção para Filtro de Linhas: Rodovia */}
        <div
          id="card-filtro-rodovia"
          className={`p-4 rounded-xl border transition-all ${
            rodoviaFilter
              ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-400/25 shadow-xs'
              : 'bg-slate-50/90 border-slate-200 hover:border-sky-300/80 hover:bg-sky-50/20'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                  rodoviaFilter
                    ? 'bg-sky-100 text-sky-800 border-sky-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <Route className="w-4 h-4" />
              </div>

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="select-rodovia"
                    className="text-sm font-bold text-slate-900 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Filtro de Linhas por Rodovia</span>
                  </label>
                  {rodoviaFilter ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 border border-sky-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-sky-700" />
                      Filtro Ativo: {rodoviaFilter}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      Nenhum filtro aplicado (Todas as rodovias)
                    </span>
                  )}
                  {rodoviaColInfo ? (
                    <span className="text-[10px] text-slate-600 font-mono bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                      Coluna alvo: {rodoviaColInfo.name} ({rodoviaColInfo.letter})
                      {availableRodovias.length > 0 && ` • ${availableRodovias.length} ${availableRodovias.length === 1 ? 'rodovia encontrada' : 'rodovias encontradas'}`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                      Coluna Rodovia não encontrada nesta aba
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {rodoviaFilter ? (
                    <span>
                      O filtro selecionará <strong className="text-sky-900 font-bold">{sheetDetails.rodoviaCounts?.[rodoviaFilter]?.toLocaleString('pt-BR') ?? '—'} linhas</strong> de {sheetDetails.totalRows.toLocaleString('pt-BR')} na planilha final. As demais linhas serão removidas do arquivo final.
                    </span>
                  ) : (
                    <span>
                      Nenhum filtro de rodovia aplicado: <strong>todas as {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas</strong> da planilha serão selecionadas.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Dropdown Select Box & Quick Option Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <div className="relative">
                <select
                  id="select-rodovia"
                  value={rodoviaFilter}
                  onChange={(e) => setRodoviaFilter(e.target.value)}
                  className={`w-full sm:w-64 pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-2 transition-all cursor-pointer bg-white ${
                    rodoviaFilter
                      ? 'border-sky-400 text-sky-950 ring-2 ring-sky-400/25 shadow-xs font-bold'
                      : 'border-slate-300 text-slate-700 focus:border-sky-500 focus:ring-sky-500/20'
                  }`}
                >
                  <option value="">Todas as rodovias ({sheetDetails.totalRows.toLocaleString('pt-BR')} linhas)</option>
                  {availableRodovias.map((rodovia) => {
                    const count = sheetDetails.rodoviaCounts?.[rodovia];
                    return (
                      <option key={rodovia} value={rodovia}>
                        {rodovia} {count !== undefined ? `(${count.toLocaleString('pt-BR')} ${count === 1 ? 'linha' : 'linhas'})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {rodoviaFilter && (
                <button
                  type="button"
                  onClick={() => setRodoviaFilter('')}
                  className="px-2.5 py-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-medium border border-slate-200 transition-colors"
                  title="Remover filtro de rodovia"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Caixa de Seleção para Filtro de Linhas: EstadoConservacao / Situação Retrorrefletancia */}
        <div
          id="card-filtro-estado-conservacao"
          className={`p-4 rounded-xl border transition-all ${
            estadoFilter
              ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-400/25 shadow-xs'
              : 'bg-slate-50/90 border-slate-200 hover:border-amber-300/80 hover:bg-amber-50/20'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                  estadoFilter
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <Filter className="w-4 h-4" />
              </div>

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="select-estado-conservacao"
                    className="text-sm font-bold text-slate-900 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>
                      {featureType === 'eps_defensa'
                        ? 'Filtro de Linhas por Aparência Geral'
                        : isHorizontalFeature
                        ? featureType === 'sinalizacao_horizontal_marca_viaria'
                          ? 'Filtro de Linhas por Resultado'
                          : 'Filtro de Linhas por Resultado Geral'
                        : featureType === 'sinalizacao_vertical'
                        ? 'Filtro de Linhas por Situação de Retrorrefletância'
                        : 'Filtro de Linhas por Estado de Conservação'}
                    </span>
                  </label>
                  {estadoFilter ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-amber-700" />
                      Filtro Ativo: {estadoFilter}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      Nenhum filtro aplicado (Todas as linhas)
                    </span>
                  )}
                  {estadoColInfo ? (
                    <span className="text-[10px] text-slate-600 font-mono bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                      Coluna alvo: {estadoColInfo.name} ({estadoColInfo.letter})
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                      {featureType === 'eps_defensa'
                        ? 'Coluna aparenciaGeral não encontrada nesta aba'
                        : isHorizontalFeature
                        ? featureType === 'sinalizacao_horizontal_marca_viaria'
                          ? 'Coluna Resultado não encontrada nesta aba'
                          : 'Coluna Resultado Geral não encontrada nesta aba'
                        : featureType === 'sinalizacao_vertical'
                        ? 'Coluna Situação Retrorrefletancia não encontrada nesta aba'
                        : 'Coluna EstadoConservacao não encontrada nesta aba'}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {estadoFilter ? (
                    <span>
                      O filtro selecionará <strong className="text-amber-900 font-bold">{sheetDetails.estadoCounts?.[estadoFilter]?.toLocaleString('pt-BR') ?? '—'} linhas</strong> de {sheetDetails.totalRows.toLocaleString('pt-BR')} na planilha final. As demais linhas serão removidas do arquivo final.
                    </span>
                  ) : (
                    <span>
                      Nenhum filtro aplicado: <strong>todas as {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas</strong> da planilha serão selecionadas.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Dropdown Select Box & Quick Option Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <div className="relative">
                <select
                  id="select-estado-conservacao"
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value)}
                  className={`w-full sm:w-60 pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-2 transition-all cursor-pointer bg-white ${
                    estadoFilter
                      ? 'border-amber-400 text-amber-950 ring-2 ring-amber-400/25 shadow-xs font-bold'
                      : 'border-slate-300 text-slate-700 focus:border-amber-500 focus:ring-amber-500/20'
                  }`}
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
                        {opt.label} {count !== undefined ? `(${count.toLocaleString('pt-BR')} ${count === 1 ? 'linha' : 'linhas'})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Quick option pill buttons */}
              <div className="flex items-center gap-1 bg-white/90 p-1 rounded-xl border border-slate-200 self-start sm:self-center">
                {activeStatusOptions.map((opt) => {
                  const isSelected = estadoFilter === opt.value;
                  return (
                    <button
                      key={opt.value || 'all'}
                      type="button"
                      onClick={() => setEstadoFilter(opt.value)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? opt.value
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {opt.value || 'Todas'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Banner de Filtros Conjuntos Ativos */}
        {(estadoFilter || rodoviaFilter) && (
          <div className="bg-indigo-50/90 border border-indigo-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-indigo-950 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold flex items-center gap-1.5 text-indigo-900">
                <Filter className="w-3.5 h-3.5 text-indigo-700" />
                Filtragem final da planilha:
              </span>
              {rodoviaFilter && (
                <span className="bg-sky-100 text-sky-950 border border-sky-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Route className="w-3 h-3 text-sky-700" />
                  Rodovia: {rodoviaFilter}
                </span>
              )}
              {rodoviaFilter && estadoFilter && (
                <span className="text-indigo-400 font-black text-sm">+</span>
              )}
              {estadoFilter && (
                <span className="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Filter className="w-3 h-3 text-amber-700" />
                  {isHorizontalFeature
                    ? 'Resultado'
                    : featureType === 'sinalizacao_vertical'
                    ? 'Retrorrefletância'
                    : 'Estado'}
                  : {estadoFilter}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-slate-700">
                Planilha final: <strong className="text-indigo-950 font-bold text-sm">{matchingRealRowsCount.toLocaleString('pt-BR')}</strong> de {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas totais mantidas
              </span>
              <button
                type="button"
                onClick={() => {
                  setRodoviaFilter('');
                  setEstadoFilter('');
                }}
                className="text-[11px] text-indigo-700 hover:text-indigo-900 font-medium underline cursor-pointer ml-1"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}

        {/* Toolbar: Search and Selection Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search column input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar coluna por nome ou letra..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            />
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAllVisible}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Manter Todas</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAllVisible}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-rose-400 hover:bg-rose-50/50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Square className="w-3.5 h-3.5 text-rose-500" />
              <span>Remover Todas</span>
            </button>
            <button
              type="button"
              onClick={handleInvertVisible}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
              <span>Inverter</span>
            </button>
          </div>
        </div>

        {/* Column Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Exibindo {filteredColumns.length} de {totalColumns} colunas
            </span>
            <span className="text-[11px] text-slate-400">
              Verde = Manter • Vermelho / Riscado = Remover
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[440px] overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50 scrollbar-thin">
            {filteredColumns.map((col) => {
              const isKept = selectedForKeeping.has(col.index);
              const isPreset = isDefaultPresetField(col.name, featureType);

              return (
                <div
                  key={col.index}
                  onClick={() => handleToggleColumn(col.index)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-2 shadow-2xs ${
                    isKept
                      ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/25'
                      : 'bg-white border-slate-200 hover:border-slate-300 opacity-75'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                        isKept
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                          {col.letter}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          #{col.index + 1}
                        </span>
                        {isPreset && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs font-semibold truncate mt-0.5 ${
                          isKept
                            ? 'text-slate-900 font-bold'
                            : 'text-slate-500 line-through'
                        }`}
                        title={col.name}
                      >
                        {col.name || <span className="italic text-slate-400">(Sem nome)</span>}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      isKept
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-50 text-rose-600 border border-rose-200'
                    }`}
                  >
                    {isKept ? 'Manter' : 'Remover'}
                  </span>
                </div>
              );
            })}

            {filteredColumns.length === 0 && (
              <div className="col-span-full p-8 text-center text-slate-400 text-xs">
                Nenhuma coluna encontrada com o termo "{searchQuery}".
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive 20-Row Preview Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Eye className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-800">
              Prévia das primeiras 20 linhas
            </h4>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              Mostrando {sheetDetails.previewRows.length} de{' '}
              {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas
            </span>
            {(rodoviaFilter || estadoFilter) && (
              <span className="text-xs bg-indigo-100 text-indigo-950 border border-indigo-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Filter className="w-3 h-3 text-indigo-700" />
                Filtrando {matchingRealRowsCount.toLocaleString('pt-BR')} de {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas no arquivo final
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Clique no cabeçalho das colunas abaixo para alternar entre Manter e Remover.
            </span>
          </div>
        </div>

        {/* The Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto max-h-[380px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <th className="p-2 border-r border-slate-200 text-center w-12 bg-slate-100 text-[11px]">
                    #
                  </th>
                  {sheetDetails.columns.map((col) => {
                    const isKept = selectedForKeeping.has(col.index);
                    return (
                      <th
                        key={col.index}
                        onClick={() => handleToggleColumn(col.index)}
                        className={`p-2.5 border-r border-slate-200 transition-colors cursor-pointer select-none whitespace-nowrap min-w-[140px] max-w-[240px] ${
                          isKept
                            ? 'bg-emerald-100/90 text-emerald-950 border-b-2 border-b-emerald-600'
                            : 'bg-rose-50/70 text-rose-700 opacity-60 border-b-2 border-b-rose-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="truncate font-bold">
                            <span className="text-[10px] font-mono text-slate-500 mr-1">
                              [{col.letter}]
                            </span>
                            <span>{col.name}</span>
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
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
              <tbody className="divide-y divide-slate-100 bg-white">
                {sheetDetails.previewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sheetDetails.columns.length + 1}
                      className="p-8 text-center text-slate-400"
                    >
                      Nenhum dado encontrado nas primeiras linhas desta aba.
                    </td>
                  </tr>
                ) : (
                  sheetDetails.previewRows.map((row, rIdx) => {
                    return (
                      <tr
                        key={rIdx}
                        className={`transition-colors ${
                          rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        } hover:bg-slate-100/60`}
                      >
                        <td className="p-2 border-r border-slate-200 text-slate-400 font-mono text-center text-[11px] bg-slate-50">
                          {rIdx + 1}
                        </td>
                        {sheetDetails.columns.map((col) => {
                          const isKept = selectedForKeeping.has(col.index);
                          const cellValue = row[col.index - sheetDetails.columns[0].index];
                          return (
                            <td
                              key={col.index}
                              className={`p-2 border-r border-slate-100 whitespace-nowrap max-w-[220px] truncate ${
                                !isKept
                                  ? 'bg-rose-50/40 text-rose-400/80 line-through'
                                  : 'text-slate-800 font-medium'
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Error alert if processing failed */}
      {processingError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Atenção</h4>
            <p className="text-rose-700 mt-0.5">{processingError}</p>
          </div>
        </div>
      )}

      {/* Action Footer Button */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-500">
          <div>
            Serão geradas{' '}
            <strong className="text-emerald-700 font-bold">{keptCount} colunas</strong>
            {rodoviaFilter || estadoFilter ? (
              <span>
                {' '}e <strong className="text-indigo-900 font-bold">{matchingRealRowsCount.toLocaleString('pt-BR')} de {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas</strong> na planilha final ({sheetDetails.totalRows - matchingRealRowsCount} linhas serão removidas pelos filtros).
              </span>
            ) : (
              <span>
                {' '}e{' '}
                <strong className="text-slate-800 font-semibold">
                  {sheetDetails.totalRows.toLocaleString('pt-BR')} linhas
                </strong>{' '}
                (todas as linhas)
              </span>
            )}{' '}
            no arquivo gerado de <strong className="text-slate-800 font-semibold">{featureConfig.name}</strong>.
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            A planilha original não será alterada. Um novo arquivo XLSX será criado com cursor posicionado na célula A1.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={onBackToUpload}
            disabled={isProcessing}
            className="px-4 py-3 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Voltar para a Etapa 1 e enviar uma nova planilha"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Voltar para Etapa 1</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTurboModeOpen(true)}
            disabled={isProcessing}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-extrabold text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
            title={
              featureType === 'sinalizacao_vertical'
                ? 'Gera XLSX e PDF para todas as rodovias automaticamente com filtro REPROVADO e Seleção Padrão'
                : 'Gera XLSX e PDF para todas as rodovias automaticamente com filtro PRECÁRIO e Seleção Padrão'
            }
          >
            <Zap className="w-4 h-4 fill-amber-300 text-amber-100" />
            <span>Modo Turbo (XLSX + PDF por Rodovia)</span>
          </button>

          <button
            type="button"
            onClick={handleProcessSpreadsheet}
            disabled={isProcessing || keptCount === 0}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processando e gerando arquivo...</span>
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
