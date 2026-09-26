import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SendHorizontal, Smile, X, CornerUpLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import styles from './Composer.module.css';

// The emoji picker is large, so it's only downloaded the first time it opens
const EmojiPicker = lazy(() => import('emoji-picker-react'));

const MAX_LINES = 5;
const TYPING_REPEAT_MS = 2000; // re-send "typing" at most this often
const TYPING_IDLE_MS = 1500;   // "stopped typing" after this long without input

/**
 * Message input: auto-growing textarea, emoji picker and send button.
 * Enter sends, Shift+Enter adds a new line.
 */
export default function Composer({ onSend, onTyping, replyTo, onCancelReply, disabled, placeholder = 'Message', focusKey }) {
    const [text, setText] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const textareaRef = useRef(null);
    const pickerRef = useRef(null);
    const typingState = useRef({ lastSent: 0, idleTimer: null });
    const { isDark } = useTheme();

    // Focus the input when the conversation changes or a reply starts
    useEffect(() => {
        if (!disabled && window.matchMedia('(pointer: fine)').matches) {
            textareaRef.current?.focus();
        }
    }, [focusKey, replyTo, disabled]);

    // Reset draft when switching conversations
    useEffect(() => {
        setText('');
    }, [focusKey]);

    // Grow the textarea with its content, up to MAX_LINES
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = 'auto';
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 22;
        textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * MAX_LINES + 20)}px`;
    }, [text]);

    // Close the emoji picker on outside click
    useEffect(() => {
        if (!pickerOpen) return undefined;
        const onDown = event => {
            if (!pickerRef.current?.contains(event.target)) setPickerOpen(false);
        };
        const onKey = event => event.key === 'Escape' && setPickerOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [pickerOpen]);

    // Stop "typing…" when leaving the conversation
    useEffect(() => () => {
        clearTimeout(typingState.current.idleTimer);
    }, [focusKey]);

    function signalTyping() {
        if (!onTyping) return;
        const state = typingState.current;
        const now = Date.now();
        if (now - state.lastSent > TYPING_REPEAT_MS) {
            onTyping(true);
            state.lastSent = now;
        }
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => {
            onTyping(false);
            state.lastSent = 0;
        }, TYPING_IDLE_MS);
    }

    function send() {
        const message = text.trim();
        if (!message || disabled) return;
        onSend(message);
        setText('');
        clearTimeout(typingState.current.idleTimer);
        if (typingState.current.lastSent) onTyping?.(false);
        typingState.current.lastSent = 0;
        textareaRef.current?.focus();
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
        }
        if (event.key === 'Escape' && replyTo) onCancelReply?.();
    }

    function insertEmoji(emoji) {
        const textarea = textareaRef.current;
        const start = textarea?.selectionStart ?? text.length;
        const end = textarea?.selectionEnd ?? text.length;
        const next = text.slice(0, start) + emoji + text.slice(end);
        setText(next);
        requestAnimationFrame(() => {
            textarea?.focus();
            textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
        });
    }

    const replyName = replyTo?.sender?.displayName || replyTo?.sender?.username || 'message';

    return (
        <div className={styles.wrap}>
            {replyTo && (
                <div className={styles.reply}>
                    <CornerUpLeft size={16} aria-hidden="true" />
                    <div className={styles.replyText}>
                        <strong>Replying to {replyName}</strong>
                        <span>{replyTo.isDeleted ? 'This message was deleted' : replyTo.content}</span>
                    </div>
                    <button className="icon-btn" onClick={onCancelReply} aria-label="Cancel reply">
                        <X size={18} />
                    </button>
                </div>
            )}

            <div className={styles.bar}>
                <div className={styles.emoji} ref={pickerRef}>
                    <button
                        className="icon-btn"
                        onClick={() => setPickerOpen(open => !open)}
                        aria-label="Add emoji"
                        aria-expanded={pickerOpen}
                        disabled={disabled}
                    >
                        <Smile size={22} />
                    </button>
                    {pickerOpen && (
                        <div className={styles.picker}>
                            <Suspense fallback={<div className={styles.pickerLoading}>Loading emoji…</div>}>
                                <EmojiPicker
                                    onEmojiClick={data => insertEmoji(data.emoji)}
                                    theme={isDark ? 'dark' : 'light'}
                                    emojiStyle="native"
                                    lazyLoadEmojis
                                    skinTonesDisabled
                                    previewConfig={{ showPreview: false }}
                                    searchPlaceHolder="Search emoji"
                                    width={320}
                                    height={380}
                                />
                            </Suspense>
                        </div>
                    )}
                </div>

                <label className="visually-hidden" htmlFor="composer-input">{placeholder}</label>
                <textarea
                    id="composer-input"
                    ref={textareaRef}
                    className={styles.input}
                    rows={1}
                    value={text}
                    placeholder={placeholder}
                    maxLength={5000}
                    disabled={disabled}
                    onChange={event => {
                        setText(event.target.value);
                        signalTyping();
                    }}
                    onKeyDown={handleKeyDown}
                />

                <button
                    className={styles.send}
                    onClick={send}
                    disabled={disabled || !text.trim()}
                    aria-label="Send message"
                >
                    <SendHorizontal size={20} />
                </button>
            </div>
        </div>
    );
}
