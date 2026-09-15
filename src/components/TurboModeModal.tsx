import React, { useState, useRef, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  FileText,
  Download,
  X,
  Play,
  RotateCcw,
  CheckSquare,
  Square,
  Route,
  Filter,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { DrainageFeatureType, ColumnInfo, RowFilterItem } from '../types';
import {
  DRAINAGE_FEATURES,
  isDefaultPresetField,
  normalizeColKey,
} from '../constants/presets';

interface TurboModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  originalFileName: string;
  sheetName: string;
  featureType: DrainageFeatureType;
  allColumns: ColumnInfo[];
  availableRodovias: string[];
  rowFiltersData?: RowFilterItem[];
  totalRows: number;
}

interface RodoviaProcessItem {
  rodovia: string;
  precaroCount: number;
  totalCount: number;
  selected: boolean;
  status: 'idle' | 'processing-xlsx' | 'processing-pdf' | 'completed' | 'error';
  xlsxFileName?: string;
  pdfFileName?: string;
  xlsxDownloadUrl?: string;
  pdfDownloadUrl?: string;
  downloadId?: string;
  errorMessage?: string;
}

/**
 * Downloads a blob triggering either showSaveFilePicker (if supported) or fallback anchor download.
 */
async function saveBlobWithPicker(
  downloadUrl: string,
  suggestedName: string,
  mimeType: string
): Promise<boolean> {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo: ${response.statusText}`);
    }
    const blob = await response.blob();

    // 1. Try modern File System Access API (showSaveFilePicker) if supported in current browser & context
    if ('showSaveFilePicker' in window && window.self === window.top) {
      try {
        const isPdf = suggestedName.toLowerCase().endsWith('.pdf');
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: isPdf ? 'Documento PDF' : 'Planilha Microsoft Excel',
              accept: {
                [mimeType]: [isPdf ? '.pdf' : '.xlsx'],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (pickerErr: any) {
        if (pickerErr.name === 'AbortError') {
          // User deliberately cancelled the file picker dialog
          console.log('Salvar arquivo cancelado pelo usuário no diálogo.');
          return false;
        }
        // Fallback to standard download if picker is blocked (e.g. inside iframe)
      }
    }

    // 2. Standard browser anchor download
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 10000);

    return true;
  } catch (err) {
    console.error('Erro ao salvar arquivo no Modo Turbo:', err);
    throw err;
  }
}

export const TurboModeModal: React.FC<TurboModeModalProps> = ({
  isOpen,
  onClose,
  fileId,
  originalFileName,
  sheetName,
  featureType,
  allColumns,
  availableRodovias,
  rowFiltersData,
  totalRows,
}) => {
  const [items, setItems] = useState<RodoviaProcessItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [currentStepText, setCurrentStepText] = useState<string>('');
  const [overallError, setOverallError] = useState<string | null>(null);

  const abortControllerRef = useRef<boolean>(false);

  const featureConfig = DRAINAGE_FEATURES[featureType];

  // Initialize items when modal opens or inputs change
  useEffect(() => {
    if (!isOpen) return;

    abortControllerRef.current = false;
    setIsRunning(false);
    setIsFinished(false);
    setCurrentProcessingIndex(-1);
    setCurrentStepText('');
    setOverallError(null);

    // Calculate rodovia items with target filter count (Reprovado for Sinalização Vertical, PRECÁRIO for others)
    const isVerticalSignal = featureType === 'sinalizacao_vertical';
    const targetFilterValue = isVerticalSignal ? 'Reprovado' : 'PRECÁRIO';
    const targetFilterNorm = normalizeColKey(targetFilterValue);

    const list: RodoviaProcessItem[] = [];

    if (availableRodovias.length > 0) {
      availableRodovias.forEach((rod) => {
        let precaroCount = 0;
        let totalCount = 0;

        if (rowFiltersData && rowFiltersData.length > 0) {
          rowFiltersData.forEach((row) => {
            if (normalizeColKey(row.r) === normalizeColKey(rod)) {
              totalCount++;
              if (normalizeColKey(row.e) === targetFilterNorm) {
                precaroCount++;
              }
            }
          });
        }

        list.push({
          rodovia: rod,
          precaroCount,
          totalCount,
          // Select by default if it has target filter records, or if no rowFiltersData is available
          selected: rowFiltersData && rowFiltersData.length > 0 ? precaroCount > 0 : true,
          status: 'idle',
        });
      });
    } else {
      // If no rodovias are identified, create a single item representing the whole sheet with target filter
      let precaroCount = 0;
      if (rowFiltersData && rowFiltersData.length > 0) {
        precaroCount = rowFiltersData.filter((r) => normalizeColKey(r.e) === targetFilterNorm).length;
      }
      list.push({
        rodovia: 'Todas as Rodovias (Geral)',
        precaroCount,
        totalCount: totalRows,
        selected: true,
        status: 'idle',
      });
    }

    setItems(list);
  }, [isOpen, availableRodovias, rowFiltersData, totalRows, featureType]);

  if (!isOpen) return null;

  // Preset fields matching
  const presetMatchingIndices = allColumns
    .filter((col) => isDefaultPresetField(col.name, featureType))
    .map((col) => col.index);

  const columnIndicesToRemove = allColumns
    .filter((col) => !presetMatchingIndices.includes(col.index))
    .map((col) => col.index);

  const selectedItems = items.filter((it) => it.selected);
  const completedCount = items.filter((it) => it.status === 'completed').length;
  const totalSelectedCount = selectedItems.length;

  const toggleSelect = (rodovia: string) => {
    if (isRunning) return;
    setItems((prev) =>
      prev.map((it) => (it.rodovia === rodovia ? { ...it, selected: !it.selected } : it))
    );
  };

  const handleSelectAll = () => {
    if (isRunning) return;
    setItems((prev) => prev.map((it) => ({ ...it, selected: true })));
  };

  const handleDeselectAll = () => {
    if (isRunning) return;
    setItems((prev) => prev.map((it) => ({ ...it, selected: false })));
  };

  const handleCancelProcess = () => {
    abortControllerRef.current = true;
    setIsRunning(false);
    setCurrentStepText('Processamento cancelado pelo usuário.');
  };

  const handleStartTurboMode = async () => {
    if (totalSelectedCount === 0) {
      setOverallError('Selecione pelo menos 1 rodovia para processar.');
      return;
    }

    abortControllerRef.current = false;
    setIsRunning(true);
    setIsFinished(false);
    setOverallError(null);

    const itemsToProcess = items.filter((it) => it.selected);

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (abortControllerRef.current) {
        break;
      }

      const item = itemsToProcess[i];
      const actualIndex = items.findIndex((it) => it.rodovia === item.rodovia);
      setCurrentProcessingIndex(actualIndex);

      const rodoviaFilterParam =
        item.rodovia === 'Todas as Rodovias (Geral)' ? null : item.rodovia;

      try {
        // Step 1: Generate processed XLSX via backend
        setCurrentStepText(
          `[${i + 1}/${itemsToProcess.length}] Gerando planilha XLSX para ${item.rodovia}...`
        );

        setItems((prev) =>
          prev.map((it, idx) =>
            idx === actualIndex ? { ...it, status: 'processing-xlsx', errorMessage: undefined } : it
          )
        );

        const processRes = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            sheetName,
            columnIndicesToRemove,
            estadoConservacaoFilter:
              featureType === 'sinalizacao_vertical' ? 'Reprovado' : 'PRECÁRIO',
            rodoviaFilter: rodoviaFilterParam,
            featureType,
          }),
        });

        if (!processRes.ok) {
          const errData = await processRes.json();
          throw new Error(errData.error || 'Erro ao processar planilha.');
        }

        const processResult = await processRes.json();
        const downloadId = processResult.downloadId;
        const xlsxFileName = processResult.fileName;
        const xlsxDownloadUrl = processResult.downloadUrl;
        const pdfDownloadUrl = processResult.pdfDownloadUrl;

        // Build clean PDF file name
        const cleanBaseName = xlsxFileName.replace(/\.xlsx$/i, '');
        const pdfFileName = `${cleanBaseName}.pdf`;

        // Update item with download URLs
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === actualIndex
              ? {
                  ...it,
                  downloadId,
                  xlsxFileName,
                  pdfFileName,
                  xlsxDownloadUrl,
                  pdfDownloadUrl,
                  status: 'processing-xlsx',
                }
              : it
          )
        );

        if (abortControllerRef.current) break;

        // Step 2: Download / Save dialog for XLSX
        setCurrentStepText(
          `[${i + 1}/${itemsToProcess.length}] Salvando planilha Excel (${xlsxFileName})...`
        );
        await saveBlobWithPicker(
          xlsxDownloadUrl,
          xlsxFileName,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        // Pause briefly before PDF step for smooth UI & browser handling
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (abortControllerRef.current) break;

        // Step 3: Download / Save dialog for PDF
        setCurrentStepText(
          `[${i + 1}/${itemsToProcess.length}] Gerando e salvando relatório PDF (${pdfFileName})...`
        );
        setItems((prev) =>
          prev.map((it, idx) => (idx === actualIndex ? { ...it, status: 'processing-pdf' } : it))
        );

        await saveBlobWithPicker(pdfDownloadUrl, pdfFileName, 'application/pdf');

        // Pause briefly before next rodovia
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Mark this rodovia as completed
        setItems((prev) =>
          prev.map((it, idx) => (idx === actualIndex ? { ...it, status: 'completed' } : it))
        );
      } catch (err: any) {
        console.error(`Erro ao processar rodovia ${item.rodovia}:`, err);
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === actualIndex
              ? { ...it, status: 'error', errorMessage: err.message || 'Falha no processamento' }
              : it
          )
        );
      }
    }

    setIsRunning(false);
    setCurrentProcessingIndex(-1);
    setIsFinished(true);
    setCurrentStepText(
      abortControllerRef.current
        ? 'Processamento interrompido.'
        : 'Todos os arquivos foram gerados e baixados com sucesso!'
    );
  };

  const progressPercent =
    totalSelectedCount > 0 ? Math.round((completedCount / totalSelectedCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header with Turbo Accent Gradient */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/30 text-amber-200">
              <Zap className="w-6 h-6 fill-amber-300 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  Modo Turbo — Processamento em Lote
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full border border-white/30">
                  Automático
                </span>
              </div>
              <p className="text-xs text-white/90 font-medium">
                Geração sequencial e automática de <strong>XLSX</strong> e <strong>PDF</strong> para
                todas as rodovias
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {/* Active Preset & Filters Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-slate-900">
                  Parâmetros Fixos do Modo Turbo:
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                Feature: {featureConfig.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800">Seleção Padrão Ativada</div>
                  <div className="text-[11px] text-slate-500">
                    {presetMatchingIndices.length} colunas padronizadas mantidas
                  </div>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800">
                    {featureType === 'sinalizacao_vertical'
                      ? 'Situação de Retrorrefletância'
                      : 'Estado de Conservação'}
                  </div>
                  <div className="text-[11px] text-amber-700 font-bold">
                    {featureType === 'sinalizacao_vertical'
                      ? 'Filtro: REPROVADO (apenas placas reprovadas)'
                      : 'Filtro: PRECÁRIO (apenas linhas precárias)'}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-amber-50/80 border border-amber-200/80 rounded-lg p-2.5 flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                O Modo Turbo executa o processamento para cada rodovia separadamente. Conforme cada
                arquivo (XLSX e PDF) for concluído, a caixa de diálogo do navegador abrirá
                automaticamente para escolha do local e nome do arquivo.
              </span>
            </div>
          </div>

          {/* Realtime Progress Bar when Running or Finished */}
          {(isRunning || isFinished) && (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-950">
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                  <span>{currentStepText}</span>
                </div>
                <span className="font-mono font-bold text-emerald-900">
                  {completedCount} de {totalSelectedCount} concluídas ({progressPercent}%)
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Rodovias List Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-900">
                  Rodovias encontradas na planilha ({items.length}):
                </span>
              </div>

              {!isRunning && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer underline"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer underline"
                  >
                    Desmarcar
                  </button>
                </div>
              )}
            </div>

            {/* List of Rodovias */}
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[260px] overflow-y-auto bg-white scrollbar-thin">
              {items.map((item, index) => {
                const isCurrent = currentProcessingIndex === index;
                return (
                  <div
                    key={item.rodovia}
                    className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                      isCurrent
                        ? 'bg-amber-50/80 ring-1 ring-amber-300'
                        : item.status === 'completed'
                        ? 'bg-emerald-50/50'
                        : item.status === 'error'
                        ? 'bg-rose-50/50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <label
                      className={`flex items-center gap-3 flex-1 select-none ${
                        isRunning ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleSelect(item.rodovia)}
                        disabled={isRunning}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            {item.rodovia}
                          </span>
                          {item.precaroCount > 0 ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-md">
                              {item.precaroCount}{' '}
                              {featureType === 'sinalizacao_vertical'
                                ? item.precaroCount === 1
                                  ? 'registro REPROVADO'
                                  : 'registros REPROVADOS'
                                : item.precaroCount === 1
                                ? 'registro PRECÁRIO'
                                : 'registros PRECÁRIOS'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-md">
                              0 {featureType === 'sinalizacao_vertical' ? 'reprovados' : 'precários'} ({item.totalCount} total)
                            </span>
                          )}
                        </div>
                        {item.errorMessage && (
                          <p className="text-[11px] text-rose-600 mt-0.5">{item.errorMessage}</p>
                        )}
                      </div>
                    </label>

                    {/* Status Badge & Download Links */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'idle' && (
                        <span className="text-[11px] text-slate-400 font-medium">Aguardando</span>
                      )}

                      {item.status === 'processing-xlsx' && (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Gerando XLSX...
                        </span>
                      )}

                      {item.status === 'processing-pdf' && (
                        <span className="text-[11px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Gerando PDF...
                        </span>
                      )}

                      {item.status === 'completed' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Concluído
                          </span>
                          {item.xlsxDownloadUrl && (
                            <a
                              href={item.xlsxDownloadUrl}
                              download={item.xlsxFileName}
                              className="p-1 rounded-md text-slate-600 hover:text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title={`Baixar planilha XLSX (${item.xlsxFileName})`}
                            >
                              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                            </a>
                          )}
                          {item.pdfDownloadUrl && (
                            <a
                              href={item.pdfDownloadUrl}
                              download={item.pdfFileName}
                              className="p-1 rounded-md text-slate-600 hover:text-red-700 hover:bg-red-100 transition-colors"
                              title={`Baixar relatório PDF (${item.pdfFileName})`}
                            >
                              <FileText className="w-4 h-4 text-rose-700" />
                            </a>
                          )}
                        </div>
                      )}

                      {item.status === 'error' && (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Falhou
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {overallError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{overallError}</span>
            </div>
          )}
        </div>

        {/* Footer with Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            {isRunning ? (
              <span className="flex items-center gap-2 text-amber-800 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                Processando arquivos em sequência...
              </span>
            ) : isFinished ? (
              <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Processamento concluído com sucesso ({completedCount} de {totalSelectedCount} rodovias)
              </span>
            ) : (
              <span>
                <strong>{totalSelectedCount}</strong> {totalSelectedCount === 1 ? 'rodovia selecionada' : 'rodovias selecionadas'} para processamento em lote.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isRunning ? (
              <button
                type="button"
                onClick={handleCancelProcess}
                className="px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar Processamento
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                >
                  {isFinished ? 'Fechar' : 'Cancelar'}
                </button>

                <button
                  type="button"
                  onClick={handleStartTurboMode}
                  disabled={totalSelectedCount === 0}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-extrabold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap className="w-4 h-4 fill-amber-300 text-amber-100" />
                  <span>
                    {isFinished
                      ? 'Executar Novamente'
                      : `Iniciar Modo Turbo (${totalSelectedCount} ${totalSelectedCount === 1 ? 'Rodovia' : 'Rodovias'})`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
