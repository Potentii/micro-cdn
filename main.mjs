import express from 'express';
import {createServer} from "http";
import cors from 'cors';
import CdnController from "./controllers/cdn/cdn-controller.mjs";
import Logger from "./utils/logger.mjs";
import {ApiError, ResponseEnvelope} from "@potentii/rest-envelopes";
import process from "node:process";
import Joi from "joi";


process.on('uncaughtException', (err, origin) => {
	Logger.error(`GENERAL_PROCESS_HANDLER:UNCAUGHT_ERR`, `Uncaught error`, err, { origin:origin });
});


// *Validating the environment:
Joi.assert(process.env.PORT, Joi.number().required().min(0).label('$env.PORT'));
Joi.assert(process.env.TOKEN_PUBLIC_KEY, Joi.string().required().label('$env.TOKEN_PUBLIC_KEY'));

if(!process.env.TOKEN_PUBLIC_KEY.startsWith('-----BEGIN PUBLIC KEY-----'))
	process.env.TOKEN_PUBLIC_KEY = Buffer.from(process.env.TOKEN_PUBLIC_KEY, 'base64url').toString('utf8');


process.env.CDN_FOLDER_NAME = 'micro-cdn';




const app = express();
const httpServer = createServer(app);


app.use(cors());

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

