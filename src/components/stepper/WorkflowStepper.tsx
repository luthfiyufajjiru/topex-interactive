import React from 'react';
import type { WorkflowStep } from '@/types';
import { Layers, Activity, Satellite, CheckCircle2 } from 'lucide-react';

interface WorkflowStepperProps {
  currentStep: WorkflowStep;
  onStepChange: (step: WorkflowStep) => void;
  recordCount: number;
  hasGravity: boolean;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  currentStep,
  onStepChange,
  recordCount,
  hasGravity,
}) => {
  const steps: { id: WorkflowStep; label: string; sub: string; icon: React.ReactNode; disabled: boolean }[] = [
    {
      id: 'extract',
      label: '1. Grid Extraction',
      sub: recordCount > 0 ? `${recordCount.toLocaleString()} soundings` : 'Select Bounding Box',
      icon: <Layers size={18} />,
      disabled: false,
    },
    {
      id: 'process',
      label: '2. Bouguer Reduction',
      sub: recordCount > 0 ? (hasGravity ? 'Ready to process' : 'Requires Gravity') : 'Extract data first',
      icon: <Activity size={18} />,
      disabled: recordCount === 0 || !hasGravity,
    },
    {
      id: 'studio',
      label: '3. Satellite Gravity Studio',
      sub: '3 Maps & Oasis Montaj',
      icon: <Satellite size={18} />,
      disabled: recordCount === 0 || !hasGravity,
    },
  ];

  return (
    <div className="stepper-container">
      <div className="stepper-track">
        {steps.map((step, idx) => {
          const isActive = currentStep === step.id;
          const isDone =
            (step.id === 'extract' && recordCount > 0 && currentStep !== 'extract') ||
            (step.id === 'process' && currentStep === 'studio');

          return (
            <button
              key={step.id}
              type="button"
              className={`stepper-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${
                step.disabled ? 'disabled' : ''
              }`}
              onClick={() => !step.disabled && onStepChange(step.id)}
              disabled={step.disabled}
            >
              <div className="stepper-icon-box">
                {isDone ? <CheckCircle2 size={18} className="text-emerald" /> : step.icon}
              </div>
              <div className="stepper-content">
                <div className="stepper-label">{step.label}</div>
                <div className="stepper-sub">{step.sub}</div>
              </div>
              {idx < steps.length - 1 && <div className="stepper-connector" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
