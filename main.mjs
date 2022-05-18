import express from 'express';
import {createServer} from "http";
import cors from 'cors';
import CdnController from "./controllers/cdn/cdn-controller.mjs";
import CdnDataRepo from "./repositories/cdn-data-repo.mjs";
import Logger from "./utils/logger.mjs";
import CdnData from "./model/cdn-data.mjs";
import fs from "fs/promises";
import path from "path";
import {ApiError, ResponseEnvelope} from "@potentii/rest-envelopes";

const app = express();
const httpServer = createServer(app);

app.use(cors());


// Env variables:
// PORT -> The service port
// ROOT_PATH -> The root path where the service files (configs and content) will be stored
// MAX_FILE_SIZE_BYTES -> The max upload content size in bytes (not implemented yet)



(async () => {

	process.on('uncaughtException', (err, origin) => {
		Logger.error(`GENERAL_PROCESS_HANDLER:UNCAUGHT_ERR`, `Uncaught error`, err, { origin:origin });
	});


	if(!process.env.PORT)
		throw new Error(`Environment variable "PORT" not set`);
	if(!process.env.ROOT_PATH)
		throw new Error(`Environment variable "ROOT_PATH" not set`);


	Logger.info(`CDN_PATH_BUILD`, `Building CDN directory`);
	try{
		await fs.mkdir(path.join(process.env.ROOT_PATH), { recursive: true });
	} catch (err){
		Logger.error(`CDN_PATH_BUILD_ERR`, `Error building CDN directory`, err, { rootPath:process.env.ROOT_PATH });
		throw err;
	}
	Logger.info(`CDN_PATH_BUILD_FINISHED`, `Building CDN directory finished`);



	Logger.info(`CDN_DATA_INIT_READ`, `Reading CDN data`);
	try{
		const cdnData = await CdnDataRepo.get();
		if(!cdnData){
			const newCdnData = new CdnData([]);
			Logger.info(`CDN_DATA_INIT_READ_CREATE_NEW`, `Creating initial CDN data`, { newCdnData:newCdnData });
			await CdnDataRepo.save(newCdnData);
		}
	} catch (err){
		Logger.error(`CDN_DATA_INIT_READ_ERR`, err.message, err);
		throw err;
	}
	Logger.info(`CDN_DATA_INIT_READ_FINISHED`, `Reading CDN data finished`);



	const rootRouter = new express.Router();

	await CdnController.setup(rootRouter);

	app.use(`/`, rootRouter);

	app.use(`*`, (req, res, next) => {
		res.status(404).end();
	});

	app.use(`*`, (err, req, res, next) => {
		Logger.error(`GENERAL_HANDLER:UNCAUGHT_ERR`, `Uncaught error on "[${req.method}] ${req.originalUrl}"`, err, { method:req.method, path:req.originalUrl, reqBody:req.body, reqQuery:req.query });
		res.status(500)
			.json(ResponseEnvelope.withError(ApiError.create(`UNKNOWN_ERROR`, `Unknown error`, [])))
			.end();
	});



	const port = process.env.PORT || 3443;
	const server = httpServer.listen(port, () => {
		Logger.info(`SERVICE_STARTED`, `micro-cdn started @ http://localhost:${port}/`, { url:`http://localhost:${port}/`, port:port });
	});

	process.on('beforeExit', code => {
		Logger.info(`SERVICE_STOPPING`, `micro-cdn is stopping`, { code:code });
		server.close();
	});

	process.on('exit', code => {
		Logger.info(`SERVICE_STOPPED`, `micro-cdn stopped`, { code:code });
	});

})();
