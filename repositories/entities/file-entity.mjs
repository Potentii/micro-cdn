import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';


export const FileEntity = sqliteTable('files', {
	id: text('id').notNull().unique().primaryKey(),
	isDeleted: text('is_deleted'),
	creationTs: integer('creation_ts').notNull(),
	lastModifiedTs: integer('last_modified_ts').notNull(),
	deletedTs: integer('deleted_ts').notNull(),
});