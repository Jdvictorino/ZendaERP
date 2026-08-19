// Utilidades para validación de contraseñas
export const passwordCriteria = {
    minLength: 8,
    hasUpper: /[A-Z]/,
    hasLower: /[a-z]/,
    hasNumber: /[0-9]/,
    hasSymbol: /[^A-Za-z0-9]/
};

export function calcPasswordStrength(pw = '') {
    let score = 0;
    if (!pw) return 0;
    if (pw.length >= passwordCriteria.minLength) score += 1;
    if (passwordCriteria.hasUpper.test(pw)) score += 1;
    if (passwordCriteria.hasLower.test(pw)) score += 1;
    if (passwordCriteria.hasNumber.test(pw)) score += 1;
    if (passwordCriteria.hasSymbol.test(pw)) score += 1;
    return score; // 0..5
}

export function isPasswordStrong(pw, minScore = 3) {
    return calcPasswordStrength(pw) >= minScore;
}

export function checkPasswordCriteria(pw) {
    return {
        minLength: pw.length >= passwordCriteria.minLength,
        hasUpper: passwordCriteria.hasUpper.test(pw),
        hasLower: passwordCriteria.hasLower.test(pw),
        hasNumber: passwordCriteria.hasNumber.test(pw),
        hasSymbol: passwordCriteria.hasSymbol.test(pw),
    };
}
