import React from 'react';
import { FileAudio, CheckCircle, Loader, AlertTriangle } from 'lucide-react';

interface ConversionStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  details?: string;
}

interface ConversionProgressProps {
  isVisible: boolean;
  steps: ConversionStep[];
  onClose: () => void;
}

const ConversionProgress: React.FC<ConversionProgressProps> = ({
  isVisible,
  steps,
  onClose
}) => {
  if (!isVisible) return null;

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader size={16} className="text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'error':
        return <AlertTriangle size={16} className="text-red-600" />;
      default:
        return <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />;
    }
  };

  const overallProgress = steps.length > 0 
    ? Math.round(steps.reduce((sum, step) => sum + step.progress, 0) / steps.length)
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center">
            <FileAudio size={20} className="mr-2 text-blue-600" />
            Converting Audio Files
          </h3>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Overall Progress</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="space-y-3 max-h-48 overflow-y-auto">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start space-x-3">
              <div className="mt-0.5">
                {getStepIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {step.name}
                </div>
                {step.details && (
                  <div className="text-xs text-gray-500 mt-1">
                    {step.details}
                  </div>
                )}
                {step.status === 'processing' && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            disabled={steps.some(step => step.status === 'processing')}
          >
            {steps.some(step => step.status === 'processing') ? 'Processing...' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversionProgress;