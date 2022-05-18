import BucketFile from "./bucket-file.mjs";
import {TypeUtils} from "@potentii/type-utils";
import UniqueId from "../utils/unique-id.mjs";

export default class Bucket{
	/**
	 * The bucket unique name
	 * @type {string}
	 */
	id;
	/**
	 * @type {boolean}
	 */
	markedToDeletion;
	/**
	 * @type {BucketFile[]}
	 */
	files;
	/**
	 * @type {Map<string, BucketFile>}
	 */
	#filesMap = new Map();


	/**
	 *
	 * @param {string} id
	 * @param {boolean} [markedToDeletion]
	 * @param {BucketFile[]} [files]
	 */
	constructor(id, markedToDeletion = false, files = []) {
		TypeUtils.typeOf.checkValue('Bucket.id', id, 'string', true);
		TypeUtils.typeOf.checkValue('Bucket.markedToDeletion', markedToDeletion, 'boolean', true);
		TypeUtils.instanceOf.checkArray('Bucket.files', files, BucketFile, true, true);
		this.id = id;
		this.markedToDeletion = !!markedToDeletion;
		this.files = files;
		for (let file of this.files) {
			this.#filesMap.set(file.id, file);
		}
	}


	/**
	 *
	 * @param {Bucket|object} obj
	 * @return {Bucket}
	 */
	static from(obj){
		return new Bucket(
			obj.id,
			obj.markedToDeletion,
			obj.files?.map?.(BucketFile.from) || [],
		);
	}



	/**
	 *
	 * @param {BucketFile} newFile
	 */
	addFile(newFile){
		TypeUtils.instanceOf.checkValue('Bucket.addFile.newFile', newFile, BucketFile, true);

		if(newFile.bucketId !== this.id)
			throw new Error(`Cannot add file to bucket: Invalid bucket reference "${newFile.bucketId}", expected "${this.id}"`)

		if(this.#filesMap.has(newFile.id))
			throw new Error(`Cannot add file to bucket: The file "${newFile.id}" already exists in bucket "${this.id}"`);

		this.files.push(newFile);
		this.#filesMap.set(newFile.id, newFile);
	}


	/**
	 *
	 * @param {string} fileId
	 * @return {?BucketFile}
	 */
	getFileById(fileId){
		return this.#filesMap.get(fileId) || null;
	}
	/**
	 *
	 * @param {string} fileId
	 * @return {boolean}
	 */
	hasFileById(fileId){
		return this.#filesMap.has(fileId);
	}


	/**
	 *
	 * @param {string} extension (Without the dot)
	 * @return {string}
	 */
	generateNewFileId(extension){
		return UniqueId.newUniqueUUIDUsingMap(this.#filesMap, '', '.' + extension);
	}

}