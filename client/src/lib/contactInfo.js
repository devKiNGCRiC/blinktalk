// Spots text that looks like a phone number or email, so we can ask
// "Send anyway?" before someone shares contact details with a stranger.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// A run of digits that may contain spaces, dashes, dots, brackets or a leading +
const NUMBER_RUN = /\+?\(?\d[\d\s().-]*\d/g;

export function looksLikeContactInfo(text) {
    if (EMAIL.test(text)) return true;
    const runs = text.match(NUMBER_RUN) || [];
    return runs.some(run => run.replace(/\D/g, '').length >= 8);
}
