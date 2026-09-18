/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Header } from './components/Header';
import { StepIndicator } from './components/StepIndicator';
import { UploadStep } from './components/UploadStep';
import { ColumnSelectionStep } from './components/ColumnSelectionStep';
import { DownloadStep } from './components/DownloadStep';
import { Step, UploadResponse, ProcessResponse, DrainageFeatureType } from './types';

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedFeature, setSelectedFeature] = useState<DrainageFeatureType>('drenagem_profunda');
  const [parcialNumber, setParcialNumber] = useState<string>('1');
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [processedResult, setProcessedResult] = useState<ProcessResponse | null>(null);

  const handleUploadSuccess = (data: UploadResponse) => {
    if (data.featureType) {
      setSelectedFeature(data.featureType);
    }
    setUploadData(data);
    setCurrentStep(2);
  };

  const handleProcessComplete = (result: ProcessResponse) => {
    setProcessedResult(result);
    setCurrentStep(3);
  };

  const handleBackToUpload = () => {
    if (uploadData?.fileId) {
      // fire and forget cleanup
      fetch(`/api/cleanup/${uploadData.fileId}`, { method: 'DELETE' }).catch(() => {});
    }
    setUploadData(null);
    setProcessedResult(null);
    setCurrentStep(1);
  };

  const handleBackToSelect = () => {
    setCurrentStep(2);
  };

  const handleReset = () => {
    if (uploadData?.fileId) {
      fetch(`/api/cleanup/${uploadData.fileId}`, { method: 'DELETE' }).catch(() => {});
    }
    setUploadData(null);
    setProcessedResult(null);
    setCurrentStep(1);
  };

  const canNavigateToStep = (step: Step) => {
    if (step === 1) return true;
    if (step === 2) return uploadData !== null;
    if (step === 3) return processedResult !== null;
    return false;
  };

  const handleStepClick = (step: Step) => {
    if (step === 1) {
      handleReset();
      return;
    }
    if (canNavigateToStep(step)) {
      setCurrentStep(step);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-800 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* Top Navigation / Brand Header */}
      <Header currentStep={currentStep} onReset={handleReset} />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Wizard Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          onStepClick={handleStepClick}
          canNavigateToStep={canNavigateToStep}
        />

        {/* Dynamic Content by Step */}
        <div className="relative min-h-[460px]">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <UploadStep
                  selectedFeature={selectedFeature}
                  onFeatureChange={setSelectedFeature}
                  parcialNumber={parcialNumber}
                  onParcialChange={setParcialNumber}
                  onUploadSuccess={handleUploadSuccess}
                />
              </motion.div>
            )}

            {currentStep === 2 && uploadData && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <ColumnSelectionStep
                  uploadData={uploadData}
                  initialFeatureType={selectedFeature}
                  onFeatureChange={setSelectedFeature}
                  parcialNumber={parcialNumber}
                  onParcialChange={setParcialNumber}
                  onBackToUpload={handleBackToUpload}
                  onProcessComplete={handleProcessComplete}
                />
              </motion.div>
            )}

            {currentStep === 3 && processedResult && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <DownloadStep
                  result={processedResult}
                  onReset={handleReset}
                  onBackToSelect={handleBackToSelect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Limpador de Planilhas Excel XLSX • Suporte a arquivos de até 100 MB
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Preservação de formatos e fórmulas</span>
            <span>•</span>
            <span>Processamento local temporário</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
