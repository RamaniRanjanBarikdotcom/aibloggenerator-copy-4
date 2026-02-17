import React from 'react';
import { Loader2 } from 'lucide-react';

function ProgressScreen({ progress, t }) {
  const steps = t.progressSteps;

  const currentStep = Math.max(0, Math.min(progress.step, steps.length - 1));
  const progressPercentage = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="flex items-center justify-center h-full bg-transparent">
      <div className="max-w-2xl w-full mx-auto p-8">
        <div className="bg-white rounded-xl shadow-lg p-12">
          <div className="text-center mb-8">
            <Loader2 className="w-16 h-16 mx-auto text-blue-500 animate-spin mb-4" />
            <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.progressTitle}</h2>
            <p className="text-slate-600">{t.progressSubtitle}</p>
          </div>

          <div className="mb-8">
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="text-sm text-slate-600 text-center mt-2">
              {Math.round(progressPercentage)}% complete
            </p>
          </div>

          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-center space-x-3 ${
                  index < currentStep
                    ? 'text-blue-600'
                    : index === currentStep
                    ? 'text-purple-600'
                    : 'text-slate-400'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    index < currentStep
                      ? 'bg-blue-100'
                      : index === currentStep
                      ? 'bg-purple-100'
                      : 'bg-slate-100'
                  }`}
                >
                  {index < currentStep ? (
                    <span className="text-blue-600 font-bold">✓</span>
                  ) : index === currentStep ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-slate-400">{index + 1}</span>
                  )}
                </div>
                <div>
                  <p className="font-medium">{step}</p>
                  {index === currentStep && (
                    <p className="text-sm text-slate-500">{steps[currentStep]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500">
              {t.progressFooter}
              {Math.max(0, 180 - currentStep * 30)}s
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressScreen;
