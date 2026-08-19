import React, { useState } from 'react';
import { Edit, CheckCircle, ChevronRight, X, ArrowLeft } from 'lucide-react';
import './RegistrationFlow.css';
import StepAdminForm from './StepAdminForm.jsx';
import StepCompanyForm from './StepCompanyForm.jsx';
import StepReview from './StepReview.jsx';

const STEPS = [
  { number: 1, title: 'Administrador', desc: 'Cuenta de acceso' },
  { number: 2, title: 'Empresa',       desc: 'Datos comerciales' },
  { number: 3, title: 'Confirmación',  desc: 'Revisa y confirma' },
];

export default function RegistrationFlow({ onCancel, onFinalize, isProcessing = false, progressStep = 0, progressMessage = '' }) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState('forward');
  const [adminData, setAdminData] = useState({});
  const [companyData, setCompanyData] = useState({});

  const goTo = (nextStep) => {
    setDirection(nextStep > step ? 'forward' : 'back');
    setStep(nextStep);
  };

  const handleAdminNext = (data) => { setAdminData(data); goTo(2); };
  const handleCompanyNext = (data) => { setCompanyData(data); goTo(3); };
  const handleConfirm = () => onFinalize(adminData, companyData);

  const handleClear = () => {
    if (window.confirm('¿Cancelar el registro? Se borrarán todos los datos ingresados.')) {
      onCancel();
    }
  };

  const animClass = direction === 'forward' ? 'reg-animate-in' : 'reg-animate-back';

  const triggerStep = () => {
    if (step === 1) document.getElementById('step-admin-submit')?.click();
    else if (step === 2) document.getElementById('step-company-submit')?.click();
    else handleConfirm();
  };

  const stepCircleClass = (s) => {
    if (step > s) return 'bg-emerald-400 text-white shadow';
    if (step === s) return 'bg-white text-indigo-700 shadow-lg scale-110';
    return 'bg-indigo-600/60 border border-indigo-400 text-indigo-300';
  };

  return (
    <div className="fixed inset-0 flex bg-gray-50 z-50">
      {/* ─── Left panel ─── */}
      <aside className="hidden lg:flex flex-col justify-between w-80 xl:w-96 flex-shrink-0 bg-gradient-to-b from-indigo-700 to-indigo-900 text-white p-10">
        <div>
          {/* Logo */}
            <div className="flex items-center gap-3 text-2xl font-bold mb-12">
            <Edit size={28} />
            <span>Zenda ERP</span>
          </div>
          <p className="text-indigo-200 text-sm mb-10 leading-relaxed">
            Completa los tres pasos para crear tu cuenta y comenzar a usar el sistema.
          </p>

          {/* Step tracker */}
          <nav className="flex flex-col gap-0">
            {STEPS.map((s, idx) => {
              const isPending = step < s.number;
              return (
                <React.Fragment key={s.number}>
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300 ${stepCircleClass(s.number)}`}>
                      {step > s.number ? <CheckCircle size={16} /> : s.number}
                    </div>
                    <div className="pt-0.5">
                      <h4 className={`font-semibold text-sm transition-opacity ${isPending ? 'opacity-50' : ''}`}>{s.title}</h4>
                      <p className="text-xs text-indigo-300 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="w-px h-5 bg-indigo-600/50 ml-4 my-1" />
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <button type="button" onClick={handleClear}
          className="flex items-center gap-2 text-sm text-indigo-300 hover:text-white transition-colors mt-8">
          <X size={14} /> Cancelar registro
        </button>
      </aside>

      {/* ─── Right panel ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 lg:hidden text-indigo-700 font-bold">
            <Edit size={20} /><span>Zenda ERP</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            {STEPS.map((s, idx) => (
              <React.Fragment key={s.number}>
                <span className={`font-medium ${step === s.number ? 'text-indigo-600' : step > s.number ? 'text-emerald-600' : ''}`}>
                  {s.title}
                </span>
                {idx < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-300" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-10">
          {step === 1 && (
            <StepAdminForm key="step1" initialData={adminData} companyName={companyData.name || ''}
              onNext={handleAdminNext} animClass={animClass} />
          )}
          {step === 2 && (
            <StepCompanyForm key="step2" initialData={companyData}
              onNext={handleCompanyNext} onBack={() => goTo(1)} animClass={animClass} />
          )}
          {step === 3 && (
            <StepReview key="step3" adminData={adminData} companyData={companyData}
              onBack={() => goTo(1)} onBackToCompany={() => goTo(2)}
              onConfirm={handleConfirm} onClear={handleClear}
              isProcessing={isProcessing} progressStep={progressStep} progressMessage={progressMessage}
              animClass={animClass} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-4 px-6 py-4 md:px-12 border-t border-gray-200 bg-white">
          {step > 1 ? (
            <button type="button" onClick={() => goTo(step - 1)} disabled={isProcessing}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 transition-colors">
              <ArrowLeft size={16} /> Atrás
            </button>
          ) : (
            <button type="button" onClick={handleClear}
              className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors lg:hidden">
              <X size={14} /> Cancelar
            </button>
          )}

          {step < 3 ? (
            <button type="button" onClick={triggerStep}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleConfirm} disabled={isProcessing}
              className={`flex items-center gap-2 px-8 py-2.5 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm ${isProcessing ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isProcessing ? 'Creando cuenta...' : 'Confirmar y crear cuenta'}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
