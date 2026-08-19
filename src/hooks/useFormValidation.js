import { useState, useCallback } from 'react';
import { validateForm } from '../utils/validationSchemas';

export function useFormValidation(schema, initialData = {}) {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validate = useCallback((data) => {
    return validateForm(schema, data);
  }, [schema]);

  const handleChange = useCallback((field) => (e) => {
    const value = e.target?.type === 'checkbox' ? e.target?.checked : e.target?.value ?? e;
    
    setTouched(prev => ({ ...prev, [field]: true }));
    
    const testData = { ...initialData, [field]: value };
    const result = validate(testData);
    
    if (result.errors[field]) {
      setErrors(prev => ({ ...prev, [field]: result.errors[field] }));
    } else {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    return value;
  }, [validate, initialData]);

  const handleBlur = useCallback((field) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const validateAll = useCallback((data) => {
    const result = validate(data);
    if (!result.isValid) {
      const touchedFields = {};
      Object.keys(result.errors).forEach(key => {
        touchedFields[key] = true;
      });
      setTouched(prev => ({ ...prev, ...touchedFields }));
      setErrors(result.errors);
    }
    return result;
  }, [validate]);

  const clearErrors = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  const getFieldProps = useCallback((field) => ({
    name: field,
    error: touched[field] && errors[field] ? errors[field] : undefined,
    onChange: handleChange(field),
    onBlur: handleBlur(field),
  }), [touched, errors, handleChange, handleBlur]);

  return {
    errors,
    touched,
    validate,
    validateAll,
    clearErrors,
    getFieldProps,
    setErrors,
  };
}
