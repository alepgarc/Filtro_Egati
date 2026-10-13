import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Database,
  Layers,
  Waves,
  Milestone,
  CircleDot,
  Paintbrush,
  Grid3X3,
  Shield,
  Mountain,
} from 'lucide-react';
import { UploadResponse, DrainageFeatureType } from '../types';
import { DRAINAGE_FEATURES } from '../constants/presets';
import { APP_VERSION } from '../constants/version';
import { getAreaIdentifier } from '../utils/fileNaming';

interface UploadStepProps {
  selectedFeature: DrainageFeatureType;
  onFeatureChange: (feature: DrainageFeatureType) => void;
  parcialNumber: string;
  onParcialChange: (parcial: string) => void;
  onUploadSuccess: (data: UploadResponse) => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({
  selectedFeature,
  onFeatureChange,
  parcialNumber,
  onParcialChange,
  onUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSuccessDataRef = useRef<UploadResponse | null>(null);

  const [uploadedPartsMap, setUploadedPartsMap] = useState<Record<string, string[]>>({});
  const currentSessionKey = selectedFeature;
  const currentParts = uploadedPartsMap[currentSessionKey] || [];

  // Reset state and file input on mount or feature change
  useEffect(() => {
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatusText('');
    setErrorMessage(null);
    setSelectedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedFeature, parcialNumber]);

  // Prevent browser from opening files dragged outside the dropzone
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);
    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadSingleFile = async (
    file: File,
    fileIndex: number,
    totalFiles: number
  ): Promise<UploadResponse> => {
    // 1. Validate file extension (.xlsx or .xls)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      throw new Error(`Arquivo "${file.name}" possui formato inválido. Use apenas .xlsx ou .xls.`);
    }

    // 2. Validate file size (600 MB maximum)
    const MAX_SIZE = 600 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error(
        `O arquivo "${file.name}" ultrapassa o limite de 600 MB (${formatFileSize(file.size)}).`
      );
    }

    const CHUNK_SIZE = 16 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    setSelectedFileName(file.name);
    setUploadStatusText(
      totalFiles > 1
        ? `[Planilha ${fileIndex + 1} de ${totalFiles}] Preparando ${file.name}...`
        : totalChunks > 1
        ? `Preparando envio seguro em ${totalChunks} blocos de ${formatFileSize(CHUNK_SIZE)}...`
        : 'Enviando arquivo para o servidor...'
    );

    let finalData: UploadResponse | null = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const isLastChunk = chunkIndex === totalChunks - 1;

      if (totalFiles > 1) {
        setUploadStatusText(
          `[Planilha ${fileIndex + 1} de ${totalFiles}] ${file.name} - Bloco ${chunkIndex + 1}/${totalChunks} (${formatFileSize(end)} de ${formatFileSize(file.size)})`
        );
      } else if (totalChunks > 1) {
        setUploadStatusText(
          isLastChunk
            ? `Enviando e montando bloco final ${chunkIndex + 1} de ${totalChunks}...`
            : `Enviando bloco ${chunkIndex + 1} de ${totalChunks} (${formatFileSize(end)} de ${formatFileSize(file.size)})...`
        );
      }

