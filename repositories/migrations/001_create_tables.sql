
DROP TABLE IF EXISTS files;


CREATE TABLE IF NOT EXISTS files(
    `id` TEXT NOT NULL UNIQUE PRIMARY KEY,
    `is_deleted` TEXT NOT NULL,
    `creation_ts` INTEGER NOT NULL,
    `last_modified_ts` INTEGER NOT NULL,
	 `deleted_ts` INTEGER
);