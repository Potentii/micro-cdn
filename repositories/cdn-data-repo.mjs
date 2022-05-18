import fs from "fs/promises";
import path from "path";
import CdnData from "../model/cdn-data.mjs";
import {TypeUtils} from "@potentii/type-utils";

/**
 * @type {?CdnData}
 */
let dataCache;

export default class CdnDataRepo{


	/**
	 *
	 * @return {Promise<?CdnData>}
	 */
	static async get(){
		try{
			if(dataCache)
				return dataCache;

			const str = await fs.readFile(path.join(process.env.ROOT_PATH, `./data/cdn-data.json`), 'utf8');
			if(!str || !str.trim().length)
				return null;
			const obj = JSON.parse(str);
			if(!obj)
				return null;
			const data = CdnData.from(obj);
			dataCache = data;
			return data;
		} catch (err){
			if(err.code === 'ENOENT')
				return null;
			throw err;
		}
	}


	/**
	 *
	 * @param {CdnData} newData
	 * @return {Promise<void>}
	 */
	static async save(newData){
		TypeUtils.instanceOf.checkValue('CdnDataRepo.newData', newData, CdnData, true);

		try{
			await fs.access(path.join(process.env.ROOT_PATH, `./data`));
		} catch (err){
			if(err.code === 'ENOENT'){
				await fs.mkdir(path.join(process.env.ROOT_PATH, `./data`), { recursive: true });
			} else{
				throw err;
			}
		}

		await fs.writeFile(path.join(process.env.ROOT_PATH, `./data/cdn-data.json`), JSON.stringify(newData), 'utf8');
		dataCache = newData;
	}


}