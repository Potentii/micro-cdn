import {TypeUtils} from "@potentii/type-utils";

/**
 * @typedef {string} EMediaType
 */
/**
 * @enum {EMediaType}
 */
const E_MEDIA_TYPE = Object.freeze({
	VIDEO: 'VIDEO',
	IMAGE: 'IMAGE',
	UNKNOWN: 'UNKNOWN',
});

export default class BucketFile{
	/**
	 * @type {string}
	 */
	id;
	/**
	 * @type {string}
	 */
	bucketId;
	/**
	 * @type {string}
	 */
	extension;
	/**
	 * @type {string}
	 */
	mimeType;
	/**
	 * @type {boolean}
	 */
	markedToDeletion;

	/**
	 * @type {?EMediaType}
	 */
	#mediaType;



	/**
	 *
	 * @param {string} id
	 * @param {string} bucketId
	 * @param {string} extension
	 * @param {string} mimeType
	 * @param {boolean} [markedToDeletion]
	 */
	constructor(id, bucketId, extension, mimeType, markedToDeletion = false) {
		TypeUtils.typeOf.checkValue('BucketFile.id', id, 'string', true);
		TypeUtils.typeOf.checkValue('BucketFile.bucketId', bucketId, 'string', true);
		TypeUtils.typeOf.checkValue('BucketFile.extension', extension, 'string', true);
		TypeUtils.typeOf.checkValue('BucketFile.mimeType', mimeType, 'string', true);
		TypeUtils.typeOf.checkValue('BucketFile.markedToDeletion', markedToDeletion, 'boolean', true);
		this.id = id;
		this.bucketId = bucketId;
		this.extension = extension;
		this.mimeType = mimeType;
		this.markedToDeletion = !!markedToDeletion;
	}


	/**
	 *
	 * @param {BucketFile|object} obj
	 * @return {BucketFile}
	 */
	static from(obj){
		return new BucketFile(
			obj.id,
			obj.bucketId,
			obj.extension,
			obj.mimeType,
			obj.markedToDeletion,
		);
	}

	/**
	 *
	 * @enum {Readonly<EMediaType>}
	 * @constructor
	 */
	static get EMediaType(){
		return E_MEDIA_TYPE;
	}


	/**
	 *
	 * @type {EMediaType}
	 */
	get mediaType(){
		if(this.#mediaType)
			return this.#mediaType;

		if(/^(svg|png|jpg|jpeg|gif|webp)$/i.test(this.extension))
			return E_MEDIA_TYPE.IMAGE;

		if(/^(mp4|mpeg|mpg|mov|wmv|flv|avi|ts|webm)$/i.test(this.extension))
			return E_MEDIA_TYPE.VIDEO;

		return E_MEDIA_TYPE.UNKNOWN;
	}

}