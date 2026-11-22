CREATE TABLE IF NOT EXISTS author_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    author_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notify TINYINT(1) NOT NULL DEFAULT 0,
    last_book_id INT NOT NULL DEFAULT 0,
    notify_since TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_follow (user_id, author_id)
);

ALTER TABLE author_follows
    ADD COLUMN notify TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE author_follows
    ADD COLUMN last_book_id INT NOT NULL DEFAULT 0;

ALTER TABLE author_follows
    ADD COLUMN notify_since TIMESTAMP NULL DEFAULT NULL;
