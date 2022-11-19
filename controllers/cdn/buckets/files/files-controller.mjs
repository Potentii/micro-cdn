import fs from 'fs/promises';
import fsOld from 'fs';
import path from 'path';
import express from 'express';
import Logger from "../../../../utils/logger.mjs";
import mime from "mime";
import CdnDataRepo from "../../../../repositories/cdn-data-repo.mjs";
import {ApiError, ResponseEnvelope} from "@potentii/rest-envelopes";
import BucketFile from "../../../../model/bucket-file.mjs";


export default class FilesController {
	constructor(){}


	/**
	 *
	 * @param {Router} router
	 */
	static async setup(router){

		router.use(express.urlencoded({ limit: '20gb', extended: true }));


		router.get(`/files/:fileId`, async (req, res, next) => {
			const fileId = req.params.fileId;
			const bucketId = res.locals.bucketId;

			try{
				const cdnData = await CdnDataRepo.get();

				const bucket = cdnData.getBucketById(bucketId);
				if(!bucket || bucket.markedToDeletion)
					return res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The bucket "${bucketId}" could not be found`, [])))
						.end();

				const file = bucket.getFileById(fileId);
				if(!file || file.markedToDeletion)
					return res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${bucketId}/${fileId}" could not be found`, [])))
						.end();

				const filePath = path.join(process.env.ROOT_PATH, `./buckets`, bucketId, fileId);

				let stream;
				switch (file.mediaType){

					case BucketFile.EMediaType.VIDEO: {
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
							'Content-Type': file.mimeType,
						});
						stream = fsOld.createReadStream(filePath, { autoClose: true, start: start, end: end });
						break;
					}


					default: {
						stream = fsOld.createReadStream(filePath, { autoClose: true });
						break;
					}

				}


				stream.on('open', () => {
					Logger.info(`GET_FILE:READ_START`, `Started to read/stream a file`, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
					stream.pipe(res);
				});
				stream.on('error', err => {
					Logger.error(`GET_FILE:READ_ERR`, `Error reading file`, err, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
					res.status(500).end();
				});


			} catch(err){
				if(err.code === 'ENOENT'){
					res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The file "${bucketId}/${fileId}" could not be found`, [])))
						.end();
				} else{
					Logger.error(`GET_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
					res.status(500)
						.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
						.end();
				}
			}
		});


		router.delete(`/files/:fileId`, async (req, res, next) => {
			const fileId = req.params.fileId;
			const bucketId = res.locals.bucketId;

			try{
				const cdnData = await CdnDataRepo.get();

				const bucket = cdnData.getBucketById(bucketId);
				if(!bucket || bucket.markedToDeletion) {
					Logger.info(`DELETE_FILE:FINISHED_BUCKET_NOT_AVAILABLE`, `The file's bucket was already deleted or could not be found`, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
					return res.status(204).end();
				}

				const file = bucket.getFileById(fileId);
				if(!file || file.markedToDeletion) {
					Logger.info(`DELETE_FILE:FINISHED_FILE_NOT_AVAILABLE`, `The file was already deleted or could not be found`, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
					return res.status(204).end();
				}

				file.markedToDeletion = true;

				await CdnDataRepo.save(cdnData);

				Logger.info(`DELETE_FILE:FINISHED`, `Deleted existing file successfully`, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });

				res.status(204).end();
			} catch(err){
				Logger.error(`DELETE_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});


		router.post(`/files`, async (req, res, next) => {
			const bucketId = res.locals.bucketId;

			try{
				const cdnData = await CdnDataRepo.get();

				const bucket = cdnData.getBucketById(bucketId);
				if(!bucket || bucket.markedToDeletion)
					return res.status(404)
						.json(ResponseEnvelope.withError(ApiError.create(`NOT_FOUND`, `The bucket "${bucketId}" could not be found`, [])))
						.end();

				const content = req.body.content;

				const match = /^data:(?<mimeType>.+?\/.+?);base64,(?<base64>.*)$/i.exec(content);

				const mimeType = match?.groups?.mimeType?.toLowerCase?.();
				if(!mimeType || !mimeType.trim().length)
					return res.status(400)
						.json(ResponseEnvelope.withError(ApiError.create(`INVALID_BASE64`, `Invalid base64 content`, [])))
						.end();

				const extension = mime.getExtension(mimeType)?.toLowerCase?.()?.replace?.('.', '');
				if(!extension || !extension.trim().length)
					return res.status(400)
						.json(ResponseEnvelope.withError(ApiError.create(`INVALID_BASE64`, `Invalid base64 content`, [])))
						.end();

				const base64 = match?.groups?.base64;
				if(!base64 || !base64.trim().length)
					return res.status(400)
						.json(ResponseEnvelope.withError(ApiError.create(`INVALID_BASE64`, `Invalid base64 content`, [])))
						.end();

				const fileId = bucket.generateNewFileId(extension);

				const filePath = path.join(process.env.ROOT_PATH, `./buckets`, bucketId, fileId);

				const base64Buffer = new Buffer(base64, 'base64');

				await fs.writeFile(filePath, base64Buffer);

				const file = new BucketFile(fileId, bucketId, extension, mimeType, false);
				bucket.addFile(file);
				await CdnDataRepo.save(cdnData);

				Logger.info(`CREATE_FILE:FINISHED`, `Created file successfully`, { rootPath:process.env.ROOT_PATH, bucketId:bucketId, fileId:fileId, file:file });

				return res.status(201)
					.json(ResponseEnvelope.withData(file))
					.end();
			} catch(err){
				Logger.error(`CREATE_FILE:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:process.env.ROOT_PATH, bucketId:bucketId });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});
	}
}

