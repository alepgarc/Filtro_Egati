import React, { useState } from 'react';
import {
  Download,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Layers,
  Trash2,
  ListFilter,
  RotateCcw,
  Loader2,
  AlertCircle,
  HardDrive,
  Filter,
  Route,
} from 'lucide-react';
import { ProcessResponse } from '../types';

interface DownloadStepProps {
  result: ProcessResponse;
  onReset: () => void;
  onBackToSelect: () => void;
}

export const DownloadStep: React.FC<DownloadStepProps> = ({
  result,
  onReset,
  onBackToSelect,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(result.downloadUrl);
      if (!response.ok) {
        throw new Error(`Servidor retornou código HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('O arquivo retornado possui 0 bytes. Tente gerar novamente.');
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(
        err.message || 'Ocorreu um erro ao baixar a planilha. Por favor, tente novamente.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    setDownloadError(null);

    try {
      const pdfUrl = result.pdfDownloadUrl || `/api/download-pdf/${result.downloadId}`;
      const response = await fetch(pdfUrl);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || contentType.includes('text/html')) {
        const errorText = await response.text();
        let serverMsg = '';
        if (errorText) {
          try {
            const parsedJson = JSON.parse(errorText);
            serverMsg = parsedJson.error || parsedJson.message || '';
          } catch {
            if (!errorText.includes('<!doctype') && !errorText.includes('<html')) {
              serverMsg = errorText.trim();
            }
          }
        }
        if (serverMsg) {
          throw new Error(serverMsg);
        }
        if (contentType.includes('text/html') || errorText.includes('<!doctype') || errorText.includes('<html')) {
          throw new Error(`Erro HTTP ${response.status}: O servidor retornou uma resposta inválida ao gerar o PDF.`);
        }
        throw new Error(errorText || `Erro HTTP ${response.status} ao gerar o arquivo PDF.`);
      }

      const blob = await response.blob();
      if (!blob || blob.size < 100) {
        throw new Error('O PDF gerado é inválido ou muito pequeno (menos de 100 bytes). Tente novamente.');
      }

      const pdfFileName = result.fileName.replace(/\.xlsx$/i, '') + '.pdf';
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (err: any) {
      console.error('PDF Download error:', err);
      setDownloadError(
        err.message || 'Ocorreu um erro ao gerar o relatório em PDF. Por favor, tente novamente.'
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-2.5">
      {/* Compact Success & Action Box */}
      <div className="bg-white border border-emerald-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Planilha Filtrada com Sucesso!
              </h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {result.fileName}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  ({formatFileSize(result.fileSize)})
                </span>
              </div>
            </div>
          </div>

          {/* Primary Action Download Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              id="btn-download-xlsx"
              onClick={handleDownload}
              disabled={isDownloading || isDownloadingPdf}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-70 text-white font-bold text-xs sm:text-sm transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Baixando Excel...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar Excel (.xlsx)</span>
                </>
              )}
            </button>

            <button
              type="button"
              id="btn-download-pdf"
              onClick={handleDownloadPdf}
              disabled={isDownloading || isDownloadingPdf}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-70 text-white font-bold text-xs sm:text-sm transition-all shadow-2xs flex items-center gap-2 cursor-pointer border border-slate-700"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Baixar PDF (Paisagem)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Compact Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-center">
            <div className="text-[11px] font-medium text-slate-500">Colunas originais</div>
            <div className="text-lg font-extrabold text-slate-800">{result.originalColumnsCount}</div>
          </div>

          <div className="bg-rose-50/60 border border-rose-200/80 rounded-lg p-2.5 text-center">
            <div className="text-[11px] font-semibold text-rose-700 flex items-center justify-center gap-1">
              <Trash2 className="w-3 h-3" />
              Removidas
            </div>
            <div className="text-lg font-extrabold text-rose-700">{result.removedColumnsCount}</div>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-lg p-2.5 text-center">
            <div className="text-[11px] font-semibold text-emerald-800 flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Mantidas
            </div>
            <div className="text-lg font-extrabold text-emerald-700">{result.keptColumnsCount}</div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-center">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-center gap-1">
              <Layers className="w-3 h-3" />
              Linhas finais
            </div>
            <div className="text-lg font-extrabold text-slate-800">{result.rowsCount.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        {/* Applied Filters Banner (if any) */}
        {(result.appliedRodoviaFilter || result.appliedEstadoFilter) && (
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-lg p-2 flex items-center justify-between gap-2 text-xs text-indigo-950">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold flex items-center gap-1 text-indigo-900">
                <Filter className="w-3 h-3 text-indigo-700" />
                Filtros aplicados:
              </span>
              {result.appliedRodoviaFilter && (
                <span className="bg-sky-100 text-sky-950 border border-sky-300 font-bold px-1.5 py-0.2 rounded text-[11px] flex items-center gap-1">
                  <Route className="w-3 h-3 text-sky-700" />
                  Rodovia: {result.appliedRodoviaFilter}
                </span>
              )}
              {result.appliedEstadoFilter && (
                <span className="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-1.5 py-0.2 rounded text-[11px] flex items-center gap-1">
                  <Filter className="w-3 h-3 text-amber-700" />
                  {result.appliedEstadoFilter}
                </span>
              )}
            </div>
            {result.keptRowsCount !== undefined && result.originalRowsCount !== undefined && (
              <span className="text-[11px] text-indigo-900 font-medium shrink-0">
                {result.keptRowsCount} mantidas de {result.originalRowsCount} originais
              </span>
            )}
          </div>
        )}

        {/* Source and Integrity details */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span className="truncate">
            Origem: <strong className="text-slate-700">{result.originalFileName}</strong> (inalterada)
          </span>
          <span className="shrink-0 flex items-center gap-1 text-emerald-700 font-medium">
            <HardDrive className="w-3 h-3" />
            Processamento concluído
          </span>
        </div>
      </div>

      {/* Navigation and Next Steps */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          id="btn-back-to-select"
          onClick={onBackToSelect}
          className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer bg-white shadow-2xs"
        >
          <ListFilter className="w-3.5 h-3.5 text-slate-500" />
          <span>Ajustar colunas da mesma planilha</span>
        </button>

        <button
          type="button"
          id="btn-upload-another"
          onClick={onReset}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Enviar outra planilha</span>
        </button>
      </div>
    </div>
  );
};
