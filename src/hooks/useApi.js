import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';

/**
 * Hook para consumir la API REST con PostgreSQL
 * Reemplaza a useCollection de Firebase
 * 
 * @param {string} endpoint - Endpoint de la API (ej: '/products', '/customers')
 * @param {Object} options - Opciones de configuración
 * @param {Object} options.params - Parámetros de query (filtros, paginación)
 * @param {boolean} options.autoFetch - Si debe cargar datos automáticamente (default: true)
 * @param {Function} options.transform - Función para transformar los datos
 * @param {number} options.pollingInterval - Intervalo de polling en ms (0 = sin polling)
 * 
 * @returns {Object} { data, loading, error, refetch, mutate }
 */
export function useApi(endpoint, options = {}) {
  const {
    params = {},
    autoFetch = true,
    transform = null,
    pollingInterval = 0
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  
  const paramsRef = useRef(params);
  const mountedRef = useRef(true);

  // Actualizar ref cuando cambian los params
  useEffect(() => {
    paramsRef.current = params;
  }, [JSON.stringify(params)]);

  const fetchData = useCallback(async (fetchParams) => {
    if (!mountedRef.current) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(endpoint, fetchParams || paramsRef.current);
      
      if (!mountedRef.current) return;
      
      // Extraer datos (puede venir como { data: [...] } o directamente un array)
      let resultData = response.data !== undefined ? response.data : response;
      
      // Aplicar transformación si existe
      if (transform && typeof transform === 'function') {
        resultData = transform(resultData);
      }
      
      setData(resultData);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Error al cargar datos');
      console.error(`Error fetching ${endpoint}:`, err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [endpoint, transform]);

  // Cargar datos inicialmente
  useEffect(() => {
    mountedRef.current = true;
    
    if (autoFetch) {
      fetchData();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, fetchData, JSON.stringify(params)]);

  // Polling opcional
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const interval = setInterval(() => {
      fetchData();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval, fetchData]);

  // Función para recargar datos
  const refetch = useCallback((newParams) => {
    return fetchData(newParams);
  }, [fetchData]);

  // Función para actualizar datos localmente (optimistic update)
  const mutate = useCallback((newData) => {
    if (typeof newData === 'function') {
      setData(prev => newData(prev));
    } else {
      setData(newData);
    }
  }, []);

  return { data, loading, error, refetch, mutate };
}

/**
 * Hook para un solo recurso por ID
 * 
 * @param {string} endpoint - Endpoint base (ej: '/products')
 * @param {string|number} id - ID del recurso
 * @param {Object} options - Opciones adicionales
 */
export function useApiResource(endpoint, id, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);

  const fetchResource = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`${endpoint}/${id}`);
      setData(response.data || response);
    } catch (err) {
      setError(err.message || 'Error al cargar recurso');
      console.error(`Error fetching ${endpoint}/${id}:`, err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, id]);

  useEffect(() => {
    fetchResource();
  }, [fetchResource]);

  return { data, loading, error, refetch: fetchResource };
}

/**
 * Hook para operaciones CRUD
 * Proporciona funciones para crear, actualizar y eliminar
 * 
 * @param {string} endpoint - Endpoint de la API
 * @param {Object} options - Opciones adicionales
 * @param {Function} options.onSuccess - Callback al completar operación
 * @param {Function} options.onError - Callback en caso de error
 */
export function useApiMutation(endpoint, options = {}) {
  const { onSuccess, onError } = options;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (method, id, data) => {
    setLoading(true);
    setError(null);

    try {
      let result;
      
      switch (method) {
        case 'create':
          result = await api.post(endpoint, data);
          break;
        case 'update':
          result = await api.put(`${endpoint}/${id}`, data);
          break;
        case 'patch':
          result = await api.patch(`${endpoint}/${id}`, data);
          break;
        case 'delete':
          result = await api.delete(`${endpoint}/${id}`);
          break;
        default:
          throw new Error(`Método no soportado: ${method}`);
      }

      if (onSuccess) {
        onSuccess(result, method);
      }
      
      return result;
    } catch (err) {
      setError(err.message || 'Error en operación');
      if (onError) {
        onError(err, method);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [endpoint, onSuccess, onError]);

  const create = useCallback((data) => execute('create', null, data), [execute]);
  const update = useCallback((id, data) => execute('update', id, data), [execute]);
  const patch = useCallback((id, data) => execute('patch', id, data), [execute]);
  const remove = useCallback((id) => execute('delete', id, null), [execute]);

  return { create, update, patch, remove, loading, error };
}

/**
 * Hook combinado para listado con mutaciones
 * Combina useApi + useApiMutation para casos comunes
 * 
 * @param {string} endpoint - Endpoint de la API
 * @param {Object} options - Opciones de configuración
 */
export function useApiCrud(endpoint, options = {}) {
  const { params, transform, onSuccess, onError } = options;
  
  const query = useApi(endpoint, { params, transform });
  const mutation = useApiMutation(endpoint, {
    onSuccess: (result, method) => {
      // Recargar datos después de mutación
      query.refetch();
      if (onSuccess) onSuccess(result, method);
    },
    onError
  });

  return {
    // Query state
    data: query.data,
    loading: query.loading || mutation.loading,
    error: query.error || mutation.error,
    refetch: query.refetch,
    mutate: query.mutate,
    
    // Mutation methods
    create: mutation.create,
    update: mutation.update,
    patch: mutation.patch,
    remove: mutation.remove,
    
    // Mutation state
    mutating: mutation.loading,
    mutationError: mutation.error
  };
}

/**
 * Hook para autenticación
 * Expone el estado de auth y funciones de login/logout
 */
export function useAuth() {
  const [user, setUser] = useState(api.auth.getCurrentUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.auth.login(email, password);
      setUser(result.user);
      return result;
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.auth.register(userData);
      setUser(result.user);
      return result;
    } catch (err) {
      setError(err.message || 'Error al registrarse');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await api.auth.logout();
      setUser(null);
    } catch (err) {
      console.error('Error en logout:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.auth.updateProfile(data);
      setUser(result.user);
      return result;
    } catch (err) {
      setError(err.message || 'Error al actualizar perfil');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    isAuthenticated: !!user && api.auth.isAuthenticated(),
    loading,
    error,
    login,
    register,
    logout,
    updateProfile
  };
}

export default useApi;
