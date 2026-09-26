// Same rules the server checks in backend/middleware/validation.js
export const PASSWORD_RULES = [
    { id: 'length', label: 'At least 6 characters', test: value => value.length >= 6 },
    { id: 'lower', label: 'A lowercase letter', test: value => /[a-z]/.test(value) },
    { id: 'upper', label: 'An uppercase letter', test: value => /[A-Z]/.test(value) },
    { id: 'digit', label: 'A number', test: value => /\d/.test(value) }
];

/** [{ id, label, met }] for showing a live checklist */
export function checkPassword(value) {
    return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
}

export function isStrongPassword(value) {
    return PASSWORD_RULES.every(rule => rule.test(value));
}

// Same rules as the server for usernames
export function usernameError(value) {
    if (value.length < 3 || value.length > 30) return 'Use 3 to 30 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Use only letters, numbers and underscores';
    return null;
}