      // Check if chunk already exists on server
      try {
        const statusRes = await fetch(`/api/upload-status/${uploadId}`, { credentials: 'include' });
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (Array.isArray(statusJson.parts) && statusJson.parts.includes(chunkIndex)) {
            if (!isLastChunk) {
              continue;
            }
          }
        }
      } catch {}

      let attempts = 0;
      let success = false;
      let lastError: Error | null = null;

      while (attempts < 8 && !success) {
        attempts++;

        if (attempts > 1) {
          try {
            const statusRes = await fetch(`/api/upload-status/${uploadId}`, { credentials: 'include' });
            if (statusRes.ok) {
              const statusJson = await statusRes.json();
              if (Array.isArray(statusJson.parts) && statusJson.parts.includes(chunkIndex)) {
                success = true;
                break;
              }
            }
          } catch {}
        }

        const chunkBlob = file.slice(start, end);
        const formData = new FormData();
        formData.append('chunk', chunkBlob, file.name);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('uploadId', uploadId);
        formData.append('fileName', file.name);
        formData.append('featureType', selectedFeature);
        formData.append('parcialNumber', parcialNumber);

        try {
          const chunkRes = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload-chunk', true);
            xhr.withCredentials = true;
            xhr.timeout = isLastChunk ? 20 * 60 * 1000 : 5 * 60 * 1000;

            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable) {
                const chunkFraction = evt.loaded / evt.total;
                const fileBaseFraction = (chunkIndex + chunkFraction) / totalChunks;
                const overallPercent = Math.min(
                  95,
                  Math.round(((fileIndex + fileBaseFraction) / totalFiles) * 95)
                );
                setUploadProgress(Math.max(5, overallPercent));
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const resJson = JSON.parse(xhr.responseText);
                  resolve(resJson);
                } catch (e) {
                  resolve({ status: 'ok' });
                }
              } else {
                try {
                  const resJson = JSON.parse(xhr.responseText);
                  reject(new Error(resJson.error || `Erro HTTP ${xhr.status} no servidor.`));
                } catch {
                  reject(new Error(`Erro no servidor (${xhr.status}).`));
                }
              }
            };

            xhr.onerror = () => {
              reject(
                new Error(
                  `Falha de conexão ao enviar o bloco ${chunkIndex + 1} de ${totalChunks}.`
                )
              );
            };

            xhr.ontimeout = () => {
              reject(
                new Error(
                  `Tempo limite excedido ao enviar o bloco ${chunkIndex + 1} de ${totalChunks}.`
                )
              );
            };

            xhr.send(formData);
          });

          success = true;
          if (isLastChunk) {
            finalData = chunkRes;
          }
        } catch (chunkErr: any) {
          lastError = chunkErr;
          if (attempts < 8) {
            setUploadStatusText(
              `Reconectando bloco ${chunkIndex + 1}/${totalChunks} (tentativa ${attempts + 1}/8)...`
            );
            try {
              await fetch('/api/health', { credentials: 'include' });
            } catch {}
            await new Promise((r) => setTimeout(r, Math.min(6000, attempts * 1500)));
          }
        }
      }

      if (!success) {
        throw (
          lastError ||
          new Error(
            `Falha ao enviar o bloco ${chunkIndex + 1} de ${totalChunks} de "${file.name}".`
          )
        );
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    if (!finalData || !finalData.fileId) {
      throw new Error((finalData as any)?.error || `Erro ao processar estrutura de "${file.name}".`);
    }

    return finalData;
  };

  const validateAndUploadFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // Auto-detect parcial number from filename (e.g. "EntregaParcial5.xlsx" -> "5")
    const firstFileName = files[0].name;
    const parcialMatch = firstFileName.match(/parcial\s*(\d+)/i);
    const effectiveParcial = (parcialMatch && parcialMatch[1]) ? parcialMatch[1] : parcialNumber;
    if (parcialMatch && parcialMatch[1]) {
      onParcialChange(parcialMatch[1]);
    }

    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(5);

    // If uploading multiple files together in a single action, reset the session first so they form a fresh set
    if (files.length > 1) {
      try {
        await fetch('/api/reset-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureType: selectedFeature }),
        });
      } catch (err) {
        console.warn('Reset session before batch failed:', err);
      }
    }

    const keepAliveTimer = setInterval(() => {
      fetch('/api/health', { credentials: 'include' }).catch(() => {});
    }, 20000);

    try {
      let lastData: UploadResponse | null = null;
      for (let i = 0; i < files.length; i++) {
        lastData = await uploadSingleFile(files[i], i, files.length);
      }

      setUploadStatusText('Planilhas recebidas e consolidadas com sucesso!');
      setUploadProgress(100);
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (lastData && lastData.fileId) {
        lastData.featureType = selectedFeature;
        lastSuccessDataRef.current = lastData;
        const list = lastData.partsList || files.map((f) => f.name);
        setUploadedPartsMap((prev) => ({
          ...prev,
          [currentSessionKey]: list,
        }));
      }
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setErrorMessage(err.message || 'Erro durante o envio da planilha.');
    } finally {
      clearInterval(keepAliveTimer);
    }
  };

  const validateAndUpload = async (file: File) => {
    await validateAndUploadFiles([file]);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesList: File[] = Array.from(e.dataTransfer.files);
      const validFiles = filesList.filter((f) => {
        const n = f.name.toLowerCase();
        return n.endsWith('.xlsx') || n.endsWith('.xls');
      });
      if (validFiles.length > 0) {
        validateAndUploadFiles(validFiles);
      } else {
        setErrorMessage('Formato inválido! Por favor, selecione arquivos Excel com extensão .xlsx ou .xls.');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesList: File[] = Array.from(e.target.files);
      const validFiles = filesList.filter((f) => {
        const n = f.name.toLowerCase();
        return n.endsWith('.xlsx') || n.endsWith('.xls');
      });
      if (validFiles.length > 0) {
        validateAndUploadFiles(validFiles);
      }
    }
    e.target.value = '';
  };

  const currentFeatureConfig = DRAINAGE_FEATURES[selectedFeature];

  const featuresList: Array<{
    id: DrainageFeatureType;
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    cols: number;
  }> = [
    { id: 'drenagem_profunda', name: 'Drenagem Profunda', icon: Layers, cols: 25 },
    { id: 'drenagem_superficial', name: 'Drenagem Superficial', icon: Waves, cols: 23 },
    { id: 'sinalizacao_vertical', name: 'Sinalização Vertical', icon: Milestone, cols: 18 },
    { id: 'sinalizacao_horizontal_dispositivo', name: 'SH - Dispositivo', icon: CircleDot, cols: 14 },
    { id: 'sinalizacao_horizontal_marca_viaria', name: 'SH - Marca Viária', icon: Paintbrush, cols: 14 },
    { id: 'sinalizacao_horizontal_zebrado', name: 'SH - Zebrado', icon: Grid3X3, cols: 11 },
    { id: 'eps_defensa', name: 'EPS - Defensa', icon: Shield, cols: 13 },
    { id: 'terrapleno', name: 'Terrapleno', icon: Mountain, cols: 25 },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-2.5">
      {/* 1. Feature & Parcial Selector Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
              1
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
              Selecione a Feature de Processamento
            </h3>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
              v{APP_VERSION}
            </span>
          </div>

          {/* Parcial selector dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 shadow-2xs">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Parcial:</span>
            <select
              id="parcial-select-dropdown"
              value={parcialNumber}
              onChange={(e) => onParcialChange(e.target.value)}
              className="text-xs font-bold text-emerald-800 bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  Parcial {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compact Feature Chips Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
          {featuresList.map((feat) => {
            const Icon = feat.icon;
            const isSelected = selectedFeature === feat.id;
            return (
              <button
                key={feat.id}
                type="button"
                id={`card-feature-${feat.id.replace(/_/g, '-')}`}
                onClick={() => onFeatureChange(feat.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/90 shadow-2xs ring-1 ring-emerald-500/20 text-emerald-950 font-bold'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center mb-1 transition-colors ${
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold leading-tight line-clamp-1">
                  {feat.name}
                </span>
                <span
                  className={`text-[9px] mt-0.5 px-1.5 py-0.2 rounded-full font-medium ${
                    isSelected ? 'bg-emerald-200 text-emerald-900 font-bold' : 'text-slate-400'
                  }`}
                >
                  {feat.cols} colunas
                </span>
              </button>
            );
          })}
        </div>

        {/* Output file name format preview */}
        <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50/90 px-2.5 py-1 rounded-lg border border-slate-200/80">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-slate-700 shrink-0 text-xs">Padrão de Saída:</span>
            <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200 font-bold text-[11px] truncate">
              Parcial {parcialNumber || '1'}{getAreaIdentifier(selectedFeature) || '_'}BR-369.xlsx / .pdf
            </span>
          </div>
          <span className="text-[10px] text-slate-400 hidden sm:inline shrink-0">
            Formato: Parcial + Área + Rodovia
          </span>
        </div>
      </div>

      {/* 2. Upload Box */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-4 sm:p-6 text-center transition-all bg-white shadow-2xs flex flex-col items-center justify-center ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/50 scale-[1.005]'
            : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/60'
        } ${isUploading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isUploading}
        />

        <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center mb-1.5 shadow-2xs pointer-events-none">
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <UploadCloud className="w-5 h-5" />
          )}
        </div>

        <h3 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight pointer-events-none">
          {isUploading ? 'Enviando e consolidando planilhas...' : `Clique ou arraste a planilha (ou múltiplas partes em conjunto) de ${currentFeatureConfig.name}`}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5 max-w-md mx-auto pointer-events-none">
          Envio único ou em conjunto (Partes 1, 2, ...) em <strong className="text-slate-700 font-semibold">.xlsx</strong> e <strong className="text-slate-700 font-semibold">.xls</strong> de até <strong className="text-slate-700 font-semibold">500 MB</strong>
        </p>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="mt-3 w-full max-w-md mx-auto space-y-1.5 pointer-events-none">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="truncate">{selectedFileName || 'Processando arquivo...'}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium animate-pulse">
              {uploadStatusText || 'Identificando abas e colunas...'}
            </p>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 pointer-events-none">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 rounded-full font-medium text-slate-700">
            <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
            .xlsx e .xls
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 rounded-full font-medium text-slate-700">
            <Database className="w-3 h-3 text-emerald-600" />
            Até 500 MB
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 rounded-full font-medium text-slate-700">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Preservação de Mídias
          </span>
        </div>
      </div>

      {/* Uploaded Parts Management Card for Multi-Part Workbooks */}
      {currentParts.length > 0 && !isUploading && (
        <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-4 space-y-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-950">
                Partes carregadas para a Parcial {parcialNumber} ({currentParts.length} {currentParts.length === 1 ? 'parte' : 'partes'}):
              </span>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/reset-session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ featureType: selectedFeature }),
                });
                setUploadedPartsMap((prev) => {
                  const next = { ...prev };
                  delete next[currentSessionKey];
                  return next;
                });
              }}
              className="text-[10px] font-bold text-rose-700 hover:text-rose-900 px-2 py-0.5 rounded-full hover:bg-rose-100 transition-colors"
            >
              Limpar todas
            </button>
          </div>

          <div className="space-y-1 bg-white border border-emerald-200 rounded-lg p-2.5 max-h-[140px] overflow-y-auto scrollbar-thin">
            {currentParts.map((partName, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-slate-700 py-1 border-b border-slate-100 last:border-0">
                <span className="font-semibold truncate flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Parte {idx + 1}: {partName}
                </span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  Consolidada
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl border border-emerald-400 bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>+ Adicionar Outra Parte (Parte {currentParts.length + 1})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (lastSuccessDataRef.current) {
                  lastSuccessDataRef.current.featureType = selectedFeature;
                  onUploadSuccess(lastSuccessDataRef.current);
                }
              }}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Avançar para Seleção de Colunas →</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Não foi possível processar o arquivo</h4>
            <p className="text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};
