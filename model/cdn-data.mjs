import {TypeUtils} from "@potentii/type-utils";
import Bucket from "./bucket.mjs";

export default class CdnData{
	/**
	 * @type {Bucket[]}
	 */
	buckets;
	/**
	 * Key: The bucket unique name
	 * Value: The bucket object
	 * @type {Map<string,Bucket>}
	 */
	#bucketsMap = new Map();


	/**
	 *
	 * @param {Bucket[]} buckets
	 */
	constructor(buckets = []) {
		TypeUtils.instanceOf.checkArray('CdnData.buckets', buckets, Bucket, true, true);
		this.buckets = buckets;
		for (let bucket of this.buckets) {
			this.#bucketsMap.set(bucket.id, bucket);
		}
	}


	/**
	 *
	 * @param {CdnData|object} obj
	 * @return {CdnData}
	 */
	static from(obj){
		return new CdnData(
			obj.buckets?.map?.(Bucket.from) || [],
		);
	}


	/**
	 *
	 * @param {Bucket} newBucket
	 */
	addBucket(newBucket){
		TypeUtils.instanceOf.checkValue('CdnData.addBucket.newBucket', newBucket, Bucket, true);

		if(this.#bucketsMap.has(newBucket.id))
			throw new Error(`Cannot add bucket: The bucket "${newBucket.id}" already exists`);

		this.buckets.push(newBucket);
		this.#bucketsMap.set(newBucket.id, newBucket);
	}


	/**
	 *
	 * @param {string} bucketId
	 * @return {?Bucket}
	 */
	getBucketById(bucketId){
		return this.#bucketsMap.get(bucketId) || null;
	}
	/**
	 *
	 * @param {string} bucketId
	 * @return {boolean}
	 */
	hasBucketById(bucketId){
		return this.#bucketsMap.has(bucketId);
	}

}