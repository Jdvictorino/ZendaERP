const PROMPT = /password for|contraseña|password:|passphrase/i;

// Reconstruye líneas tecleadas (con retroceso, sin secuencias de escape). Nunca guarda la salida:
// solo la mira para detectar avisos de contraseña.
// shortcut: input typed ahead (password pasted before the prompt arrives) is not redacted; fine for a single owner.
export function createCommandRecorder() {
  let line = '';
  let lastOutput = '';
  let secret = false;
  let esc = 0; // 0 = normal, 1 = tras ESC, 2 = dentro de CSI
  return {
    output(text) {
      lastOutput = (lastOutput + String(text)).slice(-200);
      if (PROMPT.test(lastOutput)) secret = true;
    },
    input(data) {
      const lines = [];
      for (const ch of String(data)) {
        if (esc === 1) { esc = ch === '[' || ch === 'O' ? 2 : 0; continue; }
        if (esc === 2) { if (ch >= '@' && ch <= '~') esc = 0; continue; }
        if (ch === '\x1b') { esc = 1; continue; }
        if (ch === '\r' || ch === '\n') {
          if (secret) lines.push('[contraseña omitida]');
          else if (line.trim()) lines.push(line);
          line = ''; secret = false; lastOutput = '';
        } else if (ch === '\x7f' || ch === '\b') line = line.slice(0, -1);
        else if (ch >= ' ') line += ch;
      }
      return lines;
    },
  };
}
