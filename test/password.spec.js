import { describe, it, expect } from 'vitest';
import { calcPasswordStrength, isPasswordStrong, checkPasswordCriteria } from '../src/utils/password';

describe('password utils', () => {
    it('calcPasswordStrength returns 0 for empty', () => {
        expect(calcPasswordStrength('')).toBe(0);
    });

    it('detects criteria and strength', () => {
        const pw = 'Abc123!@'; // length>=8, upper, lower, number, symbol
        expect(checkPasswordCriteria(pw).minLength).toBe(true);
        expect(checkPasswordCriteria(pw).hasUpper).toBe(true);
        expect(checkPasswordCriteria(pw).hasLower).toBe(true);
        expect(checkPasswordCriteria(pw).hasNumber).toBe(true);
        expect(checkPasswordCriteria(pw).hasSymbol).toBe(true);
        expect(calcPasswordStrength(pw)).toBe(5);
        expect(isPasswordStrong(pw, 3)).toBe(true);
    });
});
