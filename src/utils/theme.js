const THEME_KEY = 'zenda-erp-theme';

/**
 * Obtiene el tema actual del sistema
 */
export function getTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Establece el tema y lo guarda en localStorage
 */
export function setTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.error('Error guardando tema en localStorage:', error);
  }
}

/**
 * Inicializa el tema desde localStorage o preferencias del sistema
 * Debe llamarse al inicio de la aplicación
 */
export function initTheme() {
  try {
    // 1. Intentar obtener tema guardado
    const savedTheme = localStorage.getItem(THEME_KEY);
    
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
      return savedTheme;
    }
    
    // 2. Si no hay tema guardado, usar preferencia del sistema
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const systemTheme = prefersDark ? 'dark' : 'light';
    setTheme(systemTheme);
    return systemTheme;
  } catch (error) {
    console.error('Error inicializando tema:', error);
    // Fallback a light theme
    setTheme('light');
    return 'light';
  }
}

/**
 * Alterna entre modo claro y oscuro
 * Retorna el nuevo tema ('dark' o 'light')
 */
export function toggleTheme() {
  const currentTheme = getTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  return newTheme;
}

/**
 * Escucha cambios en las preferencias del sistema
 * Solo aplica si el usuario no ha establecido una preferencia manual
 */
export function watchSystemTheme() {
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      // Solo aplicar si no hay preferencia manual guardada
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (!savedTheme) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    
    // Modern API
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Legacy API
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  } catch (error) {
    console.error('Error configurando listener de tema del sistema:', error);
  }
  
  return () => {}; // No-op cleanup
}
