import {numeric, sqliteTable, text} from 'drizzle-orm/sqlite-core';


export const FileEntity = sqliteTable('files', {
	id: text('id').notNull().unique().primaryKey(),
	isDeleted: text('is_deleted'),
	creationTs: numeric('creation_ts').notNull(),
	lastModifiedTs: numeric('last_modified_ts').notNull(),
	deletedTs: numeric('deleted_ts').notNull(),
});