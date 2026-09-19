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
    <header className="border-b border-slate-200 bg-white shadow-2xs shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* EPR Paraná Brand Logo */}
          <div className="w-8 h-8 rounded-lg bg-[#072b4a] p-0.5 flex items-center justify-center shrink-0 shadow-2xs border border-slate-700/20 overflow-hidden">
            <img
              src={EPR_PARANA_LOGO_BASE64}
              alt="EPR Paraná"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              EPR Paraná <span className="text-slate-300 font-normal">|</span> Limpador & Padronizador
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              XLSX & PDF
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300">
              v{APP_VERSION}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentStep && currentStep > 1 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
              title="Voltar para a Etapa 1 e enviar uma nova planilha"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Nova Planilha</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Integridade Preservada</span>
          </div>
        </div>
      </div>
    </header>
  );
};

