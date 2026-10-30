// "Save chat": turns a stranger chat into a plain text file.

const pad = number => String(number).padStart(2, '0');
const clock = date => {
    const d = new Date(date);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * @param {Array} lines - stranger chat lines ({ kind: 'me'|'them'|'system', text, at })
 * @param {Object} options - { startedAt }
 * @returns {String}
 */
export function buildTranscript(lines, { startedAt = new Date() } = {}) {
    const body = lines.map(line => {
        if (line.kind === 'system') return `— ${line.text} —`;
        const who = line.kind === 'me' ? 'You' : 'Stranger';
        return `[${clock(line.at)}] ${who}: ${line.text}`;
    });
    return [`BlinkTalk chat · ${new Date(startedAt).toLocaleString()}`, '', ...body, ''].join('\n');
}

/** Downloads text as a file */
export function downloadText(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
