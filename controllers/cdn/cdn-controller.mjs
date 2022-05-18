import express from 'express';
import BucketsController from "./buckets/buckets-controller.mjs";


export default class CdnController {
	constructor(){}


	/**
	 *
	 * @param {Router} router
	 */
	static async setup(router){

		const cdnRouter = new express.Router();

		await BucketsController.setup(cdnRouter);

		router.use(`/cdn`, cdnRouter);

	}
}