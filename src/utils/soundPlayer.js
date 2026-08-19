// Importamos los archivos de sonido desde la nueva ruta.
import successSound from '../assets/notifications/Successful process.mp3';
import errorSound from '../assets/notifications/Unsuccessful process.mp3';

const successAudio = new Audio(successSound);
const errorAudio = new Audio(errorSound);
const warningAudio = new Audio(errorSound); // Usar mismo sonido de error para advertencia

let preferences = {
  enabled: true,
  volume: 0.7,
};

const applyVolume = () => {
  const v = Math.max(0, Math.min(1, Number(preferences.volume ?? 0.7)));
  successAudio.volume = v;
  errorAudio.volume = v;
  warningAudio.volume = v;
};

applyVolume();

export const setNotificationSoundSettings = (settings = {}) => {
  preferences = {
    ...preferences,
    ...settings,
    volume: settings?.volume ?? preferences.volume,
  };
  applyVolume();
};

/**
 * Reproduce un sonido de notificación de éxito.
 */
export const playSuccessSound = () => {
  if (!preferences.enabled) return;
  successAudio.currentTime = 0;
  successAudio.play().catch(error => {
    if (error.name !== 'NotAllowedError') {
      console.error("Error al reproducir el sonido de éxito:", error);
    }
  });
};

/**
 * Reproduce un sonido de notificación de error.
 */
export const playErrorSound = () => {
  if (!preferences.enabled) return;
  errorAudio.currentTime = 0;
  errorAudio.play().catch(error => {
    if (error.name !== 'NotAllowedError') {
      console.error("Error al reproducir el sonido de error:", error);
    }
  });
};

/**
 * Reproduce un sonido de notificación de advertencia.
 */
export const playWarningSound = () => {
  if (!preferences.enabled) return;
  warningAudio.currentTime = 0;
  warningAudio.play().catch(error => {
    if (error.name !== 'NotAllowedError') {
      console.error("Error al reproducir el sonido de advertencia:", error);
    }
  });
};