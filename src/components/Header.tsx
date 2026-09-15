import React from 'react';
import { FileSpreadsheet, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-200 bg-white shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Limpador de Planilhas Excel
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                XLSX até 100 MB
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtre e remova colunas mantendo cabeçalhos, datas, números e todas as linhas intactas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 px-3 py-1.5 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Privacidade total: arquivos temporários excluídos após uso</span>
        </div>
      </div>
    </header>
  );
};
