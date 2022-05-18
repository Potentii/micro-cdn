import {TypeUtils} from "@potentii/type-utils";

export default class CreateBucketDto{
	/**
	 * @type {string}
	 */
	id;


	/**
	 *
	 * @param {string} id
	 */
	constructor(id) {
		TypeUtils.typeOf.checkValue('CreateBucketDto.id', id, 'string', true);
		this.id = id;
	}


	/**
	 *
	 * @param {CreateBucketDto|object} obj
	 * @return {CreateBucketDto}
	 */
	static from(obj){
		return new CreateBucketDto(
			obj.id,
		);
	}

}