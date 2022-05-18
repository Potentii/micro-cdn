import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import Logger from "../../../utils/logger.mjs";
import FilesController from "./files/files-controller.mjs";
import CdnDataRepo from "../../../repositories/cdn-data-repo.mjs";
import {ApiError, RequestEnvelope, ResponseEnvelope} from "@potentii/rest-envelopes";
import CreateBucketDto from "./create-bucket-dto.mjs";
import Bucket from "../../../model/bucket.mjs";


export default class BucketsController {
	constructor(){}


	/**
	 *
	 * @param {Router} router
	 */
	static async setup(router){

		const GET_BUCKET_ID_VALIDATION_REGEX = () => /[^\w\d-_]/i;


		router.use(`/buckets/:bucketId`, (req, res, next) => {
			const bucketId = req.params.bucketId;

			if(GET_BUCKET_ID_VALIDATION_REGEX().test(bucketId)){
				return res.status(400)
					.json(ResponseEnvelope.withError(ApiError.create(`INVALID_BUCKET_ID`, `The bucket id is not valid "${bucketId}"`, [])))
					.end();
			}

			/**
			 * @type {string}
			 */
			res.locals.bucketId = bucketId;

			next();
		});



		router.delete(`/buckets/:bucketId`, async (req, res, next) => {
			const bucketId = res.locals.bucketId;

			try {
				const cdnData = await CdnDataRepo.get();
				const bucket = cdnData.getBucketById(bucketId);
				if(!bucket || bucket.markedToDeletion)
					return res.status(200).end();

				bucket.markedToDeletion = true;

				await CdnDataRepo.save(cdnData);

				res.status(200).end();

			} catch (err){
				Logger.error(`DELETE_BUCKET:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:process.env.ROOT_PATH, bucketId:bucketId });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});


		router.post(`/buckets`, async (req, res, next) => {
			try{
				const reqEnvelope = RequestEnvelope.from(req.body);
				const dto = CreateBucketDto.from(reqEnvelope.data);
				const bucketId = dto.id;

				if(GET_BUCKET_ID_VALIDATION_REGEX().test(bucketId)){
					return res.status(400)
						.json(ResponseEnvelope.withError(ApiError.create(`INVALID_BUCKET_ID`, `The bucket id is not valid "${bucketId}"`, [])))
						.end();
				}

				const cdnData = await CdnDataRepo.get();
				if(cdnData.hasBucketById(bucketId))
					return res.status(422)
						.json(ResponseEnvelope.withError(ApiError.create(`BUCKET_ALREADY_EXISTS`, `The bucket "${bucketId}" already exists`, [])))
						.end();


				const newBucket = new Bucket(bucketId, false, []);

				cdnData.addBucket(newBucket);

				await fs.mkdir(path.join(process.env.ROOT_PATH, `./buckets`, bucketId), { recursive: true });

				await CdnDataRepo.save(cdnData);

				res.status(201).end();

			} catch(err){
				Logger.error(`CREATE_BUCKET:UNKNOWN_ERR`, `Unknown error`, err, { rootPath:process.env.ROOT_PATH, body:req.params.body });
				res.status(500)
					.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
					.end();
			}
		});


		const bucketsRouter = new express.Router();

		await FilesController.setup(bucketsRouter);

		router.use(`/buckets/:bucketId`, bucketsRouter);
	}
}
