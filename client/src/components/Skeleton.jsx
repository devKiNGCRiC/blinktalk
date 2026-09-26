import styles from './Skeleton.module.css';

/** Placeholder rows shown while a list loads */
export default function SkeletonRows({ count = 6 }) {
    return (
        <div className={styles.list} aria-busy="true" aria-label="Loading">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className={styles.row} style={{ '--delay': `${index * 80}ms` }}>
                    <span className={styles.circle} />
                    <span className={styles.lines}>
                        <span className={styles.line} style={{ width: `${55 + ((index * 17) % 30)}%` }} />
                        <span className={styles.line} style={{ width: `${35 + ((index * 23) % 40)}%` }} />
                    </span>
                </div>
            ))}
        </div>
    );
}
