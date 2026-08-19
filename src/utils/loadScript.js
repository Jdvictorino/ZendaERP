const loadedScripts = {};

export const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        if (loadedScripts[src]) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedScripts[src] = true;
            resolve();
        };
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
    });
};  