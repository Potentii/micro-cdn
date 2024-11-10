import fs from 'fs/promises';
import fsOld from 'fs';
import path from 'path';
import Logger from "../../../utils/logger.mjs";
import mime from "mime";
import {ApiError, ApiErrorDetail, ResponseEnvelope} from "@potentii/rest-envelopes";
import {getCdnPathForUser} from "../../../utils/cdn-folder-utils.mjs";
import {expressjwt} from "express-jwt";
import {withToken} from "../../../utils/jwt-utils.mjs";
import Joi from "joi";
import {db} from "../../../repositories/db.mjs";
import {FileEntity} from "../../../repositories/entities/file-entity.mjs";
import {and, eq} from "drizzle-orm";


export default class FilesController {
	constructor(){}


	/**
	 *
	 * @param {Router} router
	 */
	static async setup(router){

		// router.use(express.urlencoded({ limit: '20gb', extended: true }));


		router.use(expressjwt({ ...withToken() }));


		const FILE_ID_REGEX = /^[-_\w\/\\.]+$/i;


		router.get(`/files/*`, async (req, res, next) => {
			const fileId = req.path.replace(/^\/files\//i, '');

			try{

				Joi.assert(fileId, Joi.string().required().regex(FILE_ID_REGEX).label(`$path.fileId`));

				const found = await db(req.auth.location)
					.select()
					.from(FileEntity)
					.where(and(eq(FileEntity.id, fileId), eq(FileEntity.isDeleted, 'false')))
					.limit(1);

				if(!found?.length){
					return res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${fileId}" could not be found`, [])))
						.end();
				}


				const filePath = path.join(getCdnPathForUser(req.auth), `./files`, fileId);

				const ext = path.extname(filePath).replace('.', '').toLowerCase();

				const mimeType = mime.getType(ext);

				let stream;
				if(mimeType.startsWith('video/')){


					// *If it's video/streamable:
					const stat = await fs.stat(filePath);
					const range = req.headers.range;
					const positions = range.replace(/bytes=/, '').split('-');
					const start = parseInt(positions[0], 10);
					const total = stat.size;
					const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
					const chunksize = (end - start) + 1;
					res.writeHead(206, {
						'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
						'Accept-Ranges': 'bytes',
						'Content-Length': chunksize,
						'Content-Type': mimeType,
					});
					stream = fsOld.createReadStream(filePath, { autoClose: true, start: start, end: end });


				} else{


					// *If it's static:
					stream = fsOld.createReadStream(filePath, { autoClose: true });


				}




				stream.on('open', () => {
					Logger.info(`GET_FILE:READ_START`, `Started to read/stream a file`, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });
					stream.pipe(res);
				});
				stream.on('error', err => {
					if(err.code === 'ENOENT'){
						res.status(404)
							.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${fileId}" could not be found`, [])))
							.end();
						return;
					}

					Logger.error(`GET_FILE:READ_ERR`, `Error reading file`, err, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });
					res.status(500).end();
				});


			} catch(err){
				if(err.code === 'ENOENT'){
					res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${fileId}" could not be found`, [])))
						.end();
				} else{
					Logger.error(`GET_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });
					res.status(500)
						.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
						.end();
				}
			}
		});


		router.delete(`/files/*`, async (req, res, next) => {
			const fileId = req.path.replace(/^\/files\//i, '');

			try{
				const now = new Date().getTime();

				const updateResult = await db(req.auth.location)
					.update(FileEntity)
					.set({ isDeleted: `true`, lastModifiedTs: now, deletedTs: now })
					.where(eq(FileEntity.id, fileId))
					.returning({ updatedId: FileEntity.id });

				if(!updateResult?.updatedId) {
					Logger.info(`DELETE_FILE:FILE_NOT_AVAILABLE`, `The file was already deleted or could not be found`, {rootPath: getCdnPathForUser(req.auth), fileId: fileId});
					return res.status(204).end();
				}

				Logger.info(`DELETE_FILE:FINISHED`, `Deleted existing file successfully`, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });

				res.status(204).end();
			} catch(err){
				Logger.error(`DELETE_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});


		router.post(`/files/*`, async (req, res, next) => {
			const fileId = req.path.replace(/^\/files\//i, '');

			try{
				Joi.assert(fileId, Joi.string().required().regex(FILE_ID_REGEX).label(`$path.fileId`));


				const filePath = path.join(getCdnPathForUser(req.auth), `./files`, fileId);


				try{
					const stat = await fs.stat(path.dirname(filePath));

					const found = await db(req.auth.location)
						.select()
						.from(FileEntity)
						.where(eq(FileEntity.id, fileId))
						.limit(1);

					if(found?.length){
						return res.status(422)
							.json(ResponseEnvelope.withError(ApiError.create(`INVALID_REQUEST`, `The request is not valid`, [ApiErrorDetail.create(`ALREADY_EXISTS`, `The file already exists`, `$path.fileId`, fileId)])))
							.end();
					}

				} catch (err) {
					if(err.code === 'ENOENT'){
						await fs.mkdir(path.dirname(filePath), { recursive: true });
					}
				}



				const newFileWriteStream = fsOld.createWriteStream(filePath);

				req.pipe(newFileWriteStream);

				await new Promise((resolve, reject) => {
					req.once('end', () => resolve());
					req.once('error', err => reject(err));
					newFileWriteStream.once('error', err => reject(err));
				});


				const now = new Date().getTime();

				const file = {
					id: fileId,
					isDeleted: `false`,
					creationTs: now,
					lastModifiedTs: now,
					deletedTs: null
				};

				await db(req.auth.location)
					.insert(FileEntity)
					.values(file);

				Logger.info(`CREATE_FILE:FINISHED`, `Created file successfully`, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });

				return res.status(201)
					.json(ResponseEnvelope.withData(file))
					.end();
			} catch(err){
				Logger.error(`CREATE_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:getCdnPathForUser(req.auth), fileId:fileId });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});
	}
}

