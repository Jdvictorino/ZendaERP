import React from 'react';

/** Bloque del formulario: tarjeta con título y, si hace falta, una línea de ayuda. */
export function Section({ title, description, action, children }) {
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Etiqueta + control + error. El control recibe id, aria-invalid y aria-describedby desde aquí. */
export function Field({ id, label, required, optional, error, hint, className = '', children }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = React.cloneElement(children, {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  });
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-soft mb-1">
        {label}
        {required && <span className="text-danger-600" aria-hidden="true"> *</span>}
        {optional && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </label>
      {control}
      {error ? <p id={`${id}-error`} className="field-error">{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Encabezado de cada paso: el número de paso va en la descripción, no como etiqueta encima del título. */
export function StepHeader({ step, title, children }) {
  return (
    <div className="mb-2">
      <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted max-w-prose">Paso {step} de 3. {children}</p>
    </div>
  );
}

/** Lleva el foco al primer campo con error, en el orden del formulario. */
export function focusFirstError(form, errors) {
  const first = Array.from(form.querySelectorAll('[id]')).find(el => errors[el.dataset.field || el.name]);
  first?.focus();
}
