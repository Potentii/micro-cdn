import fs from 'fs/promises';
import fsOld from 'fs';
import path from 'path';
import mime from "mime";
import {ApiError, ApiErrorDetail, ResponseEnvelope} from "@potentii/rest-envelopes";
import {getCdnPathForUser} from "../../../utils/cdn-folder-utils.mjs";
import {expressjwt} from "express-jwt";
import {withToken, withTokenFromHeaderOrQuery} from "../../../utils/jwt-utils.mjs";
import Joi from "joi";
import {db} from "../../../repositories/db.mjs";
import {FileEntity} from "../../../repositories/entities/file-entity.mjs";
import {and, eq} from "drizzle-orm";
import express from "express";


export default class FilesController {
	constructor(){}


	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build(){

		const router = express.Router();

		// router.use(express.urlencoded({ limit: '20gb', extended: true }));


		router.use(expressjwt({ ...withToken(), ...withTokenFromHeaderOrQuery() }));


		const FILE_ID_REGEX = /^[-_\w\/\\.]+$/i;

		/**
		 * Extracts the fileId from the request parameters
		 * @param req
		 * @param res
		 * @return {string}
		 */
		function extractFileId(req, res){
			const fileIdParts = req.params.fileId;
			res.locals.logger.set({ fileIdParts: fileIdParts });
			Joi.assert(fileIdParts, Joi.array().required().items(Joi.string().required().regex(FILE_ID_REGEX).label(`$path.fileId[]`)).min(1).label(`$path.fileId`));
			const fileId = path.join(...fileIdParts).replaceAll('\\', '/');
			res.locals.logger.set({ fileId: fileId });
			return fileId;
		}



		router.get(`/files/*fileId`, async (req, res, next) => {
			try{
				const fileId = extractFileId(req, res);

				const userLocation = req.auth.location;
				res.locals.logger.set({ userLocation: userLocation });

				const found = await db(userLocation)
					.select()
					.from(FileEntity)
					.where(and(eq(FileEntity.id, fileId), eq(FileEntity.isDeleted, 'false')))
					.limit(1);

				if(!found?.length){
					throw ApiError.builder()
						.status(404)
						.internalCode(`GET_FILE:NOT_FOUND_ENTITY`)
						.code(`GET_FILE:NOT_FOUND`)
						.message(`The file "${fileId}" could not be found`)
						.build();
					//
					// return res.status(404)
					// 	.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${fileId}" could not be found`, [])))
					// 	.end();
				}


				const filePath = path.join(getCdnPathForUser(userLocation), `./files`, fileId);

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




				new Promise((resolve, reject) => {

					stream.on('open', () => {
						res.locals.logger.info(`GET_FILE:READ_START`, `Started to read/stream a file`);
						stream.pipe(res);
					});
					stream.on('close', code => {
						res.locals.logger.info(`GET_FILE:READ_CLOSED`, `Closed read/stream of file`, { code: code });
					});
					stream.on('end', () => {
						res.locals.logger.info(`GET_FILE:READ_END`, `Finished reading/streaming file`);
						resolve();
					});
					stream.on('error', err => {
						return reject(err);
						// if(err.code === 'ENOENT'){
						// 	return reject(
						// 		throw ApiError.builder()
						// 			.status(404)
						// 			.internalCode(`GET_FILE:NOT_FOUND_STREAM`)
						// 			.code(`GET_FILE:NOT_FOUND`)
						// 			.message(`The file "${fileId}" could not be found`)
						// 			.cause(err)
						// 			.build()
						// 	);
						// 	// res.status(404)
						// 	// 	.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${fileId}" could not be found`, [])))
						// 	// 	.end();
						// 	// return;
						// }
						//
						// res.locals.logger.error(`GET_FILE:READ_ERR`, `Error reading file`, err);
						// res.status(500).end();
					});

				});



			} catch(err){
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				if(err.code === 'ENOENT'){
					throw ApiError.builder()
						.status(404)
						.internalCode(`GET_FILE:NOT_FOUND`)
						.code(`GET_FILE:NOT_FOUND`)
						.message(`The file "${fileId}" could not be found`)
						.cause(err)
						.build();
				} else{
					throw ApiError.builder()
						.status(500)
						.internalCode(`GET_FILE:UNKNOWN_ERR`)
						.code(`GET_FILE:UNKNOWN_ERR`)
						.message(`Unknown error`)
						.cause(err)
						.build();
				}
			}
		});


		router.delete(`/files/*fileId`, async (req, res, next) => {
			try{
				const fileId = extractFileId(req, res);

				const userLocation = req.auth.location;
				res.locals.logger.set({ userLocation: userLocation });

				const now = new Date().getTime();

				const updateResult = await db(userLocation)
					.update(FileEntity)
					.set({ isDeleted: `true`, lastModifiedTs: now, deletedTs: now })
					.where(eq(FileEntity.id, fileId))
					.returning({ updatedId: FileEntity.id });

				if(!updateResult?.updatedId) {
					res.locals.logger.info(`DELETE_FILE:FILE_NOT_AVAILABLE`, `The file was already deleted or could not be found`);
					return res.status(204).end();
				}

				res.locals.logger.info(`DELETE_FILE:FINISHED`, `Deleted existing file successfully`);

				res.status(204).end();
			} catch(err){
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`DELETE_FILE:UNKNOWN_ERR`)
					.code(`DELETE_FILE:UNKNOWN_ERR`)
					.message(`Unknown error`)
					.cause(err)
					.build();
			}
		});


		router.post(`/files/*fileId`, async (req, res, next) => {

			try{
				const fileId = extractFileId(req, res);

				Joi.assert(fileId, Joi.string().required().regex(FILE_ID_REGEX).label(`$path.fileId`));

				const userLocation = req.auth.location;
				res.locals.logger.set({ userLocation: userLocation });

				const cdnPathUser = getCdnPathForUser(userLocation);
				const filePath = path.join(cdnPathUser, `./files`, fileId);
				res.locals.logger.set({ cdnPathUser: cdnPathUser });


				try{
					const stat = await fs.stat(path.dirname(filePath));

					const found = await db(userLocation)
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

				await db(userLocation)
					.insert(FileEntity)
					.values(file);

				res.locals.logger.info(`CREATE_FILE:FINISHED`, `Created file successfully`);

				return res.status(201)
					.json(ResponseEnvelope.withData(file))
					.end();
			} catch(err){
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`CREATE_FILE:UNKNOWN_ERR`)
					.code(`CREATE_FILE:UNKNOWN_ERR`)
					.message(`Unknown error`)
					.cause(err)
					.build();
			}
		});




		return router;
	}
}

