import React from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { EPR_PARANA_LOGO_BASE64 } from '../assets/logoEpr';
import { Step } from '../types';
import { APP_VERSION } from '../constants/version';

interface HeaderProps {
  currentStep?: Step;
  onReset?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentStep, onReset }) => {
  return (
    <header className="border-b border-slate-200 bg-white shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* EPR Paraná Brand Logo */}
          <div className="w-12 h-12 rounded-xl bg-[#072b4a] p-1 flex items-center justify-center shrink-0 shadow-sm border border-slate-700/20 overflow-hidden">
            <img
              src={EPR_PARANA_LOGO_BASE64}
              alt="EPR Paraná"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                EPR Paraná <span className="text-slate-400 font-normal">|</span> Padronização de Drenagem
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                XLSX & PDF
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtragem por rodovia e estado de conservação, preservação de fotos e exportação em Excel e PDF Paisagem
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {currentStep && currentStep > 1 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
              title="Voltar para a Etapa 1 e enviar uma nova planilha"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Nova Planilha (Etapa 1)</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>EPR Paraná • Integridade de Fotos & Mídias</span>
          </div>
        </div>
      </div>
    </header>
  );
};

