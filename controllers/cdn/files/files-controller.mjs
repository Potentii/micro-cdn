import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import stream from 'node:stream';
import {ApiError, ResponseEnvelope} from "@potentii/rest-envelopes";
import {getCdnPathForUser} from "../../../utils/cdn-folder-utils.mjs";
import {expressjwt} from "express-jwt";
import {withToken, withTokenFromHeaderOrQuery} from "../../../utils/jwt-utils.mjs";
import Joi from "joi";
import express from "express";
import VideoUtils from "../../../utils/video-utils.mjs";
import * as uuid from 'uuid';

/**
 * @typedef {'image'|'video'|'video-stream'|'unknown'} EFileType
 */


/**
 *
 * @param {string} filePath
 * @param {string} algorithm
 * @return {Promise<Hash>}
 */
async function getFileHash(filePath, algorithm = 'sha256') {
	const hash = crypto.createHash(algorithm);
	await stream.promises.pipeline(fs.createReadStream(filePath), hash);
	return hash;
}



/**
 *
 * @param {string} extension
 * @return {EFileType}
 */
function getType(extension) {
	if (/^\.(svg|png|jpg|jpeg|gif|webp|avif|avif-sequence)$/i.test(extension))
		return 'image';
	if (/^\.(mp4|mpeg|mpg|mov|wmv|flv|avi|webm)$/i.test(extension))
		return 'video';
	if (/^\.(mpd|m3u8)$/i.test(extension))
		return 'video-stream';
	return 'unknown';
}


/**
 * @typedef {{ type: ?EFileType, isPlaybackMedia: ?boolean, videoLengthSeconds: ?number, sizeBytes: ?number, isVrVideo: ?boolean, hash: ?string }} FileMetadata
 */

/**
 * @typedef {'type'|'isPlaybackMedia'|'videoLengthSeconds'|'sizeBytes'|'isVrVideo'|'hash'} EFileMetadataField
 */

/**
 *
 * @type {Set<EFileMetadataField>}
 */
const ALL_FILE_METADATA_FIELDS = new Set(['type','isPlaybackMedia','videoLengthSeconds','sizeBytes','isVrVideo','hash']);

/**
 *
 * @param req
 * @return {?Set<EFileMetadataField>}
 */
function extractFieldsQueryParam(req){
	if(!req.query?.fields)
		return null;

	let fields;
	if(Array.isArray(req.query.fields)){
		fields = req.query.fields;
	} else {
		try{
			fields = req.query.fields.split(',');
		} catch (err){
			throw ApiError.builder()
				.status(400)
				.internalCode(`GET_FILE_METADATA:INVALID_FIELDS_PARAM`)
				.code(`GET_FILE_METADATA:INVALID_FIELDS_PARAM`)
				.message(`Invalid fields query parameter`)
				.cause(err)
				.build();
		}
	}

	Joi.assert(fields, Joi.array().optional().allow(null).items(Joi.string().valid('*', 'type', 'isPlaybackMedia', 'videoLengthSeconds', 'sizeBytes', 'isVrVideo', 'hash').label(`$query.fields[i]`)).label(`$query.fields`));

	if(fields.includes('*'))
		return ALL_FILE_METADATA_FIELDS;

	return new Set(fields);
}






/**
 *
 * @param {string} filePath
 * @param {?Set<EFileMetadataField>} fields
 * @param {import('@potentii/logger-js-pino').Logger} logger
 * @return {Promise<FileMetadata>}
 */
