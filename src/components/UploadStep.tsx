import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Database,
  Layers,
  Waves,
  Milestone,
  CircleDot,
  Paintbrush,
  Grid3X3,
  Check,
  Shield,
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
  }, [selectedFeature]);

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

  const validateAndUpload = async (file: File) => {
    setErrorMessage(null);

    // 1. Validate file extension (.xlsx or .xls)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setErrorMessage('Formato inválido! Por favor, selecione um arquivo Excel com extensão .xlsx ou .xls.');
      return;
    }

    // 2. Validate file size (600 MB maximum for high-resolution photo spreadsheets)
    const MAX_SIZE = 600 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage(
        `O arquivo ultrapassa o limite de 600 MB (${formatFileSize(file.size)}). Envie uma planilha de até 500-600 MB.`
      );
      return;
    }

    // Slice into balanced 8MB chunks: fast transfer per chunk (~15-20s on typical broadband),
    // preventing proxy timeouts and TCP packet drop over transcontinental links
    const CHUNK_SIZE = 8 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    setSelectedFileName(file.name);
    setIsUploading(true);
    setUploadProgress(5);
    setUploadStatusText(
      totalChunks > 1
        ? `Preparando envio seguro em ${totalChunks} blocos de ${formatFileSize(CHUNK_SIZE)}...`
        : 'Enviando arquivo para o servidor...'
    );

    // Keepalive ping to ensure nginx auth session stays active throughout the upload
    const keepAliveTimer = setInterval(() => {
      fetch('/api/health', { credentials: 'include' }).catch(() => {});
    }, 20000);

    try {
      let finalData: UploadResponse | null = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const isLastChunk = chunkIndex === totalChunks - 1;

        if (totalChunks > 1) {
          setUploadStatusText(
            isLastChunk
              ? `Enviando e montando bloco final ${chunkIndex + 1} de ${totalChunks}...`
              : `Enviando bloco ${chunkIndex + 1} de ${totalChunks} (${formatFileSize(end)} de ${formatFileSize(file.size)})...`
          );
        }

        // Upload chunk with automatic retry, fresh blob slicing, and server verification
        let attempts = 0;
        let success = false;
        let lastError: Error | null = null;

        while (attempts < 6 && !success) {
          attempts++;

          // If retrying, check if server already received and saved this chunk to disk
          if (attempts > 1) {
            try {
              const statusRes = await fetch(`/api/upload-status/${uploadId}`, { credentials: 'include' });
              if (statusRes.ok) {
                const statusJson = await statusRes.json();
                if (Array.isArray(statusJson.parts) && statusJson.parts.includes(chunkIndex)) {
                  console.log(`[Upload] Bloco ${chunkIndex + 1}/${totalChunks} já confirmado no servidor.`);
                  success = true;
                  break;
                }
              }
            } catch {}
          }

          // Always extract a fresh slice from the original File on each attempt
          const chunkBlob = file.slice(start, end);
          const formData = new FormData();
          formData.append('chunk', chunkBlob, file.name);
          formData.append('chunkIndex', String(chunkIndex));
          formData.append('totalChunks', String(totalChunks));
          formData.append('uploadId', uploadId);
          formData.append('fileName', file.name);
          formData.append('featureType', selectedFeature);

          try {
            const chunkRes = await new Promise<any>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', '/api/upload-chunk', true);
              xhr.withCredentials = true;

              // Generous timeout for regular chunks (4 mins) and final assembly chunk (10 mins)
              xhr.timeout = isLastChunk ? 10 * 60 * 1000 : 4 * 60 * 1000;

              xhr.upload.onprogress = (evt) => {
                if (evt.lengthComputable) {
                  const chunkFraction = evt.loaded / evt.total;
                  const overallPercent = Math.min(
                    95,
                    Math.round(((chunkIndex + chunkFraction) / totalChunks) * 95)
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
                    `Falha de conexão com o servidor ao enviar o bloco ${chunkIndex + 1} de ${totalChunks}.`
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
            if (attempts < 6) {
              setUploadStatusText(
                `Reconectando bloco ${chunkIndex + 1}/${totalChunks} (tentativa ${attempts + 1}/6)...`
              );
              // Ping health to re-establish and warm up auth proxy connection
              try {
                await fetch('/api/health', { credentials: 'include' });
              } catch {}
              await new Promise((r) => setTimeout(r, Math.min(5000, attempts * 1200)));
            }
          }
        }

        if (!success) {
          throw (
            lastError ||
            new Error(
              `Falha ao enviar o bloco ${chunkIndex + 1} de ${totalChunks} após múltiplas tentativas de conexão.`
            )
          );
        }
      }

      setUploadStatusText('Planilha recebida com sucesso! Analisando abas e colunas...');
      setUploadProgress(98);

      if (finalData && finalData.fileId) {
        setUploadProgress(100);
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        finalData.featureType = selectedFeature;
        onUploadSuccess(finalData);
      } else {
        throw new Error((finalData as any)?.error || 'Erro ao processar estrutura da planilha.');
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
      const file = e.dataTransfer.files[0];
      validateAndUpload(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndUpload(file);
    }
    e.target.value = '';
  };

  const currentFeatureConfig = DRAINAGE_FEATURES[selectedFeature];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* 1. Feature Selection Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-base font-bold text-slate-800">
                Selecione a Feature de Processamento
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Escolha a feature correspondente à sua planilha para configurar automaticamente os campos da Seleção Padrão.
            </p>
          </div>

          {/* Quick Dropdown select & Parcial Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {/* Parcial selector dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
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

            <select
              id="feature-select-dropdown"
              value={selectedFeature}
              onChange={(e) => onFeatureChange(e.target.value as DrainageFeatureType)}
              className="w-full sm:w-64 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="drenagem_profunda">Drenagem Profunda</option>
              <option value="drenagem_superficial">Drenagem Superficial</option>
              <option value="sinalizacao_vertical">Sinalização Vertical</option>
              <option value="sinalizacao_horizontal_dispositivo">Sinalização Horizontal - Dispositivo</option>
              <option value="sinalizacao_horizontal_marca_viaria">Sinalização Horizontal - Marca Viária</option>
              <option value="sinalizacao_horizontal_zebrado">Sinalização Horizontal - Zebrado</option>
            </select>
          </div>
        </div>

        {/* Interactive Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Card: Drenagem Profunda */}
          <div
            id="card-feature-drenagem-profunda"
            onClick={() => onFeatureChange('drenagem_profunda')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'drenagem_profunda'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'drenagem_profunda'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Drenagem Profunda
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Subterrânea / Caixas e Tampas
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'drenagem_profunda'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'drenagem_profunda' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">codAuto, km, Rodovia, Sentido, TipoMontante, sigla, Limpeza., CaixaDanificada., TampaDanificada/Inxistente, EstadoConservacao, Foto1 a Foto15</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">25 colunas mantidas</span>
              {selectedFeature === 'drenagem_profunda' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: Drenagem Superficial */}
          <div
            id="card-feature-drenagem-superficial"
            onClick={() => onFeatureChange('drenagem_superficial')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'drenagem_superficial'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'drenagem_superficial'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Waves className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Drenagem Superficial
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Superfície / Sarjetas e Valetas
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'drenagem_superficial'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'drenagem_superficial' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">codAuto, Elemento, km, Rodovia, Sentido, ExtensaoReparar, ExtensaoLimpeza, EstadoConservacao, Foto1 a Foto15</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">23 colunas mantidas</span>
              {selectedFeature === 'drenagem_superficial' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: Sinalização Vertical */}
          <div
            id="card-feature-sinalizacao-vertical"
            onClick={() => onFeatureChange('sinalizacao_vertical')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'sinalizacao_vertical'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'sinalizacao_vertical'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Milestone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Sinalização Vertical
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Placas / Dimensões e Suporte
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'sinalizacao_vertical'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'sinalizacao_vertical' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">codAuto, rodovia, sentido, km, posicao, localizacao, lado, codigoTipo, materialSuporte, largura, altura, metro2, foto1 a foto7, Situação Retrorrefletancia, ObservacaoPlacaDanificada</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">21 colunas mantidas</span>
              {selectedFeature === 'sinalizacao_vertical' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: Sinalização Horizontal - Dispositivo */}
          <div
            id="card-feature-sinalizacao-horizontal-dispositivo"
            onClick={() => onFeatureChange('sinalizacao_horizontal_dispositivo')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'sinalizacao_horizontal_dispositivo'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'sinalizacao_horizontal_dispositivo'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <CircleDot className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      SH - Dispositivo
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Tachas, Tachões e Dispositivos
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'sinalizacao_horizontal_dispositivo'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'sinalizacao_horizontal_dispositivo' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">CodAuto, TipoHorizontal, Localização, Rodovia, Km, Sentido, Bordo, Cor, Resultado Geral, Foto 1 a Foto 5</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">14 colunas mantidas</span>
              {selectedFeature === 'sinalizacao_horizontal_dispositivo' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: Sinalização Horizontal - Marca Viária */}
          <div
            id="card-feature-sinalizacao-horizontal-marca-viaria"
            onClick={() => onFeatureChange('sinalizacao_horizontal_marca_viaria')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'sinalizacao_horizontal_marca_viaria'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'sinalizacao_horizontal_marca_viaria'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Paintbrush className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      SH - Marca Viária
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Linhas, Faixas e Pinturas
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'sinalizacao_horizontal_marca_viaria'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'sinalizacao_horizontal_marca_viaria' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">CodAuto, Localização, Rodovia, Km, Sentido, TipoHorizontal, Tipo, Cor, Foto 1 a Foto 5, Resultado</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">14 colunas mantidas</span>
              {selectedFeature === 'sinalizacao_horizontal_marca_viaria' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: Sinalização Horizontal - Zebrado */}
          <div
            id="card-feature-sinalizacao-horizontal-zebrado"
            onClick={() => onFeatureChange('sinalizacao_horizontal_zebrado')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'sinalizacao_horizontal_zebrado'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'sinalizacao_horizontal_zebrado'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      SH - Zebrado
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Marcas de Canalização e Zebrados
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'sinalizacao_horizontal_zebrado'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'sinalizacao_horizontal_zebrado' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">codAuto, tipoHorizontal, rodovia, km, sentido, cor, resultadoGeral, foto1 a foto5</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">11 colunas mantidas</span>
              {selectedFeature === 'sinalizacao_horizontal_zebrado' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Card: EPS - Defensa */}
          <div
            id="card-feature-eps-defensa"
            onClick={() => onFeatureChange('eps_defensa')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'eps_defensa'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-400/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedFeature === 'eps_defensa'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      EPS - Defensa
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      3 Abas: Barreira, Metálica e OAE
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    selectedFeature === 'eps_defensa'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedFeature === 'eps_defensa' && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Mantém: <span className="font-semibold text-slate-800">codAuto, km, kmFinal, sentido, tipoDefensa, rodovia, lado, observacao, aparenciaGeral, Foto1 a Foto4</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">13 colunas mantidas</span>
              {selectedFeature === 'eps_defensa' ? (
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Selecionada
                </span>
              ) : (
                <span className="text-slate-400">Clique para selecionar</span>
              )}
            </div>
          </div>
        </div>

        {/* Standard File Naming Format Information Banner */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50/80 px-3.5 py-2.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Nome dos arquivos de saída:</span>
            <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold text-[11px]">
              Parcial {parcialNumber || '1'}{getAreaIdentifier(selectedFeature) || '_'}BR-369.xlsx / .pdf
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Formato: <strong className="text-slate-700">Parcial + Área + Rodovia</strong>
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
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all bg-white ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/50 scale-[1.008]'
            : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70'
        } ${isUploading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isUploading}
        />

        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center mb-4 shadow-xs pointer-events-none">
          {isUploading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-800 tracking-tight pointer-events-none">
          {isUploading ? 'Enviando e analisando planilha...' : `Enviar planilha de ${currentFeatureConfig.name}`}
        </h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto pointer-events-none">
          Arraste o arquivo <strong className="text-slate-700 font-semibold">.xlsx</strong> ou <strong className="text-slate-700 font-semibold">.xls</strong> ou clique para selecionar do seu computador. Compatível com planilhas de até{' '}
          <strong className="text-slate-700 font-semibold">500 MB</strong> com fotos.
        </p>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="mt-6 max-w-md mx-auto space-y-2 pointer-events-none">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="truncate">{selectedFileName || 'Processando arquivo...'}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium animate-pulse">
              {uploadStatusText || 'Identificando abas, cabeçalhos e montando prévia das primeiras 20 linhas...'}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-medium text-slate-700">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Arquivos .xlsx e .xls
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-medium text-slate-700">
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            Tamanho suportado: até 500 MB
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-medium text-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Processamento temporário seguro
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Não foi possível processar o arquivo</h4>
            <p className="text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Informational Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Integridade dos Dados
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Formatos numéricos, textos com acentos e datas são preservados com precisão.
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Prévia Otimizada de 20 Linhas
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Visualização leve das 20 primeiras linhas sem travar o navegador, mesmo em tabelas gigantes.
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Cursor na Célula A1
          </div>
          <p className="text-xs text-slate-500 mt-1">
            O arquivo gerado é configurado para abrir diretamente posicionado na célula A1.
          </p>
        </div>
      </div>

      {/* Version Tag */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
        <span>EPR Paraná • Padronização & Filtragem de Planilhas</span>
        <span className="font-semibold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded text-[11px]">
          Versão {APP_VERSION}
        </span>
      </div>
    </div>
  );
};
