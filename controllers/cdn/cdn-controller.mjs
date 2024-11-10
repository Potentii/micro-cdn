import express from 'express';
import FilesController from "./files/files-controller.mjs";


export default class CdnController {
	constructor(){}


	/**
	 *
	 * @param {Router} router
	 */
	static async setup(router){

		const cdnRouter = new express.Router();

		await FilesController.setup(cdnRouter);

		router.use(`/cdn`, cdnRouter);

	}
}