async function getFileMetadata(filePath, fields, logger) {
	if(!fields || fields.size === 0){
		return {
			type: undefined,
			isPlaybackMedia: undefined,
			videoLengthSeconds: undefined,
			sizeBytes: undefined,
			isVrVideo: undefined,
			hash: undefined,
		}
	}

	let type = undefined;
	let isPlaybackMedia = undefined;
	let sizeBytes = undefined;
	let videoLengthSeconds = undefined;
	let isVrVideo = undefined;
	let hash = undefined;

	if(fields.has('type') || fields.has('isPlaybackMedia')){
		type = getType(path.extname(filePath));
		logger.set({type: type});

		if(fields.has('isPlaybackMedia') || fields.has('videoLengthSeconds') || fields.has('sizeBytes') || fields.has('isVrVideo')){
			const isPlaybackMedia = type === 'video' || type === 'video-stream';
			logger.set({isPlaybackMedia: isPlaybackMedia});


			if(fields.has('videoLengthSeconds') || fields.has('sizeBytes') || fields.has('isVrVideo')){
				let isVrVideo = false;
				if (isPlaybackMedia) {
					const probeMetadata = await VideoUtils.probe(filePath);
					logger.set({probeMetadata: probeMetadata});

					if (fields.has('sizeBytes')) {
						sizeBytes = VideoUtils.getVideoSizeFromMetadata(probeMetadata);
						logger.set({sizeBytes: sizeBytes});
					}
					if (fields.has('isVrVideo')) {
						isVrVideo = VideoUtils.hasVrMetadata(probeMetadata);
						logger.set({isVrVideo: isVrVideo});
					}
					if (fields.has('videoLengthSeconds')){
						videoLengthSeconds = VideoUtils.getVideoDurationInSecondsFromMetadata(probeMetadata);
						logger.set({videoLengthSeconds: videoLengthSeconds});
					}
				}


				if (fields.has('sizeBytes')) {
					if (!sizeBytes) {
						const stat = await fs.promises.stat(filePath);
						sizeBytes = stat.size;
						logger.set({sizeBytes: sizeBytes});
					}
				}
			}

		}
	}



	if(fields.has('hash')){
		hash = (await getFileHash(filePath, 'sha256')).digest('hex');
		logger.set({hash: hash});
	}



	return {
		type: fields.has('type') ? type : undefined,
		isPlaybackMedia: fields.has('isPlaybackMedia') ? isPlaybackMedia : undefined,
		videoLengthSeconds: fields.has('videoLengthSeconds') ? (videoLengthSeconds ? Number(videoLengthSeconds) : undefined) : undefined,
		sizeBytes: fields.has('sizeBytes') ? (sizeBytes ? Number(sizeBytes) : undefined) : undefined,
		isVrVideo: fields.has('isVrVideo') ? isVrVideo : undefined,
		hash: fields.has('hash') ? hash : undefined,
	};
}








export default class FilesController {
	constructor() {
	}


