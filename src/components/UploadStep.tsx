import React, { useState, useRef } from 'react';
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
  Check,
} from 'lucide-react';
import { UploadResponse, DrainageFeatureType } from '../types';
import { DRAINAGE_FEATURES } from '../constants/presets';

interface UploadStepProps {
  selectedFeature: DrainageFeatureType;
  onFeatureChange: (feature: DrainageFeatureType) => void;
  onUploadSuccess: (data: UploadResponse) => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({
  selectedFeature,
  onFeatureChange,
  onUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndUpload = async (file: File) => {
    setErrorMessage(null);

    // 1. Validate file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx')) {
      setErrorMessage('Formato inválido! Por favor, selecione um arquivo Excel com extensão .xlsx.');
      return;
    }

    // 2. Validate file size (100 MB maximum)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage(
        `O arquivo ultrapassa o limite de 100 MB (${formatFileSize(file.size)}). Envie uma planilha de até 100 MB.`
      );
      return;
    }

    setSelectedFileName(file.name);
    setIsUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('featureType', selectedFeature);

    // Use XMLHttpRequest for accurate upload progress tracking
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 90);
        setUploadProgress(Math.max(10, percent));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadProgress(100);
        try {
          const data: UploadResponse = JSON.parse(xhr.responseText);
          data.featureType = selectedFeature;
          setTimeout(() => {
            setIsUploading(false);
            onUploadSuccess(data);
          }, 350);
        } catch (e) {
          setIsUploading(false);
          setErrorMessage('Erro ao interpretar a resposta do servidor.');
        }
      } else {
        setIsUploading(false);
        try {
          const res = JSON.parse(xhr.responseText);
          setErrorMessage(res.error || 'Erro ao fazer upload da planilha.');
        } catch (e) {
          setErrorMessage('Erro no servidor durante o upload. Verifique o arquivo e tente novamente.');
        }
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setErrorMessage('Falha na conexão com o servidor. Tente novamente.');
    };

    xhr.send(formData);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndUpload(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndUpload(file);
    }
  };

  const currentFeatureConfig = DRAINAGE_FEATURES[selectedFeature];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* 1. Feature Selection Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-base font-bold text-slate-800">
                Selecione o Tipo de Drenagem (Feature)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Escolha a feature correspondente à sua planilha para configurar automaticamente os campos da Seleção Padrão.
            </p>
          </div>

          {/* Quick Dropdown select */}
          <div className="shrink-0">
            <select
              id="feature-select-dropdown"
              value={selectedFeature}
              onChange={(e) => onFeatureChange(e.target.value as DrainageFeatureType)}
              className="w-full sm:w-60 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value="drenagem_profunda">Drenagem Profunda</option>
              <option value="drenagem_superficial">Drenagem Superficial</option>
            </select>
          </div>
        </div>

        {/* Interactive Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Card: Drenagem Profunda */}
          <div
            id="card-feature-drenagem-profunda"
            onClick={() => onFeatureChange('drenagem_profunda')}
            className={`relative rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between text-left ${
              selectedFeature === 'drenagem_profunda'
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
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
                Mantém: <span className="font-semibold text-slate-800">codAuto, km, Rodovia, Sentido, repararEntorno, Limpeza., CaixaDanificada., TampaDanificada/Inxistente, EstadoConservacao, Foto1 a Foto15</span>.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">24 colunas mantidas</span>
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
                ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
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
        </div>
      </div>

      {/* 2. Upload Box */}
      <div
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
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isUploading}
        />

        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center mb-4 shadow-xs">
          {isUploading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-800 tracking-tight">
          {isUploading ? 'Enviando e analisando planilha...' : `Enviar planilha de ${currentFeatureConfig.name}`}
        </h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Arraste o arquivo .xlsx ou clique para selecionar do seu computador. Compatível com arquivos de até{' '}
          <strong className="text-slate-700 font-semibold">100 MB</strong>.
        </p>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="mt-6 max-w-md mx-auto space-y-2">
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
            <p className="text-[11px] text-slate-400">
              Identificando abas, cabeçalhos e montando prévia das primeiras 20 linhas...
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-medium text-slate-700">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Apenas arquivos .xlsx
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-medium text-slate-700">
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            Tamanho máximo: 100 MB
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
    </div>
  );
};
