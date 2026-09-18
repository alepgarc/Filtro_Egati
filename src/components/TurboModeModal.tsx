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
import { DrainageFeatureType, ColumnInfo, RowFilterItem, SheetDetails } from '../types';
import {
  DRAINAGE_FEATURES,
  isDefaultPresetField,
  normalizeColKey,
  matchesEstadoFilterFrontend,
  normalizeRodoviaForFeature,
} from '../constants/presets';
import { getAreaIdentifier } from '../utils/fileNaming';

interface TurboModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  originalFileName: string;
  sheetName: string;
  sheetNames?: string[];
  featureType: DrainageFeatureType;
  allColumns: ColumnInfo[];
  availableRodovias: string[];
  rowFiltersData?: RowFilterItem[];
  totalRows: number;
  onBackToUpload?: () => void;
  parcialNumber?: string;
  onParcialChange?: (parcial: string) => void;
}

interface RodoviaProcessItem {
  id: string;
  rodovia: string;
  tabName?: string;
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
  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(downloadUrl);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || contentType.includes('text/html')) {
        let errText = '';
        try {
          errText = await response.text();
        } catch {}

        let serverMsg = '';
        if (errText) {
          try {
            const parsedJson = JSON.parse(errText);
            serverMsg = parsedJson.error || parsedJson.message || '';
          } catch {
            if (!errText.includes('<!doctype') && !errText.includes('<html')) {
              serverMsg = errText.trim();
            }
          }
        }

        if (serverMsg) {
          throw new Error(serverMsg);
        }

        if (contentType.includes('text/html') || errText.includes('<!doctype') || errText.includes('<html')) {
          throw new Error(`HTTP ${response.status}: Resposta inválida do servidor (HTML em vez de arquivo binário).`);
        }
        throw new Error(errText || `HTTP ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      if (!blob || blob.size < 100) {
        throw new Error(`Arquivo recebido inválido ou muito pequeno (${blob?.size || 0} bytes).`);
      }

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
            console.log('Salvar arquivo cancelado pelo usuário no diálogo.');
            return false;
          }
          // Fallback to standard download if picker is blocked
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
    } catch (err: any) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  console.error(`Erro ao salvar arquivo ${suggestedName} no Modo Turbo:`, lastErr);
  throw lastErr || new Error(`Falha ao salvar ${suggestedName}`);
}

export const TurboModeModal: React.FC<TurboModeModalProps> = ({
  isOpen,
  onClose,
  fileId,
  originalFileName,
  sheetName,
  sheetNames,
  featureType,
  allColumns,
  availableRodovias,
  rowFiltersData,
  totalRows,
  onBackToUpload,
  parcialNumber = '1',
  onParcialChange,
}) => {
  const [localParcial, setLocalParcial] = useState<string>(parcialNumber || '1');

  useEffect(() => {
    if (parcialNumber) {
      setLocalParcial(parcialNumber);
    }
  }, [parcialNumber]);

  const handleParcialSelect = (val: string) => {
    setLocalParcial(val);
    onParcialChange?.(val);
  };

  const isReprovadoFeature =
    featureType === 'sinalizacao_vertical' ||
    featureType === 'sinalizacao_horizontal_dispositivo' ||
    featureType === 'sinalizacao_horizontal_marca_viaria' ||
    featureType === 'sinalizacao_horizontal_zebrado';
  const defaultFilterValue =
    featureType === 'eps_defensa' ? 'Todos' : isReprovadoFeature ? 'Reprovado' : 'PRECÁRIO';

  const [items, setItems] = useState<RodoviaProcessItem[]>([]);
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState<string>(defaultFilterValue);

  // Synchronize filter when modal opens or featureType changes
  useEffect(() => {
    if (isOpen) {
      setSelectedEstadoFilter(defaultFilterValue);
    }
  }, [isOpen, featureType, defaultFilterValue]);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [currentStepText, setCurrentStepText] = useState<string>('');
  const [overallError, setOverallError] = useState<string | null>(null);
  const [tabsData, setTabsData] = useState<Record<string, SheetDetails>>({});
  const [isLoadingTabs, setIsLoadingTabs] = useState<boolean>(false);

  const abortControllerRef = useRef<boolean>(false);

  const featureConfig = DRAINAGE_FEATURES[featureType];

  // For EPS-Defensa, target the 3 specific tabs
  const targetSheets = React.useMemo(() => {
    if (featureType === 'eps_defensa') {
      const expected = ['Barreira de Concreto', 'Defensa Metalica', 'Defensa OAE'];
      if (sheetNames && sheetNames.length > 0) {
        const matched = sheetNames.filter((sn) => {
          const normSn = normalizeColKey(sn);
          return expected.some((exp) => {
            const normExp = normalizeColKey(exp);
            return (
              normSn === normExp ||
              normSn.includes(normExp) ||
              normExp.includes(normSn) ||
              normSn.replace(/s$/g, '') === normExp.replace(/s$/g, '')
            );
          });
        });
        return matched.length > 0 ? matched : sheetNames;
      }
      return expected;
    }
    return [sheetName];
  }, [featureType, sheetNames, sheetName]);

  // Fetch details for all tabs when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadTabs = async () => {
      setIsLoadingTabs(true);
      const newTabsData: Record<string, SheetDetails> = {};

      // Seed current active tab
      if (sheetName) {
        newTabsData[sheetName] = {
          headers: [],
          columns: allColumns,
          totalRows,
          totalCols: allColumns.length,
          previewRows: [],
          rodoviaOptions: availableRodovias,
          rowFiltersData: rowFiltersData || [],
        };
      }

      // Fetch other target sheets if multi-tab
      const missingSheets = targetSheets.filter((tab) => tab !== sheetName);
      if (missingSheets.length > 0) {
        await Promise.all(
          missingSheets.map(async (tab) => {
            try {
              const res = await fetch(
                `/api/sheet-details/${fileId}/${encodeURIComponent(tab)}?featureType=${featureType}`
              );
              if (res.ok) {
                const text = await res.text();
                const json = JSON.parse(text);
                const details: SheetDetails = json.sheetDetails || json;
                newTabsData[tab] = details;
              }
            } catch (err) {
              console.warn(`Could not load details for tab ${tab}:`, err);
            }
          })
        );
      }

      if (isMounted) {
        setTabsData((prev) => ({ ...prev, ...newTabsData }));
        setIsLoadingTabs(false);
      }
    };

    loadTabs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, fileId, sheetName, targetSheets, featureType, allColumns, availableRodovias, rowFiltersData, totalRows]);

  // Extract all unique non-empty status values from rowFiltersData
  const availableStatusOptions = React.useMemo(() => {
    if (featureType === 'eps_defensa') {
      return ['Todos'];
    }

    const seenNorm = new Set<string>();
    const uniqueOptions: string[] = [];

    const addOption = (val: string) => {
      const norm = normalizeColKey(val);
      if (!seenNorm.has(norm)) {
        seenNorm.add(norm);
        uniqueOptions.push(val);
      }
    };

    addOption(defaultFilterValue);

    if (rowFiltersData && rowFiltersData.length > 0) {
      rowFiltersData.forEach((row) => {
        if (row.e && row.e.trim()) {
          addOption(row.e.trim());
        }
      });
    }

    addOption('Todos');
    return uniqueOptions;
  }, [rowFiltersData, defaultFilterValue, featureType]);

  // Initialize and update items when modal opens, tabs load, or inputs/filters change
  useEffect(() => {
    if (!isOpen) return;

    abortControllerRef.current = false;
    setIsRunning(false);
    setIsFinished(false);
    setCurrentProcessingIndex(-1);
    setCurrentStepText('');
    setOverallError(null);

    const list: RodoviaProcessItem[] = [];

    targetSheets.forEach((tab) => {
      const tabInfo =
        tabsData[tab] ||
        (tab === sheetName
          ? {
              columns: allColumns,
              rodoviaOptions: availableRodovias,
              rowFiltersData: rowFiltersData || [],
              totalRows,
            }
          : null);

      const rawTabRodovias = tabInfo?.rodoviaOptions || (tab === sheetName ? availableRodovias : []);
      const tabRowsData = tabInfo?.rowFiltersData || (tab === sheetName ? rowFiltersData || [] : []);
      const tabTotalRows = tabInfo?.totalRows ?? (tab === sheetName ? totalRows : 0);

      // Normalize rodovias (e.g. for EPS - Defensa, "BR/376 CN", "BR/376 TU", "BR-376 PR" coalesce to "BR/376")
      const normalizedRodoviaSet = new Set<string>();
      rawTabRodovias.forEach((r) => {
        if (r && r.trim()) {
          normalizedRodoviaSet.add(normalizeRodoviaForFeature(r, featureType));
        }
      });
      const tabRodovias = Array.from(normalizedRodoviaSet);

      if (tabRodovias.length > 0) {
        tabRodovias.forEach((rod) => {
          let precaroCount = 0;
          let totalCount = 0;

          if (tabRowsData.length > 0) {
            tabRowsData.forEach((row) => {
              const rowRodNorm = normalizeRodoviaForFeature(row.r, featureType);
              if (
                normalizeColKey(rowRodNorm) === normalizeColKey(rod) ||
                rowRodNorm === rod ||
                normalizeColKey(row.r) === normalizeColKey(rod)
              ) {
                totalCount++;
                if (matchesEstadoFilterFrontend(row.e, selectedEstadoFilter)) {
                  precaroCount++;
                }
              }
            });
          }

          const isSelected =
            selectedEstadoFilter.toLowerCase() === 'todos'
              ? totalCount > 0
              : tabRowsData.length > 0
              ? precaroCount > 0
              : true;

          list.push({
            id: `${tab}__${rod}`,
            rodovia: rod,
            tabName: tab,
            precaroCount,
            totalCount,
            selected: isSelected,
            status: 'idle',
          });
        });
      } else {
        let precaroCount = 0;
        if (tabRowsData.length > 0) {
          precaroCount = tabRowsData.filter((r) => {
            return matchesEstadoFilterFrontend(r.e, selectedEstadoFilter);
          }).length;
        }

        const isSelected =
          selectedEstadoFilter.toLowerCase() === 'todos'
            ? true
            : tabRowsData.length > 0
            ? precaroCount > 0
            : true;

        list.push({
          id: `${tab}__geral`,
          rodovia: 'Todas as Rodovias (Geral)',
          tabName: tab,
          precaroCount,
          totalCount: tabTotalRows,
          selected: isSelected,
          status: 'idle',
        });
      }
    });

    setItems(list);
  }, [
    isOpen,
    tabsData,
    availableRodovias,
    rowFiltersData,
    totalRows,
    featureType,
    selectedEstadoFilter,
    targetSheets,
    sheetName,
    allColumns,
  ]);

  if (!isOpen) return null;

  // Preset fields matching
  const presetMatchingIndices = allColumns
    .filter((col) => isDefaultPresetField(col.name, featureType, true))
    .map((col) => col.index);

  const columnIndicesToRemove = allColumns
    .filter((col) => !presetMatchingIndices.includes(col.index))
    .map((col) => col.index);

  const selectedItems = items.filter((it) => it.selected);
  const completedCount = items.filter((it) => it.status === 'completed').length;
  const totalSelectedCount = selectedItems.length;

  const toggleSelect = (id: string) => {
    if (isRunning) return;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
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
    const tabColsToRemoveCache = new Map<string, number[]>();

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (abortControllerRef.current) {
        break;
      }

      const item = itemsToProcess[i];
      const actualIndex = items.findIndex((it) => it.id === item.id);
      setCurrentProcessingIndex(actualIndex);

      const targetTab = item.tabName || sheetName;
      let colsToRemove: number[];
      if (tabColsToRemoveCache.has(targetTab)) {
        colsToRemove = tabColsToRemoveCache.get(targetTab)!;
      } else if (tabsData[targetTab]?.columns && tabsData[targetTab].columns.length > 0) {
        const cols = tabsData[targetTab].columns;
        const keepCols = cols
          .filter((c: any) => isDefaultPresetField(c.name, featureType, true))
          .map((c: any) => c.index);
        colsToRemove =
          keepCols.length > 0
            ? cols.filter((c: any) => !keepCols.includes(c.index)).map((c: any) => c.index)
            : [];
        tabColsToRemoveCache.set(targetTab, colsToRemove);
      } else if (targetTab === sheetName) {
        colsToRemove = columnIndicesToRemove;
        tabColsToRemoveCache.set(targetTab, colsToRemove);
      } else {
        try {
          const tabDetailsRes = await fetch(
            `/api/sheet-details/${fileId}/${encodeURIComponent(targetTab)}?featureType=${featureType}`
          );
          if (tabDetailsRes.ok) {
            const tabText = await tabDetailsRes.text();
            try {
              const tabDetails = JSON.parse(tabText);
              const cols = tabDetails.sheetDetails?.columns || tabDetails.columns || [];
              const keepCols = cols
                .filter((c: any) => isDefaultPresetField(c.name, featureType, true))
                .map((c: any) => c.index);
              colsToRemove =
                keepCols.length > 0
                  ? cols
                      .filter((c: any) => !keepCols.includes(c.index))
                      .map((c: any) => c.index)
                  : [];
            } catch {
              colsToRemove = columnIndicesToRemove;
            }
          } else {
            colsToRemove = columnIndicesToRemove;
          }
        } catch {
          colsToRemove = columnIndicesToRemove;
        }
        tabColsToRemoveCache.set(targetTab, colsToRemove);
      }

      const rodoviaFilterParam =
        item.rodovia === 'Todas as Rodovias (Geral)' ? null : item.rodovia;

      try {
        const tabDesc = item.tabName ? `[${item.tabName}] ` : '';
        // Step 1: Generate processed XLSX via backend with retry
        setCurrentStepText(
          `[${i + 1}/${itemsToProcess.length}] Gerando planilha XLSX para ${tabDesc}${item.rodovia}...`
        );

        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: 'processing-xlsx', errorMessage: undefined } : it
          )
        );

        let processResult: any = null;
        let processErr: any = null;

        for (let pAttempt = 1; pAttempt <= 3; pAttempt++) {
          try {
            const processRes = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileId,
                sheetName: targetTab,
                columnIndicesToRemove: colsToRemove,
                estadoConservacaoFilter:
                  featureType === 'eps_defensa' || selectedEstadoFilter.toLowerCase() === 'todos'
                    ? null
                    : selectedEstadoFilter.trim() !== ''
                    ? selectedEstadoFilter
                    : null,
                rodoviaFilter: rodoviaFilterParam,
                featureType,
                parcialNumber: localParcial,
              }),
            });

            const text = await processRes.text();

            if (!processRes.ok) {
              let errMsg = `HTTP ${processRes.status}`;
              try {
                const errData = JSON.parse(text);
                errMsg = errData.error || errMsg;
              } catch {
                if (text && !text.includes('<!doctype') && !text.includes('<html')) {
                  errMsg = text.trim();
                }
              }
              throw new Error(errMsg);
            }

            try {
              processResult = JSON.parse(text);
            } catch {
              throw new Error(`Resposta inválida do servidor ao processar ${item.rodovia}: ${text.slice(0, 120)}`);
            }
            break;
          } catch (e: any) {
            processErr = e;
            if (pAttempt < 3 && !abortControllerRef.current) {
              await new Promise((r) => setTimeout(r, 1200));
            }
          }
        }

        if (!processResult) {
          throw processErr || new Error('Erro ao processar planilha.');
        }

        const downloadId = processResult.downloadId;
        const xlsxFileName = processResult.fileName;
        const xlsxDownloadUrl = processResult.downloadUrl;
        const pdfDownloadUrl = processResult.pdfDownloadUrl;

        // Build clean PDF file name
        const cleanBaseName = xlsxFileName.replace(/\.xlsx$/i, '');
        const pdfFileName = `${cleanBaseName}.pdf`;

        // Update item with download URLs
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
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
          prev.map((it) => (it.id === item.id ? { ...it, status: 'processing-pdf' } : it))
        );

        await saveBlobWithPicker(pdfDownloadUrl, pdfFileName, 'application/pdf');

        // Pause briefly before next rodovia
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Mark this item as completed
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'completed' } : it))
        );
      } catch (err: any) {
        console.error(`Erro ao processar ${item.rodovia}:`, err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Parcial</div>
                    <div className="text-[11px] text-slate-500">Identificação</div>
                  </div>
                </div>
                <select
                  value={localParcial}
                  onChange={(e) => handleParcialSelect(e.target.value)}
                  disabled={isRunning}
                  className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>
                      Parcial {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800">Seleção Padrão</div>
                  <div className="text-[11px] text-slate-500">
                    {presetMatchingIndices.length} colunas mantidas
                  </div>
                </div>
              </div>

              {featureType === 'eps_defensa' ? (
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Sem Filtro de Estado</div>
                    <div className="text-[11px] text-slate-500">
                      Todos os registros por rodovia
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <Filter className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">
                        Status
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Filtrar por situação
                      </div>
                    </div>
                  </div>
                  <select
                    value={selectedEstadoFilter}
                    onChange={(e) => setSelectedEstadoFilter(e.target.value)}
                    disabled={isRunning}
                    className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
                  >
                    {availableStatusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'Todos' ? 'Todos' : opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Standard Naming format preview */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Padrão de nome:</span>
                <code className="font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Parcial {localParcial || '1'}{getAreaIdentifier(featureType, sheetName) || '_'}BR-369.xlsx / .pdf
                </code>
              </div>
              <span className="text-slate-400 font-medium">Formato: Parcial + Área + Rodovia</span>
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
                    key={item.id}
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
                        onChange={() => toggleSelect(item.id)}
                        disabled={isRunning}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.tabName && (
                            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                              {item.tabName}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900">
                            {item.rodovia}
                          </span>
                          {featureType === 'eps_defensa' ? (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded-md">
                              {item.totalCount} {item.totalCount === 1 ? 'registro' : 'registros'}
                            </span>
                          ) : item.precaroCount > 0 ? (
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
                {isFinished && onBackToUpload && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onBackToUpload();
                    }}
                    className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Concluir e voltar para a Etapa 1 para enviar outra planilha"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Voltar para Etapa 1</span>
                  </button>
                )}

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