	/**
	 *
	 * @return {Promise<Router>}
	 */
	static async build() {

		const router = express.Router();

		// router.use(express.urlencoded({ limit: '20gb', extended: true }));


		router.use(expressjwt({...withToken(), ...withTokenFromHeaderOrQuery()}));


		const FILE_ID_REGEX = /^[-_\w\/\\.]+$/i;

		/**
		 * Extracts the fileId from the request parameters
		 * @param req
		 * @param res
		 * @return {string}
		 */
		function extractFileId(req, res) {
			const fileIdParts = req.params.fileId;
			res.locals.logger.set({ fileIdParts: fileIdParts });
			Joi.assert(fileIdParts, Joi.array().required().items(Joi.string().required().regex(FILE_ID_REGEX).label(`$path.fileId[]`)).min(1).label(`$path.fileId`));
			const fileId = path.join(...fileIdParts).replaceAll('\\', '/');
			res.locals.logger.set({ fileId: fileId });
			return fileId;
		}

		/**
		 * Extracts the fileId from the request parameters
		 * @param {?(string[])} fileId
		 * @return {string}
		 */
		function extractPathFromFileIdParam(fileId) {
			return Array.isArray(fileId) ? path.join(...fileId).replaceAll('\\', '/') : null;
		}


		function getFilePathFromFileId(userLocation, fileId) {
			const cdnPathUser = getCdnPathForUser(userLocation);
			return path.join(cdnPathUser, `./files`, fileId).replaceAll('\\', '/');
		}






		router.get(`/files/metadata/*fileId`, async (req, res, next) => {
			let fileId;
			try {
				res.locals.logger.info(`GET_FILE_METADATA:FINISHED`, `Get file metadata started`);

				const fields = extractFieldsQueryParam(req);
				res.locals.logger.set({ fields: fields?.keys() });

				fileId = extractFileId(req, res);

				const userLocation = req.auth.location;
				res.locals.logger.set({userLocation: userLocation});

				const filePath = path.join(getCdnPathForUser(userLocation), `./files`, fileId);


				const metadata = await getFileMetadata(filePath, fields, res.locals.logger);
				res.locals.logger.set({ metadata: metadata });


				const responsePayload = {
					fileId: fileId,
					internalFilePath: filePath,
					type: metadata.type,
					isPlaybackMedia: metadata.isPlaybackMedia,
					videoLengthSeconds: metadata.videoLengthSeconds,
					sizeBytes: metadata.sizeBytes,
					isVrVideo: metadata.isVrVideo,
					hash: metadata.hash,
				};
				res.locals.logger.set({responsePayload: responsePayload});


				res.locals.logger.info(`GET_FILE_METADATA:FINISHED`, `Get file metadata finished`);

				return res.status(200)
					.json(ResponseEnvelope.withData(responsePayload))
					.end();

			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				if (err.code === 'ENOENT') {
					throw ApiError.builder()
						.status(404)
						.internalCode(`GET_FILE_METADATA:NOT_FOUND`)
						.code(`GET_FILE_METADATA:NOT_FOUND`)
						.message(`The file "${fileId}" could not be found`)
						.cause(err)
						.build();
				} else {
					throw ApiError.builder()
						.status(500)
						.internalCode(`GET_FILE_METADATA:UNKNOWN_ERR`)
						.code(`GET_FILE_METADATA:UNKNOWN_ERR`)
						.message(`Unknown error`)
						.cause(err)
						.build();
				}
			}
		});







		router.head('/filesv2/*fileId', (req, res, next) => {
			const fileId = extractFileId(req, res);
			const dirPath = path.join(getCdnPathForUser(req.auth.location), `./files`);
			const filePath = path.join(dirPath, fileId);

			res.set({
				'X-Internal-File-Path': filePath.replaceAll('\\', '/'),
			});

			res.end();
		});


		router.get('/filesv2/*fileId', (req, res, next) => {
			const fileId = extractFileId(req, res);
			const dirPath = path.join(getCdnPathForUser(req.auth.location), `./files`);
			const filePath = path.join(dirPath, fileId);

			res.set({
				'X-Internal-File-Path': filePath.replaceAll('\\', '/'),
			});

			// *Preparing the request so express.static can find the file:
			req.url = fileId;

			// * Serving the file:
			express.static(dirPath)(req, res, next);
		});


		// router.get(`/files/*fileId`, async (req, res, next) => {
		// 	let fileId;
		// 	try {
		// 		fileId = extractFileId(req, res);
		//
		// 		const userLocation = req.auth.location;
		// 		res.locals.logger.set({userLocation: userLocation});
		//
		// 		const filePath = path.join(getCdnPathForUser(userLocation), `./files`, fileId);
		//
		// 		const ext = path.extname(filePath).replace('.', '').toLowerCase();
		//
		// 		const mimeType = mime.getType(ext);
		//
		//
		// 		let stream;
		// 		if (mimeType.startsWith('video/') && req.headers?.range?.trim?.().length) {
		//
		// 			// *If it's video/streamable:
		// 			const stat = await fs.promises.stat(filePath);
		// 			const range = req.headers.range;
		// 			const positions = range.replace(/bytes=/, '').split('-');
		// 			const start = parseInt(positions[0], 10);
		// 			const total = stat.size;
		// 			const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
		// 			const chunksize = (end - start) + 1;
		// 			res.writeHead(206, {
		// 				'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
		// 				'Accept-Ranges': 'bytes',
		// 				'Content-Length': chunksize,
		// 				'Content-Type': mimeType,
		// 			});
		// 			stream = fs.createReadStream(filePath, {autoClose: true, start: start, end: end});
		//
		// 		} else {
		//
		// 			// *If it's static:
		// 			stream = fs.createReadStream(filePath, {autoClose: true});
		//
		// 		}
		//
		//
		// 		new Promise((resolve, reject) => {
		//
		// 			stream.on('open', () => {
		// 				res.locals.logger.info(`GET_FILE:READ_START`, `Started to read/stream a file`);
		// 				stream.pipe(res);
		// 			});
		// 			stream.on('close', code => {
		// 				if (!res.writableEnded) {
		// 					stream.destroy();
		// 				}
		// 				res.locals.logger.info(`GET_FILE:READ_CLOSED`, `Closed read/stream of file`, {code: code});
		// 			});
		// 			stream.on('end', () => {
		// 				res.locals.logger.info(`GET_FILE:READ_END`, `Finished reading/streaming file`);
		// 				resolve();
		// 			});
		// 			stream.on('error', err => {
		// 				if (!res.headersSent) {
		// 					res.status(500).end();
		// 				}
		// 			});
		//
		// 		});
		//
		//
		// 	} catch (err) {
		// 		if (err instanceof ApiError)
		// 			throw err;
		// 		if (err instanceof Joi.ValidationError)
		// 			throw err;
		// 		if (err.code === 'ENOENT') {
		// 			throw ApiError.builder()
		// 				.status(404)
		// 				.internalCode(`GET_FILE:NOT_FOUND`)
		// 				.code(`GET_FILE:NOT_FOUND`)
		// 				.message(`The file "${fileId}" could not be found`)
		// 				.cause(err)
		// 				.build();
		// 		} else {
		// 			throw ApiError.builder()
		// 				.status(500)
		// 				.internalCode(`GET_FILE:UNKNOWN_ERR`)
		// 				.code(`GET_FILE:UNKNOWN_ERR`)
		// 				.message(`Unknown error`)
		// 				.cause(err)
		// 				.build();
		// 		}
		// 	}
		// });



		router.post(`/files/*fileId`, async (req, res, next) => {

			// TODO support thumbnail generation (using a control header or queryparam maybe) (must install ffmpeg/sharp)

			try {
				const fileId = extractFileId(req, res);

				res.locals.logger.info(`CREATE_FILE:STARTED`, `File creation started`);

				const copyFromFileId = req.get('X-Copy-From')?.trim() || undefined;
				Joi.assert(copyFromFileId, Joi.string().optional().allow(null).label(`$headers.X-Copy-From`));
				res.locals.logger.set({ copyFromFileId: copyFromFileId });

				const copyFromPath = copyFromFileId.length ? getFilePathFromFileId(req.auth.location, copyFromFileId) : null;
				res.locals.logger.set({ copyFromPath: copyFromPath });


				// const contentType = req.headers?.['Content-Type']?.trim();
				// Joi.assert(contentType, Joi.string().required().label(`$headers.Content-Type`));
				//
				// const extension = mime.getExtension(contentType);
				// res.locals.logger.set({ extension: extension });
				// if (!extension)
				// 	throw ApiError.builder()
				// 		.status(400)
				// 		.internalCode(`CREATE_FILE:UNKNOWN_CONTENT_TYPE`)
				// 		.code(`CREATE_FILE:UNKNOWN_CONTENT_TYPE`)
				// 		.message(`Unknown content type "${contentType}"`)
				// 		.build();


				// const bucket = req.headers?.['X-File-Bucket']?.trim().replaceAll('\\', '/');
				// Joi.assert(bucket, Joi.string().optional().allow(null).label(`$headers.X-File-Bucket`));


				// const fileName = uuid.v4() + '.' + extension;
				// const fileId = (bucket ? path.join(bucket, fileName) : fileName).replaceAll('\\', '/');
				// res.locals.logger.set({ fileId: fileId });

				// const userLocation = req.auth.location;
				// res.locals.logger.set({ userLocation: userLocation });
				//
				// const cdnPathUser = getCdnPathForUser(userLocation);
				// const filePath = path.join(cdnPathUser, `./files`, fileId);
				// res.locals.logger.set({ cdnPathUser: cdnPathUser });

				const filePath = getFilePathFromFileId(req.auth.location, fileId);
				res.locals.logger.set({ filePath: filePath });

				if(fs.existsSync(filePath)){
					throw ApiError.builder()
						.status(409)
						.internalCode(`CREATE_FILE:ALREADY_EXISTS`)
						.code(`CREATE_FILE:ALREADY_EXISTS`)
						.message(`File ID already exists`)
						.build();
				}

				try {
					const stat = await fs.promises.stat(path.dirname(filePath));
				} catch (err) {
					if (err.code === 'ENOENT') {
						await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
					}
				}

				const newFileWriteStream = fs.createWriteStream(filePath, { autoClose: true });

				let readStream;
				if(copyFromPath){
					readStream = fs.createReadStream(copyFromPath, { autoClose: true });
				} else{
					readStream = req;
				}

				readStream.pipe(newFileWriteStream);

				await new Promise((resolve, reject) => {
					readStream.once('end', () => resolve());
					readStream.once('error', err => reject(err));
					newFileWriteStream.once('error', err => reject(err));
				});
				res.locals.logger.set({ uploadDone: true });


				const metadata = await getFileMetadata(filePath, ALL_FILE_METADATA_FIELDS, res.locals.logger);
				res.locals.logger.set({ metadataDone: true });


				const responsePayload = {
					fileId: fileId,
					internalFilePath: filePath,
					type: metadata.type,
					isPlaybackMedia: metadata.isPlaybackMedia,
					videoLengthSeconds: metadata.videoLengthSeconds,
					sizeBytes: metadata.sizeBytes,
					isVrVideo: metadata.isVrVideo,
					hash: metadata.hash,
				};
				res.locals.logger.set({responsePayload: responsePayload});


				res.locals.logger.info(`CREATE_FILE:FINISHED`, `Created file successfully`);

				return res.status(201)
					.json(ResponseEnvelope.withData(responsePayload))
					.end();
			} catch (err) {
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




		router.patch(`/files/*fileId`, async (req, res, next) => {

			try {
				const fileId = extractFileId(req, res);

				res.locals.logger.info(`CHANGE_FILE:STARTED`, `File change started`);

				const filePath = getFilePathFromFileId(req.auth.location, fileId);
				res.locals.logger.set({ filePath: filePath });


				const newFileId = req.headers?.['X-New-File-Id']?.trim();
				Joi.assert(newFileId, Joi.string().optional().allow(null).label(`$headers.X-New-File-Id`));

				if(newFileId){
					res.locals.logger.set({ newFileId: newFileId });

					const newFilePath = getFilePathFromFileId(req.auth.location, newFileId);
					res.locals.logger.set({ newFilePath: newFilePath });

					if(fs.existsSync(newFilePath)){
						throw ApiError.builder()
							.status(409)
							.internalCode(`CHANGE_FILE:ALREADY_EXISTS`)
							.code(`CHANGE_FILE:ALREADY_EXISTS`)
							.message(`New file ID already exists`)
							.build();
					}

					await fs.promises.rename(filePath, newFilePath);
					res.locals.logger.set({ moveDone: true });
				}

				res.locals.logger.info(`CHANGE_FILE:FINISHED`, `File change finished successfully`);

				return res.status(204)
					.end();
			} catch (err) {
				if (err instanceof ApiError)
					throw err;
				if (err instanceof Joi.ValidationError)
					throw err;
				throw ApiError.builder()
					.status(500)
					.internalCode(`CHANGE_FILE:UNKNOWN_ERR`)
					.code(`CHANGE_FILE:UNKNOWN_ERR`)
					.message(`Unknown error`)
					.cause(err)
					.build();
			}
		});



		router.delete(`/files/*fileId`, async (req, res, next) => {
			try {
				const fileId = extractFileId(req, res);

				res.locals.logger.info(`DELETE_FILE:STARTED`, `File deletion started`);

				const filePath = getFilePathFromFileId(req.auth.location, fileId);
				res.locals.logger.set({ filePath: filePath });

				const trashedFilePath = getFilePathFromFileId(req.auth.location, path.join(`.trash`, path.dirname(fileId), uuid.v4() + '__' + path.basename(fileId)));

				await fs.promises.mkdir(path.dirname(trashedFilePath), {recursive: true});

				await fs.promises.rename(filePath, trashedFilePath);

				res.locals.logger.info(`DELETE_FILE:FINISHED`, `File deletion finished successfully`);

				res.status(204).end();
			} catch (err) {
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


		return router;
	}
}